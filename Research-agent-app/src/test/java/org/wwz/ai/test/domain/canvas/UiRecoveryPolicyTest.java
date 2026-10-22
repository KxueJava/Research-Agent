package org.wwz.ai.test.domain.canvas;
import org.junit.Test;
import java.util.*;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.*;
import static org.junit.Assert.*;
public class UiRecoveryPolicyTest {
    @Test public void recoversOnlyOptedInNonSensitiveNumericParameters(){
        var tree=Map.of("root",Map.of("kind","Card","children",List.of(
            Map.of("kind","NumberInput","nodeId","amount","props",Map.of("persistState",true,"value",300)),
            Map.of("kind","NumberInput","nodeId","tip","props",Map.of("persistState",true,"value",0)),
            Map.of("kind","NumberInput","nodeId","draft","props",Map.of("value",42)),
            Map.of("kind","NumberInput","nodeId","private","props",Map.of("persistState",true,"sensitive",true)),
            Map.of("kind","NumberInput","nodeId","credential","props",Map.of("persistState",true)),
            Map.of("kind","Card","props",Map.of("sensitive",true),"children",List.of(Map.of("kind","NumberInput","nodeId","nested","props",Map.of("persistState",true)))))));
        assertEquals(Set.of("amount","tip"),UiRecoveryPolicy.allowedNodes(tree));
        var doc=new HashMap<String,Object>();doc.put("tree",tree);
        assertNotNull(UiRecoveryPolicy.state(doc,Map.of("nodes",Map.of("amount",300,"tip",10))));
        for(String id:List.of("draft","private","credential","nested"))assertThrows(IllegalArgumentException.class,()->UiRecoveryPolicy.state(doc,Map.of("nodes",Map.of(id,1))));
    }
    public static Map<String,Object> tree(){return Map.of("root",Map.of("kind","Card","nodeId","root","props",Map.of("title","Recovery"),"children",List.of(
        Map.of("kind","Select","nodeId","month","props",Map.of("name","month","options",List.of("Jan","Feb"))),
        Map.of("kind","Input","nodeId","password","props",Map.of("type","password")),
        Map.of("kind","Input","nodeId","notes","props",Map.of("name","notes")),
        Map.of("kind","Table","nodeId","table","props",Map.of("dataRef",Map.of("id","sales","selectionNodeId","selected","filters",List.of(Map.of("column","month","op","eq","value",Map.of("fromNode","month"))),"sort",Map.of("fromNode","password"))))
    )));}
    @Test public void persistsOnlyDeclaredSafeControlsAndNoArbitraryFormDrafts(){
        var doc=new HashMap<String,Object>();doc.put("tree",tree());
        assertEquals(Set.of("month","selected"),UiRecoveryPolicy.allowedNodes(tree()));
        assertNotNull(UiRecoveryPolicy.state(doc,Map.of("nodes",Map.of("month","Jan","selected",List.of("row1")))));
        for(String id:List.of("password","notes"))assertThrows(IllegalArgumentException.class,()->UiRecoveryPolicy.state(doc,Map.of("nodes",Map.of(id,"private"))));
        assertThrows(IllegalArgumentException.class,()->UiRecoveryPolicy.state(doc,Map.of("nodes",Map.of("month",Map.of("patches",List.of())))));
        assertThrows(IllegalArgumentException.class,()->UiRecoveryPolicy.state(doc,Map.of("patches",List.of())));
    }
    @Test public void metadataAndResourcesKeepSeparateVersionContracts(){
        var doc=new HashMap<String,Object>();doc.put("tree",tree());doc.put("interaction",Map.of("stateRevision",2));doc.put("resources",List.of());
        assertFalse(UiSurfaceDocument.metadata(doc).containsKey("interaction"));assertFalse(UiSurfaceDocument.metadata(doc).containsKey("resources"));
        var resource=resource(1);assertEquals(1,UiRecoveryPolicy.resource(doc,"sales",resource).get("version"));
        assertThrows(IllegalArgumentException.class,()->UiRecoveryPolicy.resource(doc,"unknown",resource));
        var malformed=new HashMap<>(resource);malformed.put("rows",List.of(Map.of("month",Double.NaN)));assertThrows(IllegalArgumentException.class,()->UiRecoveryPolicy.resource(doc,"sales",malformed));
    }
    public static Map<String,Object> resource(int version){return Map.of("id","sales","version",version,"source",Map.of("type","upload","name","sales.csv"),"collectedAt","2026-10-21T00:00:00Z","columns",List.of("month"),"rows",List.of(Map.of("month","Jan")));}
}
