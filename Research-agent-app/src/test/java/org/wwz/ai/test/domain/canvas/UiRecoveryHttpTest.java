package org.wwz.ai.test.domain.canvas;
import org.junit.*;
import java.util.*;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.wwz.ai.infrastructure.tooloutput.JdbcUiSurfaceStore;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.UiSurfaceStore;
import org.wwz.ai.trigger.http.agent.AgentUiSurfaceController;
import org.wwz.ai.application.agent.visitor.ConversationSessionOwnershipApplicationService;
import org.wwz.ai.types.agent.visitor.VisitorRequestContext;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
public class UiRecoveryHttpTest {
    private JdbcTemplate jdbc;private String session;private MockMvc mvc;
    @Before public void setup(){
        Assume.assumeTrue("true".equals(System.getenv("RESEARCH_UI_DB_TEST")));
        var source=IsolatedUiDatabase.source();
        jdbc=new JdbcTemplate(source);var store=new JdbcUiSurfaceStore(source);session="recovery-http-"+UUID.randomUUID();
        jdbc.update("INSERT INTO ai_agent_dialogue_session(session_id,visitor_id,title,deleted) VALUES(?,?,?,0)",session,"recovery-test-owner","Disposable recovery HTTP test");
        store.publish(session,"r","sales","create",UiRecoveryPolicyTest.tree());
        ObjectProvider<UiSurfaceStore> provider=mock(ObjectProvider.class);when(provider.getIfAvailable()).thenReturn(store);
        mvc=MockMvcBuilders.standaloneSetup(new AgentUiSurfaceController(provider,mock(ConversationSessionOwnershipApplicationService.class))).build();VisitorRequestContext.bind("recovery-test-owner");
    }
    @After public void cleanup(){VisitorRequestContext.clear();if(jdbc!=null&&session!=null){jdbc.update("DELETE FROM ai_agent_ui_surface_event WHERE session_id=?",session);jdbc.update("DELETE FROM ai_agent_ui_surface WHERE session_id=?",session);jdbc.update("DELETE FROM ai_agent_dialogue_session WHERE session_id=?",session);}}
    @Test public void realStoreHttpContractHasIndependentCasPrivacyAndDeletionChecks()throws Exception{
        String base="/api/agent/conversation/sessions/"+session+"/surfaces/sales";
        String state="{\"stateRevision\":0,\"baseRevision\":1,\"state\":{\"nodes\":{\"month\":\"Jan\"}}}";
        mvc.perform(put(base+"/interaction").contentType(MediaType.APPLICATION_JSON).content(state)).andExpect(status().isOk()).andExpect(jsonPath("$.stateRevision").value(1));
        mvc.perform(put(base+"/interaction").contentType(MediaType.APPLICATION_JSON).content(state)).andExpect(status().isConflict());
        mvc.perform(put(base+"/interaction").contentType(MediaType.APPLICATION_JSON).content("{\"stateRevision\":1,\"baseRevision\":1,\"state\":{\"nodes\":{\"password\":\"private\"}}}")).andExpect(status().isBadRequest());
        mvc.perform(put(base+"/resources").contentType(MediaType.APPLICATION_JSON).content(com.alibaba.fastjson.JSON.toJSONString(Map.of("baseVersion",0,"resource",UiRecoveryPolicyTest.resource(1))))).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        mvc.perform(get(base)).andExpect(status().isOk()).andExpect(jsonPath("$.revision").value(1)).andExpect(jsonPath("$.interaction.state.nodes.month").value("Jan")).andExpect(jsonPath("$.resources[0].version").value(1));
        VisitorRequestContext.bind("foreign");mvc.perform(get(base)).andExpect(status().isNotFound());VisitorRequestContext.bind("recovery-test-owner");
        jdbc.update("UPDATE ai_agent_dialogue_session SET deleted=1 WHERE session_id=?",session);
        mvc.perform(get(base)).andExpect(status().isNotFound());mvc.perform(put(base+"/interaction").contentType(MediaType.APPLICATION_JSON).content(state)).andExpect(status().isNotFound());
    }
}
