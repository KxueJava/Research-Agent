package org.wwz.ai.domain.agent.research.data.provider;


import org.wwz.ai.domain.agent.research.data.QueryResult;


/**
 * 数据查询执行端口。
 * <p>根据请求读取业务数据，具体数据库或远端查询实现由基础设施层提供。</p>
 */
public interface DataProvider<T extends DataQueryRequest> {

    QueryResult queryData(T request) throws Exception;

    boolean queryForTest(T request);
}
