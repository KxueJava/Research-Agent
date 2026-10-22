package org.wwz.ai.domain.agent.runtime.tool.common.canvas;

import com.alibaba.fastjson.JSON;
import org.wwz.ai.domain.agent.runtime.agent.AgentContext;
import java.util.*;
import java.util.function.LongSupplier;

/** Per-tool-call generation, owned by one request; only declarative UI is committed early. */
public final class UiStreamGeneration {
    private final AgentContext context;
    private final UiSurfaceStore store;
    private final LongSupplier clock;
    private final String generationId="gen-"+UUID.randomUUID(),surfaceId="stream-"+UUID.randomUUID();
    private final long startedAt;
    private long sequence,firstUsefulAt,lastCommitAt;
    private String digest="";
    private Map<String,Object> latest;
    private boolean closed;
    private Runnable unsubscribeCancellation=()->{};
    public UiStreamGeneration(AgentContext context,LongSupplier clock) {
        this.context=context;this.clock=clock;this.startedAt=clock.getAsLong();this.store=UiSurfaceTools.store(context);
        if(context.getRunCancellation()!=null)unsubscribeCancellation=context.getRunCancellation().onCancel(()->stop("cancelled"));
    }
    public synchronized void offer(String arguments,boolean force) {
        if(isTerminal() || sequence>=64 || arguments==null || arguments.length()>1_048_576)return;
        if(org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner.UiPresentationRuntime.enabled(context)&&context.getUiPresentationSession().exhausted()){stop("failed");return;}
        if(context.isTurnClosed()) {stop("failed");return;}
        if(context.isRunCancelled()) {stop("cancelled");return;}
        long now=clock.getAsLong();if(sequence>0&&now-lastCommitAt<100)return;
        Map<String,Object> candidate=JsonUiPrefix.preview(arguments);
        if(candidate==null)return;
        try {
            candidate=UiStreamCommit.normalize(candidate,false);
            org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner.UiPresentationRuntime.checkTree(context,candidate,true,null);
            String next=JSON.toJSONString(candidate);
            if(next.equals(digest))return;
            commit("committed",candidate);digest=next;
        } catch(RuntimeException ignored) { /* Invalid/incomplete blocks and unavailable context stay in staging; A remains authoritative. */ }
    }
    public synchronized Map<String,Object> complete(Object tree) {
        if(context.isTurnClosed()) {stop("failed");throw new IllegalStateException("UI run closed");}
        if(context.isRunCancelled()) {stop("cancelled");throw new IllegalStateException("UI generation cancelled");}
        if(isTerminal()) {
            if(latest!=null && "completed".equals(((Map<?,?>)latest.get("stream")).get("status")))return latest;
            throw new IllegalStateException("UI generation is terminal");
        }
        try {
            org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner.UiPresentationRuntime.checkTree(context,tree,false,null);
            commit("completed",UiStreamCommit.normalize(tree,true));return latest;
        }
        catch(RuntimeException error) {stop("failed");throw error;}
    }
    public synchronized void stop(String status) {
        if(!Set.of("cancelled","failed").contains(status))throw new IllegalArgumentException("Invalid terminal state");
        if(latest==null||isTerminal()){closed=true;unsubscribeCancellation.run();return;}
        commit(status,null);
    }
    private boolean isTerminal() {return closed || latest!=null&&!"committed".equals(((Map<?,?>)latest.get("stream")).get("status"));}
    private void commit(String status,Object tree) {
        long now=Math.max(clock.getAsLong(),Math.max(startedAt,lastCommitAt));if(sequence==0)firstUsefulAt=now;
        long base=latest==null?0:((Number)latest.get("revision")).longValue();
        Map<String,Object> event=new LinkedHashMap<>();
        event.put("protocol",UiStreamCommit.PROTOCOL);event.put("sessionId",context.getSessionId());event.put("surfaceId",surfaceId);
        event.put("messageId",context.getRequestId());event.put("generationId",generationId);event.put("sequence",sequence+1);
        event.put("baseRevision",base);event.put("revision",base+1);event.put("status",status);
        event.put("startedAt",startedAt);event.put("emittedAt",now);event.put("firstUsefulAt",firstUsefulAt);
        latest=store.commitStream(context.getSessionId(),context.getRequestId(),event,tree);
        sequence++;lastCommitAt=now;
        if(!"committed".equals(status)){closed=true;unsubscribeCancellation.run();}
        if(context.getPrinter()!=null)context.getPrinter().send(generationId+":"+sequence,"ui_stream",UiStreamCommit.payload(latest),null,!"committed".equals(status));
    }
}
