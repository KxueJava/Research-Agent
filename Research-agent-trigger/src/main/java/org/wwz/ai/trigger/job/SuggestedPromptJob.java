package org.wwz.ai.trigger.job;

import jakarta.annotation.PreDestroy;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.wwz.ai.application.agent.suggestion.SuggestedPromptService;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.atomic.AtomicBoolean;

/** Startup, midnight and bounded retry generation all share a single background worker. */
@Component
@Profile("!test")
public class SuggestedPromptJob {
    private final SuggestedPromptService service;
    private final AtomicBoolean running = new AtomicBoolean();
    private final ExecutorService worker = Executors.newSingleThreadExecutor(
            Thread.ofPlatform().daemon(true).name("daily-suggested-prompts").factory());

    public SuggestedPromptJob(SuggestedPromptService service) { this.service = service; }

    @EventListener(ApplicationReadyEvent.class)
    public void onReady() { submit(); }

    @Scheduled(cron = "${research.suggested-prompts.cron:0 0 0 * * *}", zone = "Asia/Shanghai")
    public void daily() { submit(); }

    @Scheduled(fixedDelayString = "${research.suggested-prompts.retry-delay-ms:600000}",
            initialDelayString = "${research.suggested-prompts.retry-delay-ms:600000}")
    public void retryMissingBatch() { submit(); }

    private void submit() {
        if (!running.compareAndSet(false, true)) return;
        try {
            worker.execute(() -> {
                try { service.generateToday(); }
                finally { running.set(false); }
            });
        } catch (RejectedExecutionException shuttingDown) { running.set(false); }
    }

    @PreDestroy
    public void close() { worker.shutdownNow(); }
}
