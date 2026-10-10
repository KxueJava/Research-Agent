package org.wwz.ai.trigger.diagnostics;

import java.util.List;

/**
 * 启动自检结果。
 *
 * <p>只在本地/自托管场景用于回答"我起的这个后端到底是哪一个"：跑在什么 profile、
 * 连的哪个库、jar 是否比源码旧、库表是否齐全。所有字段都是诊断信息，不含任何密钥。</p>
 *
 * @param status             ok / warn
 * @param warnings           需要人工关注的条目
 * @param profiles           激活的 Spring profile
 * @param datasourceProduct  数据库产品名（MySQL / H2 ...）
 * @param databaseName       当前连接的库名
 * @param serverPort         实际监听端口
 * @param artifactPath       运行产物的路径（jar 或 classes 目录）
 * @param artifactTime       运行产物的构建时间
 * @param artifactStale      产物是否早于最新源码
 * @param newestSource       最新的后端源码文件
 * @param newestSourceTime   最新源码的修改时间
 * @param declaredTableCount schema.sql 声明的表数量
 * @param missingTables      声明了但库里不存在的表
 */
public record SelfCheckReport(
        String status,
        List<String> warnings,
        List<String> profiles,
        String datasourceProduct,
        String databaseName,
        String serverPort,
        String artifactPath,
        String artifactTime,
        boolean artifactStale,
        String newestSource,
        String newestSourceTime,
        int declaredTableCount,
        List<String> missingTables
) {

    public boolean healthy() {
        return "ok".equals(status);
    }
}
