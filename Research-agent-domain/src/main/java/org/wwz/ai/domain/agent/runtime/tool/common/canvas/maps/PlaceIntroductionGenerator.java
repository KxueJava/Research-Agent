package org.wwz.ai.domain.agent.runtime.tool.common.canvas.maps;
import reactor.core.publisher.Flux;
import java.util.Map;
@FunctionalInterface
public interface PlaceIntroductionGenerator { Flux<String> generate(Map<String,Object> details); }
