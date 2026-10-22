package org.wwz.ai.config;
import org.springframework.context.annotation.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.wwz.ai.domain.agent.adapter.port.RemoteHttpPort;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.UiSurfaceStore;
import org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps.*;
import org.wwz.ai.infrastructure.maps.AmapProvider;
import org.wwz.ai.infrastructure.maps.LlmPlaceIntroductionGenerator;
import org.wwz.ai.domain.agent.runtime.llm.*;
import java.time.Duration;

@Configuration
@ConditionalOnProperty(name="research.ui.surfaces.enabled",havingValue="true",matchIfMissing=true)
public class MapConfiguration {
    @Bean public PlaceIntroductionService placeIntroductionService(MapService maps,LlmModelCatalog catalog,LlmChatModelResolver resolver,OpenAiChatOptionsFactory options,@Value("${research.maps.introduction.model:default}") String model,@Value("${research.maps.introduction.timeout-seconds:90}") long timeout){
        return new PlaceIntroductionService(maps,new LlmPlaceIntroductionGenerator(catalog,resolver,options,model),Duration.ofSeconds(timeout));
    }
    @Bean public MapService mapService(RemoteHttpPort http,UiSurfaceStore surfaces,org.wwz.ai.domain.agent.research.config.ResearchConfig config,@Value("${AMAP_WEB_KEY:}") String key){
        var provider=new AmapProvider(http,key);return new MapService(new MapPlanner(provider,provider,"amap"),surfaces,()->Boolean.TRUE.equals(config.getUiMapsEnabled()));
    }
}
