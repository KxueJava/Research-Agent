package org.wwz.ai.domain.agent.research.service.imagegeneration;

import org.wwz.ai.domain.agent.research.model.imagegeneration.ImageGenerationExecuteCommand;
import org.wwz.ai.domain.agent.research.model.imagegeneration.ImageGenerationExecutionResult;

/**
 * 生图执行内核。
 */
public interface IImageGenerationExecutionKernel {

    ImageGenerationExecutionResult execute(ImageGenerationExecuteCommand command);
}
