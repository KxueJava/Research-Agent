import { useState } from "react";
import type { FormEvent } from "react";
import { ArrowRight, Eye, EyeOff } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { adminUserApi, storeAuthSession } from "@/services/adminUser";

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
        await adminUserApi.register({ username: cleanUsername, password });
        setNotice("账号创建成功，请使用新账号登录。");
        switchMode("login");
        setUsername(cleanUsername);
      } else {
        const auth = await adminUserApi.login({ username: cleanUsername, password });
        storeAuthSession(auth);
        if (remember) localStorage.setItem("research.admin.remember", "1");
        else localStorage.removeItem("research.admin.remember");
        navigate("/", { replace: true });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : registration ? "注册失败，请稍后重试。" : "登录失败，请检查用户名和密码。");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="research-login-page">
      <section className="research-login-story" aria-label="Research 全网资讯研究平台">
        <div className="research-login-brand research-login-reveal">
          <span className="research-login-mark">R</span>
          <span className="research-login-brand-name">Research</span>
          <span className="research-login-brand-note">/ intelligence desk</span>
        </div>
        <div className="research-login-story-copy research-login-reveal research-login-reveal-delay">
          <div className="research-login-eyebrow">Open-web intelligence</div>
          <h1>把全网资讯，<br /><em>整理成判断。</em></h1>
          <p>从新闻、行业报告到公开数据，集中检索、交叉验证并沉淀为可追溯的研究结论。</p>
          <div className="research-login-source-strip">
            <span>NEWS</span><span>REPORTS</span><span>PUBLIC DATA</span><span>WEB SOURCES</span>
          </div>
          <div className="research-login-signal"><i />研究服务正常 · 来源与证据持续更新</div>
        </div>
        <div className="research-login-story-foot"><span>RESEARCH / INTELLIGENCE</span><span>BUILD 0.9.4</span></div>
      </section>

      <section className="research-login-auth" aria-label={registration ? "注册表单" : "登录表单"}>
        <div className="research-login-auth-inner research-login-reveal research-login-reveal-delay">
          <p className="research-login-kicker">{registration ? "Create your desk" : "Welcome back"}</p>
          <h2>{registration ? "建立你的研究空间" : "继续你的研究"}</h2>
          <p className="research-login-intro">
            {registration ? "创建账号后保存检索任务、订阅资讯并管理研究资料。" : "登录后访问已保存的检索任务、资讯订阅和研究工作区。"}
          </p>
          <form onSubmit={submit} noValidate>
            <div className="research-login-field">
              <label htmlFor="research-username">用户名</label>
              <input id="research-username" value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" placeholder={registration ? "设置用户名" : "输入用户名"} required />
            </div>
            <div className="research-login-field">
              <label htmlFor="research-password">密码</label>
              <div className="research-login-input-wrap">
                <input id="research-password" value={password} onChange={(event) => setPassword(event.target.value)} type={showPassword ? "text" : "password"} autoComplete={registration ? "new-password" : "current-password"} placeholder={registration ? "至少 8 位字符" : "输入密码"} required minLength={8} />
                <button type="button" onClick={() => setShowPassword((value) => !value)} aria-label={showPassword ? "隐藏密码" : "显示密码"}>{showPassword ? <EyeOff /> : <Eye />}</button>
              </div>
              {!registration ? <p className="research-login-helper">使用已创建的 Research 账号登录。</p> : null}
            </div>
            {registration ? (
              <div className="research-login-field">
                <label htmlFor="research-confirm-password">确认密码</label>
                <div className="research-login-input-wrap">
                  <input id="research-confirm-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} type={showConfirmPassword ? "text" : "password"} autoComplete="new-password" placeholder="再次输入密码" required minLength={8} />
                  <button type="button" onClick={() => setShowConfirmPassword((value) => !value)} aria-label={showConfirmPassword ? "隐藏密码" : "显示密码"}>{showConfirmPassword ? <EyeOff /> : <Eye />}</button>
                </div>
              </div>
            ) : (
              <div className="research-login-form-row">
                <label className="research-login-remember"><input type="checkbox" checked={remember} onChange={(event) => setRemember(event.target.checked)} /> 保持登录状态</label>
                <button type="button" className="research-login-link" onClick={() => setNotice("请联系工作区管理员重置密码。")}>忘记密码？</button>
              </div>
            )}
            {registration ? <label className="research-login-remember research-login-register-agreement"><input type="checkbox" required /> 我同意服务条款</label> : null}
            <button className="research-login-submit" type="submit" disabled={busy}>
              <span>{busy ? (registration ? "正在创建" : "正在验证") : registration ? "创建研究账号" : "登录工作台"}</span>
              <ArrowRight />
            </button>
            <p className={`research-login-status ${notice ? "is-notice" : ""}`} role="status" aria-live="polite">{error || notice}</p>
          </form>
          <p className="research-login-legal">{registration ? "创建账号" : "登录"}即表示你同意 <a href="#terms">使用条款</a> 与 <a href="#privacy">隐私说明</a>。</p>
          <p className="research-login-switch">
            {registration ? "已有研究账号？" : "还没有研究账号？"}
            <button type="button" className="research-login-link" onClick={() => switchMode(registration ? "login" : "register")}>
              {registration ? "返回登录" : "创建账号"}
            </button>
          </p>
        </div>
      </section>
    </main>
  );
}
