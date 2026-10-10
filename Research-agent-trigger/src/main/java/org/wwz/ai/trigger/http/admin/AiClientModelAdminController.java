package org.wwz.ai.trigger.http.admin;

import org.wwz.ai.api.IAiClientModelAdminService;
import org.wwz.ai.api.dto.AiClientModelQueryRequestDTO;
import org.wwz.ai.api.dto.AiClientModelRequestDTO;
import org.wwz.ai.api.dto.AiClientModelResponseDTO;
import org.wwz.ai.api.response.Response;
import org.wwz.ai.domain.agent.runtime.llm.LLMSettings;
import org.wwz.ai.domain.agent.runtime.llm.LlmChatModelResolver;
import org.wwz.ai.domain.agent.runtime.llm.LlmModelCatalog;
import org.wwz.ai.infrastructure.dao.IAiClientApiDao;
import org.wwz.ai.infrastructure.dao.IAiClientModelDao;
import org.wwz.ai.infrastructure.dao.po.AiClientApi;
import org.wwz.ai.infrastructure.dao.po.AiClientModel;
import org.wwz.ai.types.enums.ResponseCode;
import lombok.Data;
import lombok.extern.slf4j.Slf4j;
import org.springframework.ai.chat.messages.UserMessage;
import org.springframework.ai.chat.model.ChatResponse;
import org.springframework.ai.chat.prompt.Prompt;
import org.springframework.ai.openai.OpenAiChatModel;
import org.springframework.beans.BeanUtils;
import org.springframework.beans.factory.ObjectProvider;
import com.alibaba.fastjson.JSON;
import org.springframework.util.StringUtils;
import org.springframework.web.bind.annotation.*;

import javax.annotation.Resource;
import java.time.Duration;
import java.time.LocalDateTime;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * AI客户端模型管理控制器
 * @description AI客户端模型配置管理控制器
 */
@Slf4j
@RestController
@RequestMapping("/api/v1/admin/ai-client-model")
@CrossOrigin(origins = "*", allowedHeaders = "*", methods = {RequestMethod.GET, RequestMethod.POST, RequestMethod.PUT, RequestMethod.DELETE, RequestMethod.OPTIONS})
public class AiClientModelAdminController implements IAiClientModelAdminService {

    /**
     * 连接测试只等首个流式 chunk：拿到首块即证明连通，不需要等完整生成。
     */
    private static final Duration CONNECTION_TEST_TIMEOUT = Duration.ofSeconds(30);

    @Resource
    private IAiClientModelDao aiClientModelDao;

    @Resource
    private ObjectProvider<LlmModelCatalog> llmModelCatalogProvider;

    @Resource
    private ObjectProvider<LlmChatModelResolver> llmChatModelResolverProvider;

    @Resource
    private IAiClientApiDao aiClientApiDao;

    @PostMapping("/available-models")
    public Response<List<String>> availableModels(@RequestBody AvailableModelsRequest request) {
        try {
            String baseUrl = StringUtils.trimWhitespace(request.getBaseUrl());
            String apiKey = StringUtils.trimWhitespace(request.getApiKey());
            if (StringUtils.hasText(request.getApiId())) {
                // 复用模式：baseUrl / key 由后端按 apiId 取，明文 key 不必回到浏览器
                AiClientApi stored = aiClientApiDao.queryByApiId(request.getApiId().trim());
                if (stored == null) {
                    throw new IllegalArgumentException("找不到供应商配置：" + request.getApiId());
                }
                baseUrl = StringUtils.trimWhitespace(stored.getBaseUrl());
                apiKey = StringUtils.trimWhitespace(stored.getApiKey());
            } else if (!StringUtils.hasText(baseUrl) || !StringUtils.hasText(apiKey)
                    || apiKey.contains("•") || apiKey.contains("*")) {
                throw new IllegalArgumentException("Base URL 与明文 API Key 必填；复用已有供应商请改传 apiId");
            }
            if (!StringUtils.hasText(baseUrl) || !StringUtils.hasText(apiKey)) {
                throw new IllegalArgumentException("该供应商的 Base URL 或 API Key 未配置");
            }
            String endpoint = baseUrl.replaceAll("/+$", "") + "/models";
            HttpRequest httpRequest = HttpRequest.newBuilder(URI.create(endpoint))
                    .timeout(Duration.ofSeconds(20))
                    .header("Authorization", "Bearer " + apiKey)
                    .header("Accept", "application/json")
                    .GET()
                    .build();
            HttpResponse<String> response = HttpClient.newHttpClient()
                    .send(httpRequest, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() / 100 != 2) {
                throw new IllegalStateException("上游返回 HTTP " + response.statusCode());
            }
            Map<String, Object> payload = JSON.parseObject(response.body());
            Object data = payload.get("data");
            List<String> modelIds = new ArrayList<>();
            if (data instanceof List<?> rows) {
                for (Object row : rows) {
                    if (row instanceof Map<?, ?> item) {
                        Object id = item.get("id");
                        if (id != null && StringUtils.hasText(String.valueOf(id))) {
                            modelIds.add(String.valueOf(id));
                        }
                    }
                }
            }
            modelIds.sort(String.CASE_INSENSITIVE_ORDER);
            return Response.<List<String>>builder().code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo()).data(modelIds).build();
        } catch (Exception e) {
            log.warn("获取上游可用模型列表失败 apiId={} baseUrl={}", request.getApiId(), request.getBaseUrl(), e);
            return Response.<List<String>>builder().code(ResponseCode.UN_ERROR.getCode())
                    .info(e.getMessage() == null ? "获取模型列表失败" : e.getMessage()).data(List.of()).build();
        }
    }

    /**
     * 真发一次极小请求测连接与延迟。
     * 失败不抛给网关：结果在 data.ok 里，便于前端展示。
     */
    @PostMapping("/test/{modelId}")
    public Response<Map<String, Object>> testConnection(@PathVariable("modelId") String modelId) {
        return testConnectionByReference(modelId);
    }

    @PostMapping("/test-by-id/{id}")
    public Response<Map<String, Object>> testConnectionById(@PathVariable("id") Long id) {
        return testConnectionByReference(LlmModelCatalog.BINDING_REF_PREFIX + id);
    }

    /**
     * 用「表单当前值」测连接，不落库。
     * <p>
     * 区别于点 {@code /test-by-id/{id}}（只按 ID 读库里已保存的配置）：这里接收页面上
     * 尚未保存的 baseUrl / apiKey / completionsPath，让用户能在保存前验证刚填的内容，
     * 避免出现「填了错的 key，测试却拿旧 key 报成功」。
     * <p>
     * apiKey 为空或仍是掩码（含 • 或 *）时回退到 id 对应的已存 key。
     */
    @PostMapping("/test-draft")
    public Response<Map<String, Object>> testConnectionDraft(@RequestBody TestConnectionDraftBody request) {
        Map<String, Object> body = new LinkedHashMap<>();
        LlmModelCatalog catalog = llmModelCatalogProvider.getIfAvailable();
        LlmChatModelResolver resolver = llmChatModelResolverProvider.getIfAvailable();
        if (catalog == null || resolver == null) {
            body.put("ok", false);
            body.put("ms", 0);
            body.put("message", "模型目录未装配");
            return Response.<Map<String, Object>>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(body)
                    .build();
        }
        try {
            String baseUrl = StringUtils.trimWhitespace(request.getBaseUrl());
            if (!StringUtils.hasText(baseUrl)) {
                throw new IllegalArgumentException("Base URL 不能为空");
            }
            LLMSettings settings = LLMSettings.builder()
                    .model(StringUtils.trimWhitespace(request.getModelName()))
                    .baseUrl(baseUrl)
                    .apiKey(resolveDraftApiKey(catalog, request))
                    .interfaceUrl(StringUtils.hasText(request.getCompletionsPath())
                            ? request.getCompletionsPath().trim()
                            : "/chat/completions")
                    .build();

            OpenAiChatModel chatModel = resolver.resolve(settings);
            long start = System.currentTimeMillis();
            // 与主链路一致走流式首块：非流式响应会被上游 gzip + chunked 截断。
            ChatResponse firstChunk = chatModel
                    .stream(new Prompt(List.of(new UserMessage("ping"))))
                    .blockFirst(CONNECTION_TEST_TIMEOUT);
            if (firstChunk == null) {
                throw new IllegalStateException("模型未返回任何流式响应");
            }
            body.put("ok", true);
            body.put("ms", System.currentTimeMillis() - start);
            body.put("message", "连接成功");
        } catch (Exception e) {
            log.warn("模型草稿连接测试失败 modelName={} baseUrl={}",
                    request.getModelName(), request.getBaseUrl(), e);
            body.put("ok", false);
            body.put("ms", 0);
            body.put("message", "连接失败: " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
        }
        return Response.<Map<String, Object>>builder()
                .code(ResponseCode.SUCCESS.getCode())
                .info(ResponseCode.SUCCESS.getInfo())
                .data(body)
                .build();
    }

    /**
     * 草稿测试用哪个 key：页面传了明文就用明文；空或掩码则回退到已存配置的 key。
     * 前端未改动 key 时展示的是 {@code sk-xxxx••••yyyy}，不能当真实 key 发出去。
     */
    private String resolveDraftApiKey(LlmModelCatalog catalog, TestConnectionDraftBody request) {
        String apiKey = StringUtils.trimWhitespace(request.getApiKey());
        boolean masked = !StringUtils.hasText(apiKey)
                || apiKey.contains("•")
                || apiKey.contains("*");
        if (!masked) {
            return apiKey;
        }
        if (request.getId() == null) {
            throw new IllegalArgumentException("API Key 不能为空");
        }
        return catalog.resolve(LlmModelCatalog.BINDING_REF_PREFIX + request.getId())
                .map(LLMSettings::getApiKey)
                .orElseThrow(() -> new IllegalStateException("找不到已保存的配置，无法回退 API Key"));
    }

    private Response<Map<String, Object>> testConnectionByReference(String modelReference) {
        Map<String, Object> body = new LinkedHashMap<>();
        LlmModelCatalog catalog = llmModelCatalogProvider.getIfAvailable();
        LlmChatModelResolver resolver = llmChatModelResolverProvider.getIfAvailable();
        if (catalog == null || resolver == null) {
            body.put("ok", false);
            body.put("ms", 0);
            body.put("message", "模型目录未装配");
            return Response.<Map<String, Object>>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(body)
                    .build();
        }
        try {
            LLMSettings settings = catalog.resolve(modelReference)
                    .orElseThrow(() -> new IllegalStateException("找不到可用模型配置：" + modelReference + "（需启用且配齐 API Key）"));
            OpenAiChatModel chatModel = resolver.resolve(settings);
            long start = System.currentTimeMillis();
            // 必须走流式，与主链路 LLM 调用保持一致：上游对流式响应不做 gzip，
            // 而非流式响应会带 Content-Encoding: gzip + Transfer-Encoding: chunked，
            // 在部分 HTTP 客户端下会读到截断的 body，表现为 Jackson JsonEOFException，
            // 与模型/key 配置无关。只取首块即可证明连通。
            ChatResponse firstChunk = chatModel
                    .stream(new Prompt(List.of(new UserMessage("ping"))))
                    .blockFirst(CONNECTION_TEST_TIMEOUT);
            if (firstChunk == null) {
                throw new IllegalStateException("模型未返回任何流式响应");
            }
            long ms = System.currentTimeMillis() - start;
            body.put("ok", true);
            body.put("ms", ms);
            body.put("message", "连接成功");
        } catch (Exception e) {
            log.warn("模型连接测试失败 modelReference={}", modelReference, e);
            body.put("ok", false);
            body.put("ms", 0);
            body.put("message", "连接失败: " + (e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage()));
        }
        return Response.<Map<String, Object>>builder()
                .code(ResponseCode.SUCCESS.getCode())
                .info(ResponseCode.SUCCESS.getInfo())
                .data(body)
                .build();
    }

    @Override
    @PostMapping("/create")
    public Response<Boolean> createAiClientModel(@RequestBody AiClientModelRequestDTO request) {
        try {
            log.info("创建AI客户端模型配置请求：{}", request);

            // DTO转PO
            AiClientModel aiClientModel = convertToAiClientModel(request);
            aiClientModel.setCreateTime(LocalDateTime.now());
            aiClientModel.setUpdateTime(LocalDateTime.now());

            int result = aiClientModelDao.insert(aiClientModel);
            if (result > 0) {
                invalidateLlmCatalog();
            }

            return Response.<Boolean>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(result > 0)
                    .build();
        } catch (Exception e) {
            log.error("创建AI客户端模型配置失败", e);
            return Response.<Boolean>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(false)
                    .build();
        }
    }

    @Override
    @PutMapping("/update-by-id")
    public Response<Boolean> updateAiClientModelById(@RequestBody AiClientModelRequestDTO request) {
        try {
            log.info("根据ID更新AI客户端模型配置请求：{}", request);

            if (request.getId() == null) {
                return Response.<Boolean>builder()
                        .code(ResponseCode.ILLEGAL_PARAMETER.getCode())
                        .info("ID不能为空")
                        .data(false)
                        .build();
            }

            // DTO转PO
            AiClientModel aiClientModel = convertToAiClientModel(request);
            aiClientModel.setUpdateTime(LocalDateTime.now());

            int result = aiClientModelDao.updateById(aiClientModel);
            if (result > 0) {
                invalidateLlmCatalog();
            }

            return Response.<Boolean>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(result > 0)
                    .build();
        } catch (Exception e) {
            log.error("根据ID更新AI客户端模型配置失败", e);
            return Response.<Boolean>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(false)
                    .build();
        }
    }

    @Override
    @PutMapping("/update-by-model-id")
    public Response<Boolean> updateAiClientModelByModelId(@RequestBody AiClientModelRequestDTO request) {
        try {
            log.info("根据模型ID更新AI客户端模型配置请求：{}", request);

            if (!StringUtils.hasText(request.getModelId())) {
                return Response.<Boolean>builder()
                        .code(ResponseCode.ILLEGAL_PARAMETER.getCode())
                        .info("模型ID不能为空")
                        .data(false)
                        .build();
            }

            if (request.getId() != null) {
                return updateAiClientModelById(request);
            }

            if (aiClientModelDao.queryAllByModelId(request.getModelId()).size() != 1) {
                return Response.<Boolean>builder()
                        .code(ResponseCode.ILLEGAL_PARAMETER.getCode())
                        .info("模型ID存在多条配置，请使用记录ID更新")
                        .data(false)
                        .build();
            }

            // DTO转PO
            AiClientModel aiClientModel = convertToAiClientModel(request);
            aiClientModel.setUpdateTime(LocalDateTime.now());

            int result = aiClientModelDao.updateByModelId(aiClientModel);
            if (result > 0) {
                invalidateLlmCatalog();
            }

            return Response.<Boolean>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(result > 0)
                    .build();
        } catch (Exception e) {
            log.error("根据模型ID更新AI客户端模型配置失败", e);
            return Response.<Boolean>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(false)
                    .build();
        }
    }

    @Override
    @DeleteMapping("/delete-by-id/{id}")
    public Response<Boolean> deleteAiClientModelById(@PathVariable("id") Long id) {
        try {
            log.info("根据ID删除AI客户端模型配置请求：{}", id);

            int result = aiClientModelDao.deleteById(id);
            if (result > 0) {
                invalidateLlmCatalog();
            }

            return Response.<Boolean>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(result > 0)
                    .build();
        } catch (Exception e) {
            log.error("根据ID删除AI客户端模型配置失败", e);
            return Response.<Boolean>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(false)
                    .build();
        }
    }

    @Override
    @DeleteMapping("/delete-by-model-id/{modelId}")
    public Response<Boolean> deleteAiClientModelByModelId(@PathVariable("modelId") String modelId) {
        try {
            log.info("根据模型ID删除AI客户端模型配置请求：{}", modelId);

            if (aiClientModelDao.queryAllByModelId(modelId).size() != 1) {
                return Response.<Boolean>builder()
                        .code(ResponseCode.ILLEGAL_PARAMETER.getCode())
                        .info("模型ID存在多条配置，请使用记录ID删除")
                        .data(false)
                        .build();
            }

            int result = aiClientModelDao.deleteByModelId(modelId);
            if (result > 0) {
                invalidateLlmCatalog();
            }

            return Response.<Boolean>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(result > 0)
                    .build();
        } catch (Exception e) {
            log.error("根据模型ID删除AI客户端模型配置失败", e);
            return Response.<Boolean>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(false)
                    .build();
        }
    }

    private void invalidateLlmCatalog() {
        LlmModelCatalog catalog = llmModelCatalogProvider.getIfAvailable();
        if (catalog != null) {
            catalog.invalidateAll();
        }
    }

    @Override
    @GetMapping("/query-by-id/{id}")
    public Response<AiClientModelResponseDTO> queryAiClientModelById(@PathVariable("id") Long id) {
        try {
            log.info("根据ID查询AI客户端模型配置请求：{}", id);

            AiClientModel aiClientModel = aiClientModelDao.queryById(id);

            if (aiClientModel == null) {
                return Response.<AiClientModelResponseDTO>builder()
                        .code(ResponseCode.UN_ERROR.getCode())
                        .info("未找到对应的AI客户端模型配置")
                        .data(null)
                        .build();
            }

            // PO转DTO
            AiClientModelResponseDTO responseDTO = convertToAiClientModelResponseDTO(aiClientModel);

            return Response.<AiClientModelResponseDTO>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(responseDTO)
                    .build();
        } catch (Exception e) {
            log.error("根据ID查询AI客户端模型配置失败", e);
            return Response.<AiClientModelResponseDTO>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(null)
                    .build();
        }
    }

    @Override
    @GetMapping("/query-by-model-id/{modelId}")
    public Response<AiClientModelResponseDTO> queryAiClientModelByModelId(@PathVariable("modelId") String modelId) {
        try {
            log.info("根据模型ID查询AI客户端模型配置请求：{}", modelId);

            AiClientModel aiClientModel = aiClientModelDao.queryByModelId(modelId);

            if (aiClientModel == null) {
                return Response.<AiClientModelResponseDTO>builder()
                        .code(ResponseCode.UN_ERROR.getCode())
                        .info("未找到对应的AI客户端模型配置")
                        .data(null)
                        .build();
            }

            // PO转DTO
            AiClientModelResponseDTO responseDTO = convertToAiClientModelResponseDTO(aiClientModel);

            return Response.<AiClientModelResponseDTO>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(responseDTO)
                    .build();
        } catch (Exception e) {
            log.error("根据模型ID查询AI客户端模型配置失败", e);
            return Response.<AiClientModelResponseDTO>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(null)
                    .build();
        }
    }

    @Override
    @GetMapping("/query-by-api-id/{apiId}")
    public Response<List<AiClientModelResponseDTO>> queryAiClientModelsByApiId(@PathVariable("apiId") String apiId) {
        try {
            log.info("根据API配置ID查询AI客户端模型配置列表请求：{}", apiId);

            List<AiClientModel> aiClientModels = aiClientModelDao.queryByApiId(apiId);

            // PO转DTO
            List<AiClientModelResponseDTO> responseDTOs = aiClientModels.stream()
                    .map(this::convertToAiClientModelResponseDTO)
                    .collect(Collectors.toList());

            return Response.<List<AiClientModelResponseDTO>>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(responseDTOs)
                    .build();
        } catch (Exception e) {
            log.error("根据API配置ID查询AI客户端模型配置列表失败", e);
            return Response.<List<AiClientModelResponseDTO>>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(null)
                    .build();
        }
    }

    @Override
    @GetMapping("/query-by-model-type/{modelType}")
    public Response<List<AiClientModelResponseDTO>> queryAiClientModelsByModelType(@PathVariable("modelType") String modelType) {
        try {
            log.info("根据模型类型查询AI客户端模型配置列表请求：{}", modelType);

            List<AiClientModel> aiClientModels = aiClientModelDao.queryByModelType(modelType);

            // PO转DTO
            List<AiClientModelResponseDTO> responseDTOs = aiClientModels.stream()
                    .map(this::convertToAiClientModelResponseDTO)
                    .collect(Collectors.toList());

            return Response.<List<AiClientModelResponseDTO>>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(responseDTOs)
                    .build();
        } catch (Exception e) {
            log.error("根据模型类型查询AI客户端模型配置列表失败", e);
            return Response.<List<AiClientModelResponseDTO>>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(null)
                    .build();
        }
    }

    @Override
    @GetMapping("/query-enabled")
    public Response<List<AiClientModelResponseDTO>> queryEnabledAiClientModels() {
        try {
            log.info("查询所有启用的AI客户端模型配置请求");

            List<AiClientModel> aiClientModels = aiClientModelDao.queryEnabledModels();

            // PO转DTO
            List<AiClientModelResponseDTO> responseDTOs = aiClientModels.stream()
                    .map(this::convertToAiClientModelResponseDTO)
                    .collect(Collectors.toList());

            return Response.<List<AiClientModelResponseDTO>>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(responseDTOs)
                    .build();
        } catch (Exception e) {
            log.error("查询所有启用的AI客户端模型配置失败", e);
            return Response.<List<AiClientModelResponseDTO>>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(null)
                    .build();
        }
    }

    /**
     * 启用的模型按供应商分组，供对话输入框做「供应商 → 模型」两级选择。
     * <p>
     * 只返回分组展示所需字段，<b>不含 apiKey</b>：选择器不需要凭据，而
     * {@code /ai-client-api/query-enabled} 会原样返回明文 key，不能拿来做前端 join。
     * 是否可选中（备用模型等）仍由调用方按 {@code modelUsage} 判定，与既有行为一致。
     */
    @GetMapping("/query-enabled-grouped")
    public Response<List<ModelGroupVO>> queryEnabledGrouped() {
        try {
            Map<String, String> baseUrlByApiId = new LinkedHashMap<>();
            for (AiClientApi api : aiClientApiDao.queryEnabledApis()) {
                baseUrlByApiId.put(api.getApiId(), api.getBaseUrl());
            }

            Map<String, ModelGroupVO> grouped = new LinkedHashMap<>();
            for (AiClientModel model : aiClientModelDao.queryEnabledModels()) {
                String apiId = StringUtils.hasText(model.getApiId()) ? model.getApiId() : "";
                ModelGroupVO group = grouped.computeIfAbsent(apiId, key -> {
                    ModelGroupVO vo = new ModelGroupVO();
                    vo.setApiId(key);
                    vo.setBaseUrl(baseUrlByApiId.getOrDefault(key, ""));
                    vo.setModels(new ArrayList<>());
                    return vo;
                });
                ModelItemVO item = new ModelItemVO();
                item.setId(model.getId());
                item.setModelId(model.getModelId());
                item.setModelName(model.getModelName());
                item.setModelUsage(model.getModelUsage());
                item.setSupportsThinking(model.getSupportsThinking());
                item.setSupportedReasoningEfforts(parseReasoningEfforts(model.getSupportedReasoningEffortsJson()));
                item.setContextWindow(model.getContextWindow());
                group.getModels().add(item);
            }

            return Response.<List<ModelGroupVO>>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(new ArrayList<>(grouped.values()))
                    .build();
        } catch (Exception e) {
            log.error("查询启用的模型分组失败", e);
            return Response.<List<ModelGroupVO>>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(null)
                    .build();
        }
    }

    @Override
    @PostMapping("/query-list")
    public Response<List<AiClientModelResponseDTO>> queryAiClientModelList(@RequestBody AiClientModelQueryRequestDTO request) {
        try {
            log.info("根据条件查询AI客户端模型配置列表请求：{}", request);

            List<AiClientModel> aiClientModels;

            // 根据不同条件查询
            if (StringUtils.hasText(request.getModelId())) {
                aiClientModels = aiClientModelDao.queryAllByModelId(request.getModelId());
            } else if (StringUtils.hasText(request.getApiId())) {
                aiClientModels = aiClientModelDao.queryByApiId(request.getApiId());
            } else if (StringUtils.hasText(request.getModelType())) {
                aiClientModels = aiClientModelDao.queryByModelType(request.getModelType());
            } else if (request.getStatus() != null) {
                if (request.getStatus() == 1) {
                    aiClientModels = aiClientModelDao.queryEnabledModels();
                } else {
                    aiClientModels = aiClientModelDao.queryAll();
                }
            } else {
                aiClientModels = aiClientModelDao.queryAll();
            }

            // PO转DTO
            List<AiClientModelResponseDTO> responseDTOs = aiClientModels.stream()
                    .map(this::convertToAiClientModelResponseDTO)
                    .collect(Collectors.toList());

            return Response.<List<AiClientModelResponseDTO>>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(responseDTOs)
                    .build();
        } catch (Exception e) {
            log.error("根据条件查询AI客户端模型配置列表失败", e);
            return Response.<List<AiClientModelResponseDTO>>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(null)
                    .build();
        }
    }

    @Override
    @GetMapping("/query-all")
    public Response<List<AiClientModelResponseDTO>> queryAllAiClientModels() {
        try {
            log.info("查询所有AI客户端模型配置请求");

            List<AiClientModel> aiClientModels = aiClientModelDao.queryAll();

            // PO转DTO
            List<AiClientModelResponseDTO> responseDTOs = aiClientModels.stream()
                    .map(this::convertToAiClientModelResponseDTO)
                    .collect(Collectors.toList());

            return Response.<List<AiClientModelResponseDTO>>builder()
                    .code(ResponseCode.SUCCESS.getCode())
                    .info(ResponseCode.SUCCESS.getInfo())
                    .data(responseDTOs)
                    .build();
        } catch (Exception e) {
            log.error("查询所有AI客户端模型配置失败", e);
            return Response.<List<AiClientModelResponseDTO>>builder()
                    .code(ResponseCode.UN_ERROR.getCode())
                    .info(ResponseCode.UN_ERROR.getInfo())
                    .data(null)
                    .build();
        }
    }

    /**
     * DTO转PO对象
     */
    private AiClientModel convertToAiClientModel(AiClientModelRequestDTO requestDTO) {
        AiClientModel aiClientModel = new AiClientModel();
        BeanUtils.copyProperties(requestDTO, aiClientModel);
        aiClientModel.setSupportedReasoningEffortsJson(serializeReasoningEfforts(requestDTO.getSupportedReasoningEfforts()));
        return aiClientModel;
    }

    /**
     * PO转DTO对象
     */
    private AiClientModelResponseDTO convertToAiClientModelResponseDTO(AiClientModel aiClientModel) {
        AiClientModelResponseDTO responseDTO = new AiClientModelResponseDTO();
        BeanUtils.copyProperties(aiClientModel, responseDTO);
        responseDTO.setSupportedReasoningEfforts(parseReasoningEfforts(aiClientModel.getSupportedReasoningEffortsJson()));
        return responseDTO;
    }

    private static String serializeReasoningEfforts(List<String> efforts) {
        if (efforts == null || efforts.isEmpty()) return "[]";
        List<String> allowed = List.of("low", "medium", "high", "max", "ultra");
        List<String> selected = efforts.stream().filter(StringUtils::hasText).map(String::trim).distinct().toList();
        return com.alibaba.fastjson.JSON.toJSONString(allowed.stream().filter(selected::contains).toList());
    }

    private static List<String> parseReasoningEfforts(String json) {
        if (!StringUtils.hasText(json)) return List.of();
        try {
            List<String> parsed = com.alibaba.fastjson.JSON.parseArray(json, String.class);
            return parsed == null ? List.of() : parsed;
        } catch (RuntimeException ignored) {
            return List.of();
        }
    }

    /**
     * 草稿连接测试入参：页面当前值，不落库。
     */
    @Data
    public static class TestConnectionDraftBody {
        /** 已保存配置 ID；apiKey 为空或掩码时用它回退到真实 key */
        private Long id;
        private String modelName;
        private String baseUrl;
        private String apiKey;
        private String completionsPath;
    }

    @Data
    public static class AvailableModelsRequest {
        private String baseUrl;
        private String apiKey;
        /** 复用模式：按已存供应商取 baseUrl 与 key，与 baseUrl/apiKey 二选一 */
        private String apiId;
    }

    /**
     * 对话选择器用：一个供应商下的模型分组。刻意不含 apiKey。
     */
    @Data
    public static class ModelGroupVO {
        private String apiId;
        private String baseUrl;
        private List<ModelItemVO> models;
    }

    @Data
    public static class ModelItemVO {
        private Long id;
        private String modelId;
        private String modelName;
        private String modelUsage;
        private Integer supportsThinking;
        private List<String> supportedReasoningEfforts;
        private Integer contextWindow;
    }

}
