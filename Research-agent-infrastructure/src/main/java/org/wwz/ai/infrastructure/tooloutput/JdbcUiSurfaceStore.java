package org.wwz.ai.infrastructure.tooloutput;

import com.alibaba.fastjson.JSON;
import com.alibaba.fastjson.serializer.SerializerFeature;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.support.TransactionTemplate;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.UiSurfaceDocument;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.UiSurfaceStore;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.UiStreamCommit;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.UiRecoveryPolicy;
import javax.sql.DataSource;
import java.util.*;

/** Lock the existing session row before touching surfaces: deletion and writes share a boundary. */
@Repository
@ConditionalOnProperty(name="research.ui.surfaces.enabled",havingValue="true",matchIfMissing=true)
public class JdbcUiSurfaceStore implements UiSurfaceStore {
    private final JdbcTemplate jdbc;
    private final TransactionTemplate tx;
    public JdbcUiSurfaceStore(@Qualifier("mysqlDataSource") DataSource source) {
        jdbc=new JdbcTemplate(source);tx=new TransactionTemplate(new DataSourceTransactionManager(source));
        ensureSchema(source);
    }
    static void ensureSchema(DataSource source) {
        JdbcTemplate jdbc=new JdbcTemplate(source);
        jdbc.execute("CREATE TABLE IF NOT EXISTS ai_agent_file_scope_tombstone (scope_id VARCHAR(128) NOT NULL PRIMARY KEY,deleted_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        jdbc.execute("CREATE TABLE IF NOT EXISTS ai_agent_ui_surface (session_id VARCHAR(128) NOT NULL,surface_id VARCHAR(128) NOT NULL,owner_id VARCHAR(128) NOT NULL,document_json LONGTEXT NOT NULL,PRIMARY KEY(session_id,surface_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        jdbc.execute("CREATE TABLE IF NOT EXISTS ai_agent_ui_surface_event (session_id VARCHAR(128) NOT NULL,event_id VARCHAR(128) NOT NULL,command_json LONGTEXT NOT NULL,document_json LONGTEXT NOT NULL,PRIMARY KEY(session_id,event_id)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
        jdbc.execute("CREATE TABLE IF NOT EXISTS ai_agent_ui_map_proof (session_id VARCHAR(128) NOT NULL,surface_id VARCHAR(128) NOT NULL,digest CHAR(64) NOT NULL,created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(session_id,surface_id,digest)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci");
    }
    @Override public Map<String,Object> publish(String session,String message,String canvas,String event,Object tree) {
        return mutate(session,canvas,event,Map.of("operation","publish","messageId",message,"canvas",Objects.toString(canvas,""),"tree",tree),owner->{
            String id=canvas==null||canvas.isBlank()?"surface-"+UUID.randomUUID():identifier(canvas);
            if(!documents(session,id).isEmpty())throw new IllegalStateException("Surface already exists; use emit_ui_patch with base_revision");
            return UiSurfaceDocument.create(session,owner,message,id,event,tree);
        });
    }
    @Override public boolean supportsStreaming() {return true;}
    @Override public Map<String,Object> applyAction(String session,String surface,String event,long revision,List<Map<String,Object>> patches,List<Map<String,Object>> resources){
        return mutate(session,surface,event,Map.of("operation","action","revision",revision,"patches",patches,"resources",resources),owner->{
            var rows=documents(session,surface);if(rows.size()!=1)throw new IllegalStateException("Surface unavailable");
            var previous=(Map<String,Object>)JSON.parseObject((String)rows.getFirst().get("document_json"));
            var next=UiSurfaceDocument.patch(previous,event,revision,patches);
            List<Map<String,Object>> merged=new ArrayList<>();if(previous.get("resources") instanceof List<?> old)for(Object r:old)merged.add((Map<String,Object>)r);
            var history=new ArrayList<Map<String,Object>>();if(previous.get("resourceHistory") instanceof List<?> list)list.forEach(r->history.add((Map<String,Object>)r));
            for(var raw:resources){var resource=new LinkedHashMap<>(raw);String id=identifier(Objects.toString(resource.get("id"),""));long version=merged.stream().filter(r->id.equals(r.get("id"))).mapToLong(r->((Number)r.get("version")).longValue()).max().orElse(0)+1;
                merged.stream().filter(r->id.equals(r.get("id"))).forEach(history::add);trimHistory(history,id);
                resource.put("version",version);merged.removeIf(r->id.equals(r.get("id")));merged.add(resource);
            }
            if(JSON.toJSONString(merged).length()>2_097_152)throw new IllegalArgumentException("Action resources too large");
            next.put("resources",merged);next.put("resourceHistory",history);if(JSON.toJSONString(next).length()>8_388_608)throw new IllegalArgumentException("Recovery resources too large");return next;
        });
    }
    @Override public Map<String,Object> commitStream(String session,String message,Map<String,Object> stream,Object tree) {
        String id=identifier(Objects.toString(stream.get("surfaceId"),""));
        String event=identifier(Objects.toString(stream.get("generationId"),"")+":"+stream.get("sequence"));
        Map<String,Object> command=new LinkedHashMap<>();command.put("operation","stream");command.put("messageId",message);command.put("stream",stream);command.put("tree",tree);
        return mutate(session,id,event,command,owner->{
            var prior=documents(session,id);
            Map<String,Object> previous=prior.isEmpty()?null:JSON.parseObject((String)prior.get(0).get("document_json"));
            return UiStreamCommit.apply(previous,session,owner,message,stream,tree);
        });
    }
    @Override public List<Map<String,Object>> planningSnapshots(String session) {
        identifier(session);
        var owners=jdbc.queryForList("SELECT visitor_id FROM ai_agent_dialogue_session WHERE session_id=? AND deleted=0",String.class,session);
        if(owners.size()!=1)throw new SecurityException("Session unavailable");
        return list(session,owners.getFirst());
    }
    @Override public List<Map<String,Object>> list(String session,String owner) {
        identifier(session);
        return jdbc.query("SELECT u.document_json FROM ai_agent_ui_surface u JOIN ai_agent_dialogue_session s ON s.session_id=u.session_id WHERE u.session_id=? AND u.owner_id=? AND s.visitor_id=? AND s.deleted=0 ORDER BY JSON_UNQUOTE(JSON_EXTRACT(u.document_json,'$.updatedAt')) DESC LIMIT 200",
            (rs,n)->(Map<String,Object>)JSON.parseObject(rs.getString(1)),session,owner,owner);
    }
    @Override public Map<String,Object> patch(String session,String canvas,String event,Long revision,List<Map<String,Object>> patches) {
        Map<String,Object> command=new LinkedHashMap<>();command.put("operation","patch");command.put("canvas",canvas);command.put("baseRevision",revision);command.put("patches",patches);
        return mutate(session,canvas,event,command,owner->{
            List<Map<String,Object>> candidates=documents(session,canvas).stream()
                    .filter(row->!"html".equals(JSON.parseObject((String)row.get("document_json")).get("kind"))).toList();
            if(candidates.isEmpty())throw new IllegalStateException("No persisted Surface. Create a new UI tree first; legacy history remains readable.");
            if(candidates.size()!=1)throw new IllegalStateException("Multiple Surfaces; specify canvas_id explicitly");
            Map<String,Object> previous=JSON.parseObject((String)candidates.get(0).get("document_json"));
            return UiSurfaceDocument.patch(previous,event,revision,patches);
        });
    }
    @Override public Map<String,Object> publishArtifact(String session,String message,String event,Map<String,Object> artifact) {
        String id=identifier(Objects.toString(artifact.get("surfaceId"),""));
        String digest=Objects.toString(artifact.get("sha256"),"");
        if(!digest.matches("[a-f0-9]{64}")||Objects.toString(artifact.get("relativePath"),"").isBlank())
            throw new IllegalArgumentException("Invalid HTML artifact reference");
        return mutate(session,id,event,Map.of("operation","publish-html","messageId",message,"artifact",artifact),owner->{
            List<Map<String,Object>> prior=documents(session,id);
            Map<String,Object> previous=prior.isEmpty()?null:JSON.parseObject((String)prior.get(0).get("document_json"));
            if(previous!=null&&!"html".equals(previous.get("kind")))throw new IllegalStateException("Surface kind conflict");
            long base=previous==null?0:((Number)previous.get("revision")).longValue();
            Map<String,Object> doc=new LinkedHashMap<>();
            doc.put("schemaVersion","rui/1");doc.put("kind","html");doc.put("surfaceId",id);
            doc.put("sessionId",session);doc.put("ownerId",owner);
            doc.put("messageId",previous==null?message:previous.get("messageId"));
            doc.put("revision",base+1);doc.put("baseRevision",base);doc.put("eventId",event);
            doc.put("updatedAt",java.time.Instant.now().toString());doc.put("artifact",artifact);
            if(previous!=null&&previous.containsKey("interaction"))doc.put("interaction",previous.get("interaction"));
            return doc;
        });
    }
    @Override public Map<String,Object> readVersion(String session,String owner,String id,long revision) {
        read(session,owner,id); // checks current ownership and deletion before historical lookup
        List<String> versions=jdbc.query("SELECT e.document_json FROM ai_agent_ui_surface_event e JOIN ai_agent_dialogue_session s ON s.session_id=e.session_id WHERE e.session_id=? AND s.visitor_id=? AND s.deleted=0 AND JSON_UNQUOTE(JSON_EXTRACT(e.document_json,'$.surfaceId'))=? AND JSON_EXTRACT(e.document_json,'$.revision')=?",(rs,n)->rs.getString(1),session,owner,id,revision);
        if(versions.size()!=1)throw new SecurityException("Surface version unavailable");
        return JSON.parseObject(versions.get(0));
    }
    private Map<String,Object> mutate(String session,String canvas,String event,Object command,java.util.function.Function<String,Map<String,Object>> operation) {
        identifier(session);identifier(event);if(canvas!=null&&!canvas.isBlank())identifier(canvas);
        String serialized=JSON.toJSONString(command,SerializerFeature.MapSortField,SerializerFeature.SortField);
        return tx.execute(status->{
            List<String> owners=jdbc.query("SELECT visitor_id FROM ai_agent_dialogue_session WHERE session_id=? AND deleted=0 FOR UPDATE",(rs,n)->rs.getString(1),session);
            if(owners.size()!=1||owners.get(0)==null||owners.get(0).isBlank())throw new SecurityException("Session missing or deleted");
            List<Map<String,Object>> prior=jdbc.queryForList("SELECT command_json,document_json FROM ai_agent_ui_surface_event WHERE session_id=? AND event_id=?",session,event);
            if(!prior.isEmpty()) {
                if(!serialized.equals(prior.get(0).get("command_json")))throw new IllegalStateException("eventId reused with different payload");
                return JSON.parseObject((String)prior.get(0).get("document_json"));
            }
            Map<String,Object> document=operation.apply(owners.get(0));
            verifyMaps(session,document);
            String data=JSON.toJSONString(document);
            jdbc.update("INSERT INTO ai_agent_ui_surface(session_id,surface_id,owner_id,document_json) VALUES(?,?,?,?) ON DUPLICATE KEY UPDATE document_json=VALUES(document_json)",session,document.get("surfaceId"),owners.get(0),data);
            jdbc.update("INSERT INTO ai_agent_ui_surface_event(session_id,event_id,command_json,document_json) VALUES(?,?,?,?)",session,event,serialized,data);
            return JSON.parseObject(data);
        });
    }
    @Override public void registerMapData(String session,Object raw){
        var data=org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.MapData.parse(raw);
        if(!"amap".equals(data.provider()))return;
        String digest=org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.MapProvenance.digest(raw);
        tx.executeWithoutResult(status->{
            var owners=jdbc.queryForList("SELECT visitor_id FROM ai_agent_dialogue_session WHERE session_id=? AND deleted=0 FOR UPDATE",String.class,session);
            if(owners.size()!=1)throw new SecurityException("Map session unavailable");
            Integer count=jdbc.queryForObject("SELECT COUNT(*) FROM ai_agent_ui_map_proof WHERE session_id=?",Integer.class,session);
            if(count!=null&&count>=10000)throw new IllegalStateException("Map resource history limit reached");
            jdbc.update("INSERT IGNORE INTO ai_agent_ui_map_proof(session_id,surface_id,digest) VALUES(?,?,?)",session,data.surfaceId(),digest);
        });
    }
    private void verifyMaps(String session,Map<String,Object> document){
        String surface=String.valueOf(document.get("surfaceId"));
        var current=new HashMap<String,Map<String,Object>>();collectMaps(document.get("tree"),current);
        if(current.isEmpty())return;
        var previousRows=documents(session,surface);
        var previous=new HashMap<String,Map<String,Object>>();
        if(!previousRows.isEmpty())collectMaps(JSON.parseObject((String)previousRows.getFirst().get("document_json")).get("tree"),previous);

        for(var raw:current.values()){
            var data=org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.MapData.parse(raw);
            if(!surface.equals(data.surfaceId()))throw new SecurityException("Map belongs to another Surface");
            String digest=org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.MapProvenance.digest(raw);
            if("amap".equals(data.provider())){
                Integer count=jdbc.queryForObject("SELECT COUNT(*) FROM ai_agent_ui_map_proof WHERE session_id=? AND surface_id=? AND digest=?",Integer.class,session,surface,digest);
                if(count==null||count!=1)throw new SecurityException("MapData must originate from a registered provider result");
            }
            var old=previous.get(data.mapId());
            if(old!=null){long oldRevision=org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.MapData.number(old.get("revision"));
                if(data.revision()<oldRevision||data.revision()==oldRevision&&!digest.equals(org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.MapProvenance.digest(old)))throw new IllegalStateException("Map content revision conflict");}
        }
    }
    @SuppressWarnings("unchecked") private static void collectMaps(Object raw,Map<String,Map<String,Object>> maps){
        if(!(raw instanceof Map<?,?> node))return;if(node.containsKey("root")){collectMaps(node.get("root"),maps);return;}
        if("MapWidget".equals(node.get("kind"))){var data=org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.MapData.object(org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.MapData.object(node.get("props")).get("mapData"));String id=String.valueOf(data.get("mapId"));if(maps.putIfAbsent(id,data)!=null)throw new IllegalArgumentException("Duplicate map identity");}
        if(node.get("children") instanceof List<?> children)for(Object child:children)collectMaps(child,maps);
    }
    @Override public Map<String,Object> saveMapState(String session,String owner,String surface,String node,long expected,long mapRevision,Map<String,Object> state){
        return tx.execute(status->{
            var owners=jdbc.queryForList("SELECT visitor_id FROM ai_agent_dialogue_session WHERE session_id=? AND deleted=0 FOR UPDATE",String.class,session);
            if(owners.size()!=1||!owner.equals(owners.getFirst()))throw new SecurityException("Map unavailable");
            var document=read(session,owner,surface);
            var data=org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.MapService.map(document,node);
            if(data.revision()!=mapRevision)throw new IllegalStateException("Map revision changed");
            var states=new LinkedHashMap<String,Object>();if(document.get("mapStates") instanceof Map<?,?> prior)prior.forEach((k,v)->states.put(String.valueOf(k),v));
            long version=states.get(node) instanceof Map<?,?> prior?((Number)prior.get("stateRevision")).longValue():0;
            if(version!=expected)throw new IllegalStateException("Map state revision conflict");
            var saved=Map.<String,Object>of("stateRevision",version+1,"mapRevision",mapRevision,"state",state);
            states.put(node,saved);if(JSON.toJSONString(states).length()>65536)throw new IllegalArgumentException("Map states exceed limit");
            document.put("mapStates",states);
            jdbc.update("UPDATE ai_agent_ui_surface SET document_json=? WHERE session_id=? AND surface_id=? AND owner_id=?",JSON.toJSONString(document),session,surface,owner);
            return saved;
        });
    }
    private List<Map<String,Object>> documents(String session,String id) {
        if(id==null||id.isBlank())return jdbc.queryForList("SELECT document_json FROM ai_agent_ui_surface WHERE session_id=?",session);
        return jdbc.queryForList("SELECT document_json FROM ai_agent_ui_surface WHERE session_id=? AND surface_id=?",session,id);
    }
    private void lockOwner(String session,String owner){
        identifier(session);var owners=jdbc.queryForList("SELECT visitor_id FROM ai_agent_dialogue_session WHERE session_id=? AND deleted=0 FOR UPDATE",String.class,session);
        if(owners.size()!=1||!owner.equals(owners.getFirst()))throw new SecurityException("Surface unavailable");
    }
    @Override public Map<String,Object> saveInteraction(String session,String owner,String surface,long expected,long base,Map<String,Object> state){
        return tx.execute(status->{lockOwner(session,owner);var document=read(session,owner,surface);
            if(((Number)document.get("revision")).longValue()!=base)throw new IllegalStateException("Surface revision changed");
            long version=document.get("interaction") instanceof Map<?,?> prior?((Number)prior.get("stateRevision")).longValue():0;
            if(expected<0||version!=expected)throw new IllegalStateException("Interaction revision conflict");
            var clean=UiRecoveryPolicy.state(document,state);
            if(clean.get("artifactRevision") instanceof Number n&&n.longValue()>0)readVersion(session,owner,surface,n.longValue());
            var saved=Map.<String,Object>of("stateRevision",version+1,"baseRevision",base,"state",clean,"updatedAt",java.time.Instant.now().toString());
            document.put("interaction",saved);saveSidecars(session,owner,surface,document);return saved;
        });
    }
    @Override public Map<String,Object> saveResource(String session,String owner,String surface,long expected,Map<String,Object> raw){
        return tx.execute(status->{lockOwner(session,owner);var document=read(session,owner,surface);String id=identifier(Objects.toString(raw.get("id"),""));
            var resource=UiRecoveryPolicy.resource(document,id,raw);var latest=new ArrayList<Map<String,Object>>();
            if(document.get("resources") instanceof List<?> list)list.forEach(r->latest.add((Map<String,Object>)r));
            long version=latest.stream().filter(r->id.equals(r.get("id"))).mapToLong(r->((Number)r.get("version")).longValue()).max().orElse(0);
            if(expected<0||expected!=version||((Number)resource.get("version")).longValue()!=version+1)throw new IllegalStateException("Resource version conflict");
            if(latest.size()>=20&&latest.stream().noneMatch(r->id.equals(r.get("id"))))throw new IllegalArgumentException("Too many resources");
            var history=new ArrayList<Map<String,Object>>();if(document.get("resourceHistory") instanceof List<?> list)list.forEach(r->history.add((Map<String,Object>)r));
            latest.stream().filter(r->id.equals(r.get("id"))).forEach(history::add);latest.removeIf(r->id.equals(r.get("id")));latest.add(resource);
            trimHistory(history,id);
            document.put("resources",latest);document.put("resourceHistory",history);saveSidecars(session,owner,surface,document);return resource;
        });
    }
    private void saveSidecars(String session,String owner,String surface,Map<String,Object> document){String data=JSON.toJSONString(document);if(data.length()>8_388_608)throw new IllegalArgumentException("Surface recovery data exceeds 8 MiB");jdbc.update("UPDATE ai_agent_ui_surface SET document_json=? WHERE session_id=? AND surface_id=? AND owner_id=?",data,session,surface,owner);}
    private void trimHistory(List<Map<String,Object>> history,String id){var old=history.stream().filter(r->id.equals(r.get("id"))).sorted(Comparator.comparingLong(r->((Number)r.get("version")).longValue())).toList();for(int i=0;i<old.size()-9;i++)history.remove(old.get(i));}
    @Override public Map<String,Object> read(String session,String owner,String id) {
        identifier(session);identifier(id);
        List<String> results=jdbc.query("SELECT u.document_json FROM ai_agent_ui_surface u JOIN ai_agent_dialogue_session s ON s.session_id=u.session_id WHERE u.session_id=? AND u.surface_id=? AND u.owner_id=? AND s.visitor_id=? AND s.deleted=0",(rs,n)->rs.getString(1),session,id,owner,owner);
        if(results.size()!=1)throw new SecurityException("Surface missing or not owned by current user");
        return JSON.parseObject(results.get(0));
    }
    private static String identifier(String id) {
        if(id==null||id.isBlank()||id.length()>128||id.chars().anyMatch(Character::isISOControl))throw new IllegalArgumentException("Invalid Surface identifier");
        return id;
    }
}
