package org.wwz.ai.test.domain;

import org.junit.Assert;
import org.junit.Test;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.wwz.ai.domain.agent.research.config.ResearchConfig;

/**
 * 锁定 Phase 1 明确延后的共享配置边界。
 */
public class ResearchPhase1BoundaryTest {

    @Test
    public void shouldKeepResearchConfigAsTransitionalSharedConfiguration() {
        Assert.assertEquals(
                "org.wwz.ai.domain.agent.research.config",
                ResearchConfig.class.getPackageName()
        );
        Assert.assertNotNull(AnnotatedElementUtils.findMergedAnnotation(ResearchConfig.class, Configuration.class));
    }
}
