package org.wwz.ai.domain.agent.research.data.dto;


import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * 向量索引写入请求模型。
 */
@Data
public class VectorSaveReq {
    private String collectionName;
    private List<VectorData> dataList;

    @Data
    public static class VectorData {
        private String embeddingText;
        private String uuid;
        private Map<String, Object> payloads;
    }
}
