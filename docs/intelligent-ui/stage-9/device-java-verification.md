# 第 3、4 项收尾记录

更新：2026-10-22。原始执行发生于 2026-10-21；中断后重新核对日志、XML 和临时资源清理状态，没有重复运行通过的套件。

## Java 隔离回归

已执行完整 reactor 中可本地复现的选定用例：195 类、826 项，其中 825 通过、1 项显式跳过，0 失败、0 错误。

| 模块 | 类 | 测试 | 跳过 |
|---|---:|---:|---:|
| app | 145 | 608 | 1 |
| domain | 48 | 216 | 0 |
| case | 2 | 2 | 0 |

证据：`java-full-isolated.log`、`java-isolation-result.json`、`java-final-report-crosscheck.json`。
最后一份交叉检查按运行开始时间排除旧 XML，核对类名唯一性、选择清单完整性及总数，不能仅凭 Maven 的 BUILD SUCCESS 判定。

BrowserMcpIntegrationTest 因没有显式启用真实 Browser MCP 服务而跳过。另有 11 个未纳入此轮的类，逐项见 `java-isolated-selection.json`：8 个外部模型/Elasticsearch/独立服务类，ApiTest 和 PrometheusMetricsGeneratorTest 两个手工演示，以及没有 JUnit 方法的 SimpleParserTest。它们没有被记为通过。ApiTest 仅打印预置实验数值，不作为产品能力证据。

### 隔离边界

`scripts/stage9-java-isolated.py` 创建随机临时 MySQL 库和仅拥有该库权限的账号，只加载 schema 与合成数据，不复制业务行或模型凭证。四个 UI/JDBC 用例必须使用显式隔离 URL；选定用例中出现其他直接 MySQL/file-H2 URL 时脚本拒绝执行。三个 DAO 类加载 Mapper/XML 的小型 Spring 上下文并使用事务回滚，不启动模型、MCP 或应用初始化器。两个配置探针只验证配置/条件装配，生产缺配置场景使用显式内存 H2 参数。

Maven 的 Windows 命令行长度限制通过标准 Java launcher 参数文件处理。测试数量为零、报告过期/缺失或类数不匹配均返回失败。最终清理曾遇到管理连接空闲过期；按临时库准确名称、40 张表、建表时间及账号授权验证身份后清理，脚本补充重连保护。2026-10-22 再查：临时库 0、临时账号 0。

### 失败的修订依据

- Surefire 2.6 创建分叉配置失败；更新为 3.2.5，并补齐 JUnit Vintage。首次缺 Vintage 的零测试构建保留为红记录，未计成功。
- JVM 临时目录权限导致 Mockito agent 和文件夹具失败；测试进程显式使用工作区内临时目录。
- 新建库暴露 UI 表与会话表排序规则不同，JOIN 报 illegal mix of collations；schema 与 UI store 新建表 DDL 明确 InnoDB/utf8mb4_unicode_ci。未对现有业务库执行 ALTER；CREATE IF NOT EXISTS 不修复已有异构表，已有库若存在差异仍需单独迁移审查。
- 边界测试仍引用旧模块名；改为当前目录，保留架构断言。
- 陈旧夹具使用直接 llmObservation、prose 写文件返回值、historyDialogue 和无配置的 Qdrant 传输选择；按当前 llmData/中央序列化、结构化工具结果、working-memory 及显式传输契约修订，保留内容、结果和归属检查。
- WorkspacePaths 在任意命名 checkout 的父目录启动时定位错误，SkillDirectoryResolver 在嵌套临时测试布局中优先选错祖先；修正代码锚点/显式锚点优先级。审查发现打包 JAR 的非文件 URI 风险后，新增红绿回归并保留原工作目录回退。
- 独立 domain 测试暴露本地 wrench jar 内嵌旧 Logback 类；显式优先 Boot 管理的日志依赖。本地 jar 仍有重复日志类，应在后续依赖治理中替换为干净构件，不能宣称已消除重复类。
- 旧定向 javac 曾将 domain 测试字节码留在 app/test-classes，导致重复执行旧版本；只清理经过绝对路径校验的生成目录，再执行全 reactor。业务 classes、运行 jar 和业务数据未清理。

## 本机资源与真机

已补充专属 Playwright 浏览器进程树的 33 份原生采样，覆盖 private/working-set、句柄、线程及 GPU dedicated/shared usage。见 `browser-native-soak.jsonl` 和 `native-resource-result.json`。

观察到 121 次地图创建/销毁均配对，清理后 JS 堆 15,843,340 字节、连接 DOM 143、活动地图 0；另 10 次循环后累计 131/131、JS 堆 16,260,768 字节、连接 DOM 143、活动地图 0。高频循环中 GPU 进程 private bytes 曾约 1.66 GB，静置和清理后约 313 MB；GPU shared usage 明显回落。峰值与残留分别保留，不把计数配对当作原生资源稳定证明。

首次长浏览器调用达到 300 秒工具超时，结构化结果未完整返回，原生采样器继续记录；后续清理/堆快照单独取证。因此本轮是有边界的本机观察，未标为完整长时性能通过，也未据此承诺资源预算。

用户确认暂无可用 Android/iPhone。真机触控、设备旋转、实际发布网络、Wi-Fi/蜂窝切换及更长时间运行仍待验收。可复用操作清单见 `device-acceptance.md`。临时 8820 服务已按 PID 和命令归属核对后停止。

## 当前发布结论

仍为 NO_GO。Java 可本地复现的自动化回归已完成；不等于外部服务/真实模型全部通过。仍需默认模型凭证修复后的真实链路、真实手机/发布网络及完整长时资源验收，并保留现有构建/依赖警告和旧二进制回退限制。没有提交、推送或远程部署。
