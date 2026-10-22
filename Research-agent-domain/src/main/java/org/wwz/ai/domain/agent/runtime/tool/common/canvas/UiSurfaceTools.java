package org.wwz.ai.domain.agent.runtime.tool.common.canvas;

import org.wwz.ai.domain.agent.runtime.agent.AgentContext;
import java.util.UUID;

final class UiSurfaceTools {
    private UiSurfaceTools() {}
    static UiSurfaceStore store(AgentContext context) {
        return context==null||context.getRuntimeDependencies()==null?null:context.getRuntimeDependencies().getUiSurfaceStore();
    }
    static String eventId(AgentContext context) {
        var source=context==null?null:context.getCurrentToolArtifactSource();
        String call=source==null?null:source.getToolCallId();
        return call==null||call.isBlank()?UUID.randomUUID().toString():call;
    }
}
