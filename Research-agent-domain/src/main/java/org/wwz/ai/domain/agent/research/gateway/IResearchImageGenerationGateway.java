package org.wwz.ai.domain.agent.research.gateway;

import org.wwz.ai.domain.agent.research.model.imagegeneration.ImageGenerationGatewayRequest;
import org.wwz.ai.domain.agent.research.model.imagegeneration.ImageGenerationGatewayResponse;

/**
 * 生图工作台下游调用端口。
 */
public interface IResearchImageGenerationGateway {

    /**
     * 调用下游图片生成服务。
     */
    ImageGenerationGatewayResponse generate(ImageGenerationGatewayRequest request);
}
