package org.wwz.ai.trigger.http;

import org.springframework.context.annotation.Profile;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.wwz.ai.api.response.Response;
import org.wwz.ai.application.agent.suggestion.SuggestedPromptService;
import org.wwz.ai.domain.agent.suggestion.SuggestedPromptBatch;
import org.wwz.ai.types.enums.ResponseCode;

/** Public read-only data; opening the home page cannot trigger a model invocation. */
@RestController
@Profile("!test")
public class SuggestedPromptController {
    private final SuggestedPromptService service;

    public SuggestedPromptController(SuggestedPromptService service) { this.service = service; }

    @GetMapping("/web/suggested-prompts")
    public Response<SuggestedPromptBatch> list(@RequestParam(name = "productType", defaultValue = "task") String productType) {
        return Response.<SuggestedPromptBatch>builder().code(ResponseCode.SUCCESS.getCode())
                .info(ResponseCode.SUCCESS.getInfo()).data(service.latest(productType)).build();
    }
}
