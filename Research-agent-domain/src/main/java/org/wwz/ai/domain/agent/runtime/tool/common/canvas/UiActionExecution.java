package org.wwz.ai.domain.agent.runtime.tool.common.canvas;
import com.alibaba.fastjson.JSON;
import java.util.*;
/** Persisted execution fact; cancelRequested never implies external effects were rolled back. */
public record UiActionExecution(Map<String,Object> data) {
  public UiActionExecution {data=Collections.unmodifiableMap(new LinkedHashMap<>(JSON.parseObject(JSON.toJSONString(data))));}
  public String id(){return String.valueOf(data.get("id"));}
  public String sessionId(){return String.valueOf(data.get("sessionId"));}
  public String ownerId(){return String.valueOf(data.get("ownerId"));}
  public String surfaceId(){return String.valueOf(data.get("surfaceId"));}
  public String status(){return String.valueOf(data.get("status"));}
  public String fingerprint(){return String.valueOf(data.get("fingerprint"));}
  public long baseRevision(){return ((Number)data.get("baseRevision")).longValue();}
  public boolean terminal(){return Set.of("completed","failed","cancelled").contains(status());}
  public boolean cancelRequested(){return Boolean.TRUE.equals(data.get("cancelRequested"));}
  public UiActionExecution change(String state,Map<String,Object> extra){var next=new LinkedHashMap<>(data);next.putAll(extra);next.put("status",state);next.put("executionRevision",(data.get("executionRevision") instanceof Number n?n.longValue():0)+1);return new UiActionExecution(next);}
}
