package org.wwz.ai.trigger.diagnostics;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 启动自检的只读出口，供启动脚本与人工排查使用。
 *
 * <p>刻意与 {@code /web/health} 分开：health 的响应契约被 README 和部署流程引用，
 * 改成 JSON 会破坏既有消费者。这里只新增端点，不动 health。</p>
 *
 * <p>注意该路径不在 {@code AdminAuthFilter} 的保护前缀（{@code /api/}、{@code /api/v1/}、
 * {@code /web/api/}）内，因此无需登录即可访问。报告里不含任何凭证，但会暴露 profile、
 * 库名与表名——自托管场景可接受；若要公网部署，应在此加访问控制。</p>
 */
@RestController
@RequestMapping("/web/self-check")
public class SelfCheckController {

    private final StartupSelfCheck startupSelfCheck;

    public SelfCheckController(StartupSelfCheck startupSelfCheck) {
        this.startupSelfCheck = startupSelfCheck;
    }

    @GetMapping
    public ResponseEntity<SelfCheckReport> selfCheck() {
        SelfCheckReport report = startupSelfCheck.report();
        if (report == null) {
            // 应用已就绪但自检尚未跑完，属于极短窗口
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).build();
        }
        return ResponseEntity.ok(report);
    }
}
