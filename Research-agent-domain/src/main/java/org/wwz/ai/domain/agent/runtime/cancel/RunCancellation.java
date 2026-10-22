package org.wwz.ai.domain.agent.runtime.cancel;

import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.CopyOnWriteArraySet;

/**
 * 单轮 Agent run 的协作式取消标志（用户主动点击停止）。
 */
public class RunCancellation {

    public static final String REASON_USER_STOP = "user_stop";

    private final AtomicBoolean cancelled = new AtomicBoolean(false);
    private volatile String reason;
    private volatile long cancelledAtMs;
    private final CopyOnWriteArraySet<Runnable> listeners = new CopyOnWriteArraySet<>();

    public boolean cancel(String reason) {
        if (!cancelled.compareAndSet(false, true)) {
            return false;
        }
        this.reason = reason == null ? REASON_USER_STOP : reason;
        this.cancelledAtMs = System.currentTimeMillis();
        for(Runnable listener:listeners)if(listeners.remove(listener))notifyCancelled(listener);
        return true;
    }

    /** Remains subscribed across LLM completion until the owned resource is finalized. */
    public Runnable onCancel(Runnable listener) {
        listeners.add(listener);
        if(isCancelled() && listeners.remove(listener))notifyCancelled(listener);
        return () -> listeners.remove(listener);
    }
    private static void notifyCancelled(Runnable listener) {
        try {listener.run();} catch(RuntimeException ignored) { /* Other cancellation resources must still close. */ }
    }

    public boolean isCancelled() {
        return cancelled.get();
    }

    public String getReason() {
        return reason;
    }

    public long getCancelledAtMs() {
        return cancelledAtMs;
    }
}
