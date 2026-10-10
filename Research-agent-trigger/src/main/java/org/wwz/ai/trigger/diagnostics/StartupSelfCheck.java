package org.wwz.ai.trigger.diagnostics;

import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.context.annotation.Profile;
import org.springframework.core.env.Environment;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.io.File;
import java.io.InputStream;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

/**
 * 启动自检：启动完成时打一段人可读的体检报告，并暴露到 {@code GET /web/self-check}。
 *
 * <p>动机来自反复出现的"改了没生效"——同一个后端可能因为漏了
 * {@code --spring.profiles.active=prod} 而落到 H2 内存库（表现为登录正常但所有
 * {@code /api/agent/**} 报 500），也可能因为 jar 没重建而跑着旧代码。这两种情况
 * 报错信息都和真实原因无关，排查成本极高。这里把答案直接写在启动日志里。</p>
 *
 * <p>所有检查都不阻断启动：任何一项失败只记录为警告，不会让应用起不来。</p>
 *
 * <p>检查放在 {@code @PostConstruct} 而不是 {@code ApplicationReadyEvent}：
 * Web 容器在 ready 事件之前就已开始接受请求，用 ready 事件会让
 * {@code /web/self-check} 存在一个返回 503 的空窗口——而"用错 profile"恰恰是
 * 最需要这个接口的时候。放在 PostConstruct 则报告在对外可用前就已生成。</p>
 */
@Slf4j
@Component
@Profile("!test")
public class StartupSelfCheck {

    /**
     * 从 schema.sql 抽取表名。
     *
     * <p>注意这里**没有**用 {@code ^\s*CREATE} 这种行首锚定：{@code \s} 会跨行匹配，
     * 导致部分 CREATE 语句被漏掉（曾因此误报"库表漂移"）。</p>
     */
    private static final Pattern CREATE_TABLE = Pattern.compile(
            "CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?`?(\\w+)`?",
            Pattern.CASE_INSENSITIVE);

    private static final List<String> SOURCE_SCAN_DIRS =
            List.of("src/main/java", "src/main/resources");

    private static final DateTimeFormatter TIME_FORMAT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss").withZone(ZoneId.systemDefault());

    private final DataSource dataSource;
    private final Environment environment;

    private volatile SelfCheckReport report;

    public StartupSelfCheck(@Qualifier("mysqlDataSource") DataSource dataSource,
                            Environment environment) {
        this.dataSource = dataSource;
        this.environment = environment;
    }

    @PostConstruct
    public void initialize() {
        List<String> warnings = new ArrayList<>();
        List<String> profiles = List.of(environment.getActiveProfiles());

        String product = "unknown";
        String database = "unknown";
        try (Connection connection = dataSource.getConnection()) {
            DatabaseMetaData meta = connection.getMetaData();
            product = meta.getDatabaseProductName();
            database = String.valueOf(connection.getCatalog());
        } catch (Exception e) {
            warnings.add("数据源不可用: " + e.getMessage());
        }

        // 默认 profile 会落到 H2 内存库：登录能过（schema.sql 里有 admin_user），
        // 但 ai_agent_visitor_identity 等表缺失，于是所有 /api/agent/** 直接 500。
        if (profiles.isEmpty()) {
            warnings.add("未激活任何 profile —— 默认配置使用 H2 内存库，请补 --spring.profiles.active=prod");
        } else if (profiles.stream().noneMatch("prod"::equalsIgnoreCase)) {
            warnings.add("当前 profile 不是 prod（" + String.join(",", profiles) + "），确认是否连对了库");
        }
        if (product.toLowerCase().contains("h2")) {
            warnings.add("正在使用 H2 内存库，重启即丢数据，这不是可用的运行形态");
        }

        int declaredCount = 0;
        List<String> missing = List.of();
        try {
            Set<String> declared = declaredTables();
            declaredCount = declared.size();
            missing = findMissingTables(declared);
            if (!missing.isEmpty()) {
                warnings.add("以下表只在 schema.sql 声明、库里不存在: " + String.join(", ", missing));
            }
        } catch (Exception e) {
            warnings.add("库表比对失败: " + e.getMessage());
        }

        Artifact artifact = inspectArtifact();
        if (artifact.stale()) {
            warnings.add("运行产物早于最新源码，改动不会生效，需要重新构建: "
                    + artifact.newestSource() + " (" + artifact.newestSourceTime() + ")");
        }

        SelfCheckReport next = new SelfCheckReport(
                warnings.isEmpty() ? "ok" : "warn",
                List.copyOf(warnings),
                profiles,
                product,
                database,
                resolvePort(),
                artifact.path(),
                artifact.time(),
                artifact.stale(),
                artifact.newestSource(),
                artifact.newestSourceTime(),
                declaredCount,
                missing);
        this.report = next;
        logReport(next);
    }

    /** 供 {@code /web/self-check} 读取；尚未完成自检时返回 null。 */
    public SelfCheckReport report() {
        return report;
    }

    /**
     * 读取配置的监听端口。
     *
     * <p>这里刻意用配置值而不是 WebServer 实际绑定值：自检在 PostConstruct 阶段运行，
     * 那时容器尚未绑定端口。而"端口配错"本身就是我们要抓的问题，配置值足够。</p>
     */
    private String resolvePort() {
        return environment.getProperty("server.port", "unknown");
    }

    private Set<String> declaredTables() throws Exception {
        String sql;
        try (InputStream in = new ClassPathResource("db/schema.sql").getInputStream()) {
            sql = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        Set<String> names = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        Matcher matcher = CREATE_TABLE.matcher(sql);
        while (matcher.find()) {
            names.add(matcher.group(1));
        }
        return names;
    }

    private List<String> findMissingTables(Set<String> declared) throws Exception {
        Set<String> live = new TreeSet<>(String.CASE_INSENSITIVE_ORDER);
        try (Connection connection = dataSource.getConnection()) {
            DatabaseMetaData meta = connection.getMetaData();
            try (ResultSet rs = meta.getTables(connection.getCatalog(), null, "%", new String[]{"TABLE"})) {
                while (rs.next()) {
                    live.add(rs.getString("TABLE_NAME"));
                }
            }
        }
        // 大小写不敏感：H2 默认把标识符转成大写，MySQL 保留建表时的大小写
        return declared.stream().filter(name -> !live.contains(name)).sorted().toList();
    }

    private Artifact inspectArtifact() {
        try {
            Path artifact = resolveArtifactPath();
            if (artifact == null) {
                log.debug("无法定位运行产物，跳过产物新鲜度检查");
                return new Artifact("", "", false, "", "");
            }
            if (Files.isDirectory(artifact)) {
                // 开发态（target/classes 或 IDE 输出）没有单一构建产物，时间戳比对无意义
                return new Artifact(artifact.toString(), "", false, "", "");
            }
            Instant artifactTime = Files.getLastModifiedTime(artifact).toInstant();
            Path projectRoot = Paths.get(System.getProperty("user.dir", "."));
            Instant newestTime = null;
            Path newest = null;
            for (Path module : moduleRoots(projectRoot)) {
                for (String relative : SOURCE_SCAN_DIRS) {
                    Path root = module.resolve(relative);
                    if (!Files.isDirectory(root)) {
                        continue;
                    }
                    try (Stream<Path> files = Files.walk(root)) {
                        for (Path file : files.filter(Files::isRegularFile).toList()) {
                            if (!isBackendSource(file.getFileName().toString())) {
                                continue;
                            }
                            Instant time = Files.getLastModifiedTime(file).toInstant();
                            if (newestTime == null || time.isAfter(newestTime)) {
                                newestTime = time;
                                newest = file;
                            }
                        }
                    }
                }
            }
            boolean stale = newestTime != null && newestTime.isAfter(artifactTime);
            return new Artifact(
                    artifact.toString(),
                    TIME_FORMAT.format(artifactTime),
                    stale,
                    newest == null ? "" : projectRoot.relativize(newest).toString(),
                    newestTime == null ? "" : TIME_FORMAT.format(newestTime));
        } catch (Exception e) {
            log.debug("产物时间戳自检跳过: {}", e.getMessage());
            return new Artifact("", "", false, "", "");
        }
    }

    /**
     * 定位当前运行的产物。
     *
     * <p>不能用 {@code getProtectionDomain().getCodeSource()}：Spring Boot 3 的 fat jar
     * 使用 {@code jar:nested:} 协议，那个 URL 不是文件路径，{@code Paths.get(uri)} 会直接抛异常
     * （表现就是自检里"运行产物"为空）。以 {@code java -jar} 启动时 {@code java.class.path}
     * 恰好就是那个 jar，是最可靠来源。</p>
     */
    private Path resolveArtifactPath() {
        String classPath = System.getProperty("java.class.path", "");
        for (String entry : classPath.split(java.util.regex.Pattern.quote(File.pathSeparator))) {
            if (entry.endsWith(".jar")) {
                Path candidate = Paths.get(entry);
                if (Files.isRegularFile(candidate)) {
                    return candidate;
                }
            }
        }
        try {
            URL location = StartupSelfCheck.class.getProtectionDomain().getCodeSource().getLocation();
            if ("file".equals(location.getProtocol())) {
                return Paths.get(location.toURI());
            }
        } catch (Exception e) {
            log.debug("回退定位运行产物失败: {}", e.getMessage());
        }
        return null;
    }

    private List<Path> moduleRoots(Path projectRoot) throws Exception {
        if (!Files.isDirectory(projectRoot)) {
            return List.of();
        }
        try (Stream<Path> children = Files.list(projectRoot)) {
            return children.filter(Files::isDirectory)
                    .filter(path -> path.getFileName().toString().startsWith("Research-agent-"))
                    .toList();
        }
    }

    private boolean isBackendSource(String name) {
        return name.endsWith(".java") || name.endsWith(".xml")
                || name.endsWith(".yml") || name.endsWith(".sql");
    }

    private void logReport(SelfCheckReport report) {
        StringBuilder text = new StringBuilder();
        text.append(System.lineSeparator()).append("================ 启动自检 ================");
        text.append(System.lineSeparator()).append("  状态        : ")
                .append(report.healthy() ? "OK" : "需要关注");
        text.append(System.lineSeparator()).append("  profile     : ")
                .append(report.profiles().isEmpty() ? "(未激活 —— 默认会落到 H2)" : String.join(", ", report.profiles()));
        text.append(System.lineSeparator()).append("  数据库      : ")
                .append(report.datasourceProduct()).append(" / ").append(report.databaseName());
        text.append(System.lineSeparator()).append("  监听端口    : ").append(report.serverPort());
        if (!report.artifactPath().isEmpty()) {
            text.append(System.lineSeparator()).append("  运行产物    : ").append(report.artifactPath())
                    .append(report.artifactTime().isEmpty() ? "" : "  (" + report.artifactTime() + ")");
        }
        text.append(System.lineSeparator()).append("  表声明/缺失 : ")
                .append(report.declaredTableCount()).append(" / ").append(report.missingTables().size());
        for (String warning : report.warnings()) {
            text.append(System.lineSeparator()).append("  [警告] ").append(warning);
        }
        text.append(System.lineSeparator()).append("=========================================");
        if (report.healthy()) {
            log.info(text.toString());
        } else {
            log.warn(text.toString());
        }
    }

    private record Artifact(String path,
                            String time,
                            boolean stale,
                            String newestSource,
                            String newestSourceTime) {
    }
}
