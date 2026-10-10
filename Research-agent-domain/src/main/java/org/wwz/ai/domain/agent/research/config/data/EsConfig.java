package org.wwz.ai.domain.agent.research.config.data;

import lombok.Data;

@Data
/**
 * 延期保留的 Elasticsearch 连接配置。
 */
public class EsConfig {
    private Boolean enable;
    private String host;
    private String user;
    private String password;
    private String apiKey;
    private String scheme;
}
