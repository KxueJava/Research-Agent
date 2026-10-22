package org.wwz.ai.config;
import org.springframework.context.annotation.*;
import org.springframework.beans.factory.annotation.Qualifier;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.*;
import org.wwz.ai.domain.agent.adapter.port.FileArtifactPort;
import org.wwz.ai.domain.agent.research.config.ResearchConfig;
import java.util.Map;
import java.util.concurrent.Executor;
@Configuration
@org.springframework.boot.autoconfigure.condition.ConditionalOnProperty(name="research.ui.surfaces.enabled",havingValue="true",matchIfMissing=true)
public class UiActionConfiguration {
  @Bean public UiActionService uiActionService(UiActionStore actions,UiSurfaceStore surfaces,FileArtifactPort files,ResearchConfig config,org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.MapService maps,@Qualifier("agentToolExecutor") Executor executor){
    return new UiActionService(actions,surfaces,Map.of("sales_analysis",new UiActionService.Capability(true,false,new UiSalesAnalysisTool(files,config.getCodeInterpreterUrl())),"map_itinerary",new UiActionService.Capability(false,false,maps)),executor,System::currentTimeMillis,()->Boolean.TRUE.equals(config.getUiActionsEnabled()));
  }
}

