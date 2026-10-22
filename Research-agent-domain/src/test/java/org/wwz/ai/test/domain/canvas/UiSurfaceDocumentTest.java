package org.wwz.ai.test.domain.canvas;

import org.junit.Test;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.UiSurfaceDocument;
import java.util.*;
import static org.junit.Assert.*;

public class UiSurfaceDocumentTest {
    private Map<String,Object> tree() { return Map.of("kind","Card","props",Map.of("title","Old"),"children",List.of()); }
    private Map<String,Object> snapshot() { return UiSurfaceDocument.create("session-a","owner-a","round-1","surface-a","e1",tree()); }
    @Test public void incrementsVersionAndKeepsOriginAcrossRounds() {
        Map<String,Object> initial=snapshot();
        Map<String,Object> next=UiSurfaceDocument.patch(initial,"e2",1L,List.of(Map.of("op","replace","path","/root/props/title","value","New")));
        assertEquals(2L,((Number)next.get("revision")).longValue());
        assertEquals("round-1",next.get("messageId"));
        assertEquals("Old",com.alibaba.fastjson.JSON.toJSON(initial).toString().contains("New")?"mutated":"Old");
        assertTrue(com.alibaba.fastjson.JSON.toJSONString(next.get("tree")).contains("New"));
    }
    @Test public void rejectsStaleVersion() {
        assertThrows(IllegalStateException.class,()->UiSurfaceDocument.patch(snapshot(),"e2",0L,List.of(Map.of("op","replace","path","/root/props/title","value","New"))));
    }
    @Test public void rejectsInvalidPathWithoutPublishingPartialChanges() {
        assertThrows(IllegalArgumentException.class,()->UiSurfaceDocument.patch(snapshot(),"e2",1L,List.of(Map.of("op","replace","path","/root/missing/title","value","New"))));
    }
    @Test public void rejectsPrototypeKeysAndOutOfRangeIndexes() {
        for(String path:List.of("/root/props/__proto__/polluted","/root/children/9"))
            assertThrows(IllegalArgumentException.class,()->UiSurfaceDocument.patch(snapshot(),"e2",1L,List.of(Map.of("op","add","path",path,"value",Map.of("kind","Card")))));
    }
    @Test public void assignsStableIdsAndRejectsDuplicates() {
        assertEquals(snapshot().get("tree"),snapshot().get("tree"));
        Object duplicate=Map.of("kind","Card","nodeId","x","children",List.of(Map.of("kind","Card","nodeId","x")));
        assertThrows(IllegalArgumentException.class,()->UiSurfaceDocument.create("s","o","m","c","e",duplicate));
    }
    @Test public void insertingBeforeAnAutoIdNodeKeepsExistingIdentity() {
        var initial=UiSurfaceDocument.create("s","o","m","c","e",Map.of("kind","Card","children",List.of(Map.of("kind","Card"))));
        var next=UiSurfaceDocument.patch(initial,"e2",1L,List.of(Map.of("op","add","path","/root/children/0","value",Map.of("kind","Card"))));
        assertTrue(com.alibaba.fastjson.JSON.toJSONString(next).contains("rui-root-0"));
    }
    @Test public void rejectsIdsThatCollideAfterWhitespaceNormalization() {
        Object raw=Map.of("kind","Card","nodeId","a","children",List.of(Map.of("kind","Card","nodeId"," a ")));
        assertThrows(IllegalArgumentException.class,()->UiSurfaceDocument.create("s","o","m","c","e",raw));
    }
}
