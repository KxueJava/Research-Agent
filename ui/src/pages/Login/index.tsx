import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useNavigate } from "react-router-dom";

import { adminUserApi, storeAuthSession } from "@/services/adminUser";
import { githubAuth } from "@/services/githubAuth";
import GitHubLogo from "@/components/GitHubLogo";

import "./login.css";

type Mode = "login" | "register";

export default function Login() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [githubReady, setGithubReady] = useState<boolean | null>(null);
  const [githubBusy, setGithubBusy] = useState(false);

  useEffect(() => {
    let active = true;
    githubAuth.config().then(value => { if (active) setGithubReady(value.enabled); })
      .catch(() => { if (active) setGithubReady(false); });
    return () => { active = false; };
  }, []);

  const loginWithGitHub = async () => {
    setError(""); setNotice("");
    if (!githubReady) { setError("GitHub 登录尚未配置或暂不可用，请使用账号密码登录。"); return; }
    setGithubBusy(true);
    try { await githubAuth.start("login"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "GitHub 登录失败，请重试"); setGithubBusy(false); }
  };

  const registration = mode === "register";

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setError("");
    setNotice("");
    setPassword("");
    setConfirmPassword("");
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    setNotice("");
    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setError("请输入用户名。");
      return;
    }
    if (password.length < 8) {
      setError("密码至少需要 8 个字符。");
      return;
    }
    if (registration && password !== confirmPassword) {
      setError("两次输入的密码不一致。");
      return;
    }

    setBusy(true);
    try {
      if (registration) {
        await adminUserApi.register({
          username: cleanUsername,
          password,
        });
        setNotice("账号创建成功，请使用新账号登录。");
        switchMode("login");
        setUsername(cleanUsername);
      } else {
        const auth = await adminUserApi.login({
          username: cleanUsername,
          password,
        });
        storeAuthSession(auth);
        if (remember) localStorage.setItem("research.admin.remember", "1");
        else localStorage.removeItem("research.admin.remember");
        navigate("/", { replace: true });
      }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : registration
            ? "注册失败，请稍后重试。"
            : "登录失败，请检查用户名和密码。",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog.Root>
      <div className="research-login-page">
        <div className="rl-shell">
          <header className="rl-masthead">
            <div className="rl-brand" aria-label="Research Agent 研究工作台">
              <span className="rl-brand-mark" aria-hidden="true">
                R
              </span>
              <div>
                <div className="rl-brand-name">Research Agent</div>
                <p className="rl-brand-note">研究工作台</p>
              </div>
            </div>
            <Dialog.Trigger asChild>
              <button className="rl-help" type="button">
                需要帮助<span aria-hidden="true">↗</span>
              </button>
            </Dialog.Trigger>
          </header>
          <main className="rl-main">
            <section className="rl-story" aria-label="Research Agent 简介">
              <p className="rl-story-tag">给每一个问题，留一份记录</p>
              <h1>
                问题、资料、结论。
                <br />
                都在同一个工作台。
              </h1>
              <p className="rl-story-intro">
                检索网页，整理证据，完成报告。
                <br />
                让每一次研究，都有迹可循。
              </p>
              <div
                className="rl-desk"
                role="img"
                aria-label="工作区示意：一页关于行业研究的笔记，记录问题、来源与待核实事项"
              >
                <div className="rl-desk-grid" />
                <div className="rl-folder-back" />
                <div className="rl-note">
                  <div className="rl-note-header">
                    <span>RESEARCH NOTES</span>
                    <i className="rl-note-tab" aria-hidden="true" />
                  </div>
                  <h2>如何梳理一个新行业？</h2>
                  <p className="rl-note-line">
                    先了解行业边界，再寻找 <em>一手资料</em>。
                  </p>
                  <p className="rl-note-line">
                    对照不同来源，保留需要核实的问题。
                  </p>
                  <div className="rl-note-foot">
                    <span>问题 / 来源 / 结论</span>
                    <span>继续研究 →</span>
                  </div>
                </div>
                <i className="rl-paper-clip" aria-hidden="true" />
                <span className="rl-desk-caption">工作区示意</span>
              </div>
              <div className="rl-workflow" aria-hidden="true">
                <b>提出问题</b>
                <i />
                <b>查阅资料</b>
                <i />
                <b className="rl-last">形成结论</b>
              </div>
            </section>
            <section
              className="rl-auth"
              aria-label={registration ? "注册表单" : "登录表单"}
            >
              <div className="rl-auth-topline">
                <span>你的研究工作台</span>
                <span className="rl-auth-step">
                  {registration ? "创建账号" : "账号登录"}
                </span>
              </div>
              <h2>{registration ? "留一张研究桌。" : "欢迎回来。"}</h2>
              <p className="rl-auth-intro">
                {registration
                  ? "创建账号，开始记录你的研究。"
                  : "登录，继续上次的研究。"}
              </p>
              {!registration && <div className="rl-github-method">
                <button type="button" className="rl-github-login" disabled={busy || githubBusy || githubReady === null} onClick={() => void loginWithGitHub()}>
                  <GitHubLogo className="rl-github-logo" /><span>{githubBusy ? "正在前往 GitHub…" : "使用 GitHub 登录"}</span>
                </button>
                <p className="rl-github-hint">已有账号？登录后可在账号设置中绑定 GitHub。</p>
                <div className="rl-method-divider">或使用账号密码</div>
              </div>}
              <form onSubmit={submit} noValidate aria-busy={busy || githubBusy}>
                <div className="rl-field">
                  <div className="rl-field-label">
                    <label htmlFor="research-username">用户名</label>
                  </div>
                  <input
                    id="research-username"
                    value={username}
                    onChange={(event) => setUsername(event.target.value)}
                    autoComplete="username"
                    placeholder={registration ? "设置用户名" : "输入用户名"}
                    required
                  />
                </div>
                <div className="rl-field">
                  <div className="rl-field-label">
                    <label htmlFor="research-password">密码</label>
                  </div>
                  <div className="rl-input-wrap">
                    <input
                      id="research-password"
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      type={showPassword ? "text" : "password"}
                      autoComplete={
                        registration ? "new-password" : "current-password"
                      }
                      placeholder={registration ? "至少 8 位字符" : "输入密码"}
                      required
                      minLength={8}
                    />
                    <button
                      className="rl-reveal-password"
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-pressed={showPassword}
                      aria-label={showPassword ? "隐藏密码" : "显示密码"}
                    >
                      {showPassword ? "隐藏" : "显示"}
                    </button>
                  </div>
                </div>
                {registration ? (
                  <div className="rl-field">
                    <div className="rl-field-label">
                      <label htmlFor="research-confirm-password">
                        确认密码
                      </label>
                    </div>
                    <div className="rl-input-wrap">
                      <input
                        id="research-confirm-password"
                        value={confirmPassword}
                        onChange={(event) =>
                          setConfirmPassword(event.target.value)
                        }
                        type={showConfirmPassword ? "text" : "password"}
                        autoComplete="new-password"
                        placeholder="再次输入密码"
                        required
                        minLength={8}
                      />
                      <button
                        className="rl-reveal-password"
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword((value) => !value)
                        }
                        aria-pressed={showConfirmPassword}
                        aria-label={
                          showConfirmPassword ? "隐藏确认密码" : "显示确认密码"
                        }
                      >
                        {showConfirmPassword ? "隐藏" : "显示"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rl-form-options">
                    <label className="rl-check">
                      <input
                        type="checkbox"
                        checked={remember}
                        onChange={(event) => setRemember(event.target.checked)}
                      />
                      保持登录状态
                    </label>
                    <button
                      type="button"
                      className="rl-text-button"
                      onClick={() => setNotice("请联系工作区管理员重置密码。")}
                    >
                      忘记密码？
                    </button>
                  </div>
                )}
                {registration && (
                  <label className="rl-check rl-agreement">
                    <input type="checkbox" required />
                    我同意服务条款
                  </label>
                )}
                <button className="rl-submit" type="submit" disabled={busy || githubBusy}>
                  <span>
                    {busy
                      ? registration
                        ? "正在创建…"
                        : "正在验证…"
                      : registration
                        ? "创建账号"
                        : "进入工作台"}
                  </span>
                  <span className="rl-arrow" aria-hidden="true">
                    →
                  </span>
                  {busy && (
                    <span className="rl-loading-line" aria-hidden="true" />
                  )}
                </button>
                {(error || notice) && (
                  <p
                    className={`rl-status${error ? " is-error" : ""}`}
                    role={error ? "alert" : "status"}
                    aria-live="polite"
                  >
                    {error || notice}
                  </p>
                )}
              </form>
              <p className="rl-mode-switch">
                <span>
                  {registration
                    ? "已经有 Research 账号？"
                    : "第一次使用 Research？"}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    switchMode(registration ? "login" : "register")
                  }
                  disabled={busy || githubBusy}
                >
                  {registration ? "返回登录" : "创建账号"}{" "}
                  <span aria-hidden="true">↗</span>
                </button>
              </p>
              <p className="rl-account-note">
                账号用于保存研究任务、资料和工作记录。
                <br />
                研究随时可以继续。
              </p>
            </section>
          </main>
          <footer className="rl-footer">
            <span className="rl-footer-name">
              RESEARCH AGENT / 研究，从问题开始
            </span>
            <span>你的问题、资料与工作记录，留在你的工作台。</span>
          </footer>
        </div>
      </div>
      <Dialog.Portal>
        <Dialog.Overlay className="rl-help-overlay" />
        <Dialog.Content className="rl-help-dialog">
          <Dialog.Title>登录帮助</Dialog.Title>
          <Dialog.Description>
            使用已有的 Research 账号登录。如果忘记密码，请联系工作区管理员重置。
          </Dialog.Description>
          <Dialog.Close className="rl-dialog-close">知道了</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
