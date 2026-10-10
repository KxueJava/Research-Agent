package org.wwz.ai.test.domain.support;

import org.springframework.core.env.Environment;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.scheduling.concurrent.ConcurrentTaskScheduler;
import org.springframework.test.util.ReflectionTestUtils;
import org.wwz.ai.domain.agent.adapter.port.FileArtifactPort;
import org.wwz.ai.domain.agent.adapter.port.RemoteHttpPort;
import org.wwz.ai.domain.agent.adapter.port.RemoteStreamPort;
import org.wwz.ai.domain.agent.runtime.llm.DomainMessageConverter;
import org.wwz.ai.domain.agent.runtime.llm.LlmChatModelResolver;
import org.wwz.ai.domain.agent.runtime.llm.LlmChatResponseMapper;
import org.wwz.ai.domain.agent.runtime.llm.LlmToolCallbackProvider;
import org.wwz.ai.domain.agent.runtime.llm.OpenAiChatOptionsFactory;
import org.wwz.ai.domain.agent.runtime.llm.StreamResponseHandler;
import org.wwz.ai.domain.agent.runtime.tool.mcp.runtime.McpRegistry;
import org.wwz.ai.domain.agent.runtime.tool.mcp.runtime.McpToolExecutor;
import org.wwz.ai.domain.agent.research.config.ResearchConfig;
import org.wwz.ai.domain.agent.runtime.ResearchLlmDependencies;
import org.wwz.ai.domain.agent.runtime.ResearchRuntimeDependencies;
import org.wwz.ai.domain.agent.research.service.imagegeneration.IImageGenerationExecutionKernel;
import org.wwz.ai.infrastructure.adapter.port.OkHttpRemoteHttpAdapter;
import org.wwz.ai.infrastructure.adapter.port.OkHttpRemoteStreamAdapter;
import org.wwz.ai.infrastructure.adapter.port.ResearchToolFileArtifactAdapter;

import java.util.concurrent.Executor;

/**
 * Research 运行时测试夹具。
 * 统一为单测构造最小可用的 ResearchRuntimeDependencies，避免测试回退到全局 Spring 上下文。
 */
public final class ResearchRuntimeTestSupport {

    private ResearchRuntimeTestSupport() {
    }

    public static ResearchRuntimeDependencies runtimeDependencies(ResearchConfig researchConfig) {
        return runtimeDependencies(researchConfig, null, new MockEnvironment(), null);
    }

    public static ResearchRuntimeDependencies runtimeDependencies(ResearchConfig researchConfig,
                                                                  RemoteHttpPort remoteHttpPort) {
        return runtimeDependencies(researchConfig, null, new MockEnvironment(), remoteHttpPort);
    }

    public static ResearchRuntimeDependencies runtimeDependencies(ResearchConfig researchConfig,
                                                                  IImageGenerationExecutionKernel imageKernel) {
        return runtimeDependencies(researchConfig, imageKernel, new MockEnvironment(), null);
    }

    public static ResearchRuntimeDependencies runtimeDependencies(ResearchConfig researchConfig,
                                                                  IImageGenerationExecutionKernel imageKernel,
                                                                  Environment environment) {
        return runtimeDependencies(researchConfig, imageKernel, environment, null);
    }

    public static ResearchRuntimeDependencies runtimeDependencies(ResearchConfig researchConfig,
                                                                  IImageGenerationExecutionKernel imageKernel,
                                                                  Environment environment,
                                                                  RemoteHttpPort overrideRemoteHttpPort) {
        DomainMessageConverter messageConverter = new DomainMessageConverter();
        ReflectionTestUtils.setField(messageConverter, "researchConfig", researchConfig);

        LlmToolCallbackProvider toolCallbackProvider = new LlmToolCallbackProvider();
        ReflectionTestUtils.setField(toolCallbackProvider, "mcpRegistry", org.mockito.Mockito.mock(McpRegistry.class));

        OpenAiChatOptionsFactory chatOptionsFactory = new OpenAiChatOptionsFactory();
        ReflectionTestUtils.setField(chatOptionsFactory, "toolCallbackProvider", toolCallbackProvider);

        StreamResponseHandler streamResponseHandler = new StreamResponseHandler();
        LlmChatResponseMapper responseMapper = new LlmChatResponseMapper();
        ReflectionTestUtils.setField(streamResponseHandler, "researchConfig", researchConfig);
        ReflectionTestUtils.setField(streamResponseHandler, "chatResponseMapper", responseMapper);
        ResearchLlmDependencies llmDependencies = ResearchLlmDependencies.builder()
                .chatModelResolver(new LlmChatModelResolver())
                .chatOptionsFactory(chatOptionsFactory)
                .messageConverter(messageConverter)
                .responseMapper(responseMapper)
                .streamResponseHandler(streamResponseHandler)
                .build();
        RemoteHttpPort remoteHttpPort = overrideRemoteHttpPort != null
                ? overrideRemoteHttpPort
                : new OkHttpRemoteHttpAdapter();
        RemoteStreamPort remoteStreamPort = new OkHttpRemoteStreamAdapter();
        FileArtifactPort fileArtifactPort = new ResearchToolFileArtifactAdapter(
                overrideRemoteHttpPort != null ? overrideRemoteHttpPort : new OkHttpRemoteHttpAdapter());
        Executor sameThreadExecutor = Runnable::run;

        return ResearchRuntimeDependencies.builder()
                .researchConfig(researchConfig)
                .environment(environment)
                .llmDependencies(llmDependencies)
                .mcpToolExecutor(null)
                .imageGenerationExecutionKernel(imageKernel)
                .remoteHttpPort(remoteHttpPort)
                .remoteStreamPort(remoteStreamPort)
                .fileArtifactPort(fileArtifactPort)
                .llmExecutor(sameThreadExecutor)
                .taskExecutor(sameThreadExecutor)
                .toolExecutor(sameThreadExecutor)
                .heartbeatScheduler(new ConcurrentTaskScheduler())
                .build();
    }
}
