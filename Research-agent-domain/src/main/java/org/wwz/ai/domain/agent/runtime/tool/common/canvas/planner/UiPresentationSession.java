package org.wwz.ai.domain.agent.runtime.tool.common.canvas.planner;

/** Request-scoped repair budget shared by every publication path, including streamed prefixes. */
public final class UiPresentationSession {
    private int failures;
    private java.util.List<UiPresentationPlanner.Surface> originalSurfaces;
    private UiPresentationPlanner.Input prefixInput;
    public synchronized UiPresentationPlanner.Input prefixInput(java.util.function.Supplier<UiPresentationPlanner.Input> loader){
        if(prefixInput==null)prefixInput=loader.get();return prefixInput;
    }
    public synchronized int reject(){return ++failures;}
    public synchronized boolean exhausted(){return failures>=3;}
    public synchronized java.util.List<UiPresentationPlanner.Surface> originals(java.util.List<UiPresentationPlanner.Surface> now){
        if(originalSurfaces==null)originalSurfaces=java.util.List.copyOf(now);return originalSurfaces;
    }
}
