package org.wwz.ai.test.domain;

import org.junit.Test;
import org.junit.After;
import org.junit.Assert;
import org.mockito.Mockito;
import org.springframework.test.util.ReflectionTestUtils;
import org.wwz.ai.infrastructure.dao.research.IToolOutputImageGenerationDao;
import org.apache.ibatis.builder.xml.XMLMapperBuilder;
import org.apache.ibatis.session.Configuration;
import org.springframework.core.io.ClassPathResource;
import java.util.List;
import java.util.Map;
import org.wwz.ai.infrastructure.research.service.impl.WorkspaceImageGenerationServiceImpl;
import org.wwz.ai.types.auth.AdminAuthContext;

public class WorkspaceImageOwnershipTest {
    @After public void clearIdentity() { AdminAuthContext.clear(); }
    @Test(expected = SecurityException.class)
    public void anonymousHistoryIsRejectedBeforeReadingData() {
        AdminAuthContext.clear();
        new WorkspaceImageGenerationServiceImpl().queryHistory(1, 10);
    }

    @Test public void eachHistoryQueryUsesTheAuthenticatedOwner() {
        var service = new WorkspaceImageGenerationServiceImpl();
        var dao = Mockito.mock(IToolOutputImageGenerationDao.class, invocation -> {
            if (invocation.getMethod().getName().startsWith("countBy")) {
                Assert.assertEquals(2, invocation.getArguments().length);
                Assert.assertEquals(AdminAuthContext.currentUserId(), invocation.getArgument(1));
                return 1;
            }
            if (invocation.getMethod().getName().startsWith("queryPage")) {
                Assert.assertEquals(AdminAuthContext.currentUserId(), invocation.getArgument(1));
                return List.of();
            }
            return Mockito.RETURNS_DEFAULTS.answer(invocation);
        });
        ReflectionTestUtils.setField(service, "toolOutputImageGenerationDao", dao);
        for (String userId : List.of("user-a", "user-b")) {
            AdminAuthContext.bind(userId, userId);
            Assert.assertEquals(1, service.queryHistory(1, 10).getTotal());
        }
    }

    @Test public void historySqlFiltersBothCountAndRowsByOwner() throws Exception {
        var configuration = new Configuration();
        var resource = new ClassPathResource("mybatis/mapper/tool_output_image_generation_mapper.xml");
        try (var stream = resource.getInputStream()) {
            new XMLMapperBuilder(stream, configuration, resource.getPath(), configuration.getSqlFragments()).parse();
        }
        for (String method : List.of("countByRequestSource", "queryPageByRequestSource")) {
            var bound = configuration.getMappedStatement("org.wwz.ai.infrastructure.dao.research.IToolOutputImageGenerationDao." + method)
                    .getBoundSql(Map.of("requestSource", "workspace", "ownerUserId", "user-a", "offset", 0, "limit", 10));
            Assert.assertTrue(bound.getSql().replaceAll("\\s+", " ").contains("AND owner_user_id = ?"));
            Assert.assertTrue(bound.getParameterMappings().stream().anyMatch(p -> p.getProperty().equals("ownerUserId")));
        }
    }

    @Test public void persistedWorkspaceBatchCarriesTrustedOwnerToInsert() {
        AdminAuthContext.bind("owner-a", "a");
        var dao = Mockito.mock(IToolOutputImageGenerationDao.class);
        Mockito.when(dao.insert(Mockito.any())).thenReturn(1);
        var writer = new org.wwz.ai.infrastructure.tooloutput.ToolOutputWriterImpl(null, null, null, null, dao, null, null, null);
        var persistence = new org.wwz.ai.domain.agent.research.service.imagegeneration.impl.ImageGenerationBatchPersistenceServiceImpl();
        ReflectionTestUtils.setField(persistence, "toolOutputWriter", writer);
        ReflectionTestUtils.setField(persistence, "agentExecutionRecorder", Mockito.mock(org.wwz.ai.domain.agent.ledger.AgentExecutionRecorder.class));
        persistence.persistWorkspaceBatch("req-owner-a", org.wwz.ai.domain.agent.research.model.imagegeneration.ImageGenerationExecutionResult.builder()
                .prompt("a private prompt").mode("images").files(List.of(
                        org.wwz.ai.domain.agent.research.model.imagegeneration.WorkspaceImageFile.builder()
                                .fileName("private.png").previewUrl("https://offline.invalid/private.png").build())).build());
        var row = org.mockito.ArgumentCaptor.forClass(Map.class);
        Mockito.verify(dao).insert(row.capture());
        Assert.assertEquals("owner-a", row.getValue().get("ownerUserId"));
        Assert.assertEquals("a private prompt", row.getValue().get("prompt"));
    }
}
