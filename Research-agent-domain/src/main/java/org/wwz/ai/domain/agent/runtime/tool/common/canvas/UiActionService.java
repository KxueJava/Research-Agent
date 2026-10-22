package org.wwz.ai.domain.agent.runtime.tool.common.canvas;
import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.serializer.SerializerFeature;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.function.LongSupplier;

/** Registered capabilities only. Acceptance/claim/completion are durable; tools run outside DB locks. */
public final class UiActionService {
  public record Request(String surfaceId,String componentId,String actionId,long baseRevision,String idempotencyKey,Map<String,Object> payload){}
  public record Output(List<Map<String,Object>> patches,List<Map<String,Object>> resources,String summary){}
  @FunctionalInterface public interface Tool {Output execute(UiActionExecution execution) throws Exception;}
  public record Capability(boolean approvalRequired,boolean externalWrites,Tool tool){}
  private final UiActionStore store;private final UiSurfaceStore surfaces;private final Map<String,Capability> capabilities;private final Executor executor;private final LongSupplier clock;
  private final java.util.function.BooleanSupplier enabled;
  public UiActionService(UiActionStore store,UiSurfaceStore surfaces,Map<String,Capability> capabilities,Executor executor,LongSupplier clock){this(store,surfaces,capabilities,executor,clock,()->true);}
  public UiActionService(UiActionStore store,UiSurfaceStore surfaces,Map<String,Capability> capabilities,Executor executor,LongSupplier clock,java.util.function.BooleanSupplier enabled){this.store=store;this.surfaces=surfaces;this.capabilities=Map.copyOf(capabilities);this.executor=executor;this.clock=clock;this.enabled=enabled;}
  public Set<String> capabilityNames(){return enabled.getAsBoolean()?capabilities.keySet():Set.of();}
  private void requireEnabled(){if(!enabled.getAsBoolean())throw new IllegalStateException("Remote actions are disabled; existing results remain readable and cancellable");}

  @SuppressWarnings("unchecked") public UiActionExecution submit(String session,String owner,Request request){
    requireEnabled();
    for(String value:List.of(Objects.toString(request.surfaceId(),""),Objects.toString(request.componentId(),""),Objects.toString(request.actionId(),""),Objects.toString(request.idempotencyKey(),"")))identifier(value);
    if(request.baseRevision()<1||request.payload()==null||JSON.toJSONString(request.payload()).length()>65536)throw new IllegalArgumentException("Invalid Action request");
    String id="action-"+digest(List.of(session,owner,request.idempotencyKey()));String fingerprint=digest(List.of(request.surfaceId(),request.componentId(),request.actionId(),request.baseRevision(),request.payload()));
    try{var previous=store.read(session,owner,id);if(!previous.fingerprint().equals(fingerprint))throw new IllegalStateException("Idempotency key conflicts with original request");return get(session,owner,id);}catch(SecurityException missing){/* Creation still checks authenticated ownership under lock. */}
    var document=surfaces.read(session,owner,request.surfaceId());
    if(((Number)document.get("revision")).longValue()!=request.baseRevision())throw new IllegalStateException("Surface revision conflict");
    if(document.get("stream") instanceof Map<?,?> stream&&"committed".equals(stream.get("status")))throw new IllegalStateException("Surface generation active");
    var node=findNode(document.get("tree"),request.componentId());
    if(node==null||!(node.get("props") instanceof Map<?,?> props)||!(props.get("remoteAction") instanceof Map<?,?> binding)||!Objects.equals(binding.get("id"),request.actionId()))throw new IllegalArgumentException("Component Action not registered on this Surface version");
    String capability=Objects.toString(binding.get("capability"),"");var registered=capabilities.get(capability);if(registered==null)throw new IllegalArgumentException("Capability unavailable");
    var resolvedBinding=new LinkedHashMap<String,Object>();binding.forEach((k,v)->resolvedBinding.put(String.valueOf(k),v));resolvedBinding.remove("targetPath");
    if(binding.get("targetId") instanceof String target){String path=findPath(document.get("tree"),target,"/root");if(path==null)throw new IllegalArgumentException("Action target not found");resolvedBinding.put("targetPath",path+"/children");}
    var data=new LinkedHashMap<String,Object>();data.put("id",id);data.put("sessionId",session);data.put("ownerId",owner);data.put("surfaceId",request.surfaceId());data.put("componentId",request.componentId());data.put("actionId",request.actionId());data.put("baseRevision",request.baseRevision());
    data.put("idempotencyKey",request.idempotencyKey());data.put("fingerprint",fingerprint);data.put("payload",request.payload());data.put("binding",resolvedBinding);data.put("capability",capability);data.put("externalWrites",registered.externalWrites());data.put("createdAt",clock.getAsLong());data.put("updatedAt",clock.getAsLong());data.put("approvalExpiresAt",clock.getAsLong()+300000);data.put("cancelRequested",false);data.put("effectState","not_started");data.put("status",registered.approvalRequired()?"approval_required":"accepted");
    data.put("executionRevision",1L);var execution=store.create(new UiActionExecution(data));schedule(execution);return store.read(session,owner,id);
  }
  public UiActionExecution get(String session,String owner,String id){
    var value=store.read(session,owner,id);
    if("approval_required".equals(value.status())&&clock.getAsLong()>=((Number)value.data().get("approvalExpiresAt")).longValue())return decide(session,owner,id,false);
    // A queued runnable is not durable. Reclaim only accepted work after its dispatch lease expires.
    // Atomic accepted -> running remains the execution fence, including for a late original runnable.
    if("accepted".equals(value.status())){schedule(value);return store.read(session,owner,id);}
    return value;
  }
  public List<UiActionExecution> list(String session,String owner,String surface){return store.list(session,owner,surface).stream().map(e->get(session,owner,e.id())).toList();}
  public UiActionExecution decide(String session,String owner,String id,boolean approved){
    if(approved)requireEnabled();
    var value=store.update(session,owner,id,e->{
      if(!"approval_required".equals(e.status()))return e;
      boolean expired=clock.getAsLong()>=((Number)e.data().get("approvalExpiresAt")).longValue();
      return expired||!approved?e.change("failed",Map.of("errorCode",expired?"APPROVAL_EXPIRED":"APPROVAL_REJECTED","error",expired?"Approval expired":"Approval rejected","updatedAt",clock.getAsLong())):e.change("accepted",Map.of("approvedAt",clock.getAsLong(),"updatedAt",clock.getAsLong()));
    });schedule(value);return store.read(session,owner,id);
  }
  public UiActionExecution cancel(String session,String owner,String id){return store.update(session,owner,id,e->{
    if(e.terminal())return e;
    return e.change("running".equals(e.status())?"running":"cancelled",Map.of("cancelRequested",true,"updatedAt",clock.getAsLong(),"effectState","running".equals(e.status())?"pending_reconciliation":"not_applied"));
  });}
  private void schedule(UiActionExecution value){
    if(!enabled.getAsBoolean())return;
    if(!"accepted".equals(value.status()))return;var claimed=new AtomicBoolean();
    store.update(value.sessionId(),value.ownerId(),value.id(),e->{
      long lease=e.data().get("dispatchLeaseUntil") instanceof Number n?n.longValue():0;
      if(!"accepted".equals(e.status())||Boolean.TRUE.equals(e.data().get("scheduled"))&&lease>clock.getAsLong())return e;
      claimed.set(true);return e.change("accepted",Map.of("scheduled",true,"dispatchLeaseUntil",clock.getAsLong()+30000));
    });
    if(claimed.get())try{executor.execute(()->run(value.sessionId(),value.ownerId(),value.id()));}catch(RuntimeException error){fail(value.sessionId(),value.ownerId(),value.id(),"EXECUTOR_UNAVAILABLE",error);}
  }
  private void run(String session,String owner,String id){
    if(!enabled.getAsBoolean())return;
    var claimed=new AtomicBoolean();
    try{
      var execution=store.update(session,owner,id,e->{if(!"accepted".equals(e.status()))return e;
        var current=surfaces.read(session,owner,e.surfaceId());if(((Number)current.get("revision")).longValue()!=e.baseRevision())throw new IllegalStateException("Surface changed before execution");
        claimed.set(true);return e.change("running",Map.of("startedAt",clock.getAsLong(),"updatedAt",clock.getAsLong(),"effectState",Boolean.TRUE.equals(e.data().get("externalWrites"))?"unknown":"not_applied"));
      });if(!claimed.get())return;
      var capability=capabilities.get(String.valueOf(execution.data().get("capability")));var output=capability.tool().execute(execution);
      store.update(session,owner,id,e->{
        if(!"running".equals(e.status()))return e;
        if(e.cancelRequested()&&!capability.externalWrites())return e.change("cancelled",Map.of("effectState","not_applied","updatedAt",clock.getAsLong()));
        var snapshot=surfaces.applyAction(session,e.surfaceId(),e.id(),e.baseRevision(),output.patches(),output.resources());
        return e.change("completed",Map.of("effectState","applied","updatedAt",clock.getAsLong(),"result",Map.of("surface",snapshot,"resources",snapshot.getOrDefault("resources",output.resources()),"summary",output.summary())));
      });
    }catch(Exception error){fail(session,owner,id,"EXECUTION_FAILED",error);}
  }
  private void fail(String session,String owner,String id,String code,Exception error){
    try{store.update(session,owner,id,e->e.terminal()?e:e.change("failed",Map.of("errorCode",code,"error",Objects.toString(error.getMessage(),"Execution failed"),"updatedAt",clock.getAsLong(),"effectState",Boolean.TRUE.equals(e.data().get("externalWrites"))&&"running".equals(e.status())?"unknown":"not_applied")));}catch(RuntimeException ignored){/* Preserve durable running/unknown rather than inventing success. */}
  }
  @SuppressWarnings("unchecked") public static Map<String,Object> findNode(Object tree,String nodeId){
    if(!(tree instanceof Map<?,?> node))return null;if(node.containsKey("root"))return findNode(node.get("root"),nodeId);
    if(Objects.equals(node.get("nodeId"),nodeId))return (Map<String,Object>)node;
    if(node.get("children") instanceof List<?> children)for(Object child:children){var found=findNode(child,nodeId);if(found!=null)return found;}return null;
  }
  public static String digest(Object value){try{return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(JSON.toJSONString(value,SerializerFeature.MapSortField,SerializerFeature.SortField).getBytes(StandardCharsets.UTF_8)));}catch(Exception e){throw new IllegalArgumentException("Invalid request",e);}}
  private static String findPath(Object tree,String id,String path){if(!(tree instanceof Map<?,?> node))return null;if(node.containsKey("root"))return findPath(node.get("root"),id,path);if(Objects.equals(node.get("nodeId"),id))return path;if(node.get("children") instanceof List<?> children)for(int i=0;i<children.size();i++){var found=findPath(children.get(i),id,path+"/children/"+i);if(found!=null)return found;}return null;}
  public static void identifier(String value){if(value==null||value.isBlank()||value.length()>128||value.chars().anyMatch(Character::isISOControl))throw new IllegalArgumentException("Invalid identity");}
}
