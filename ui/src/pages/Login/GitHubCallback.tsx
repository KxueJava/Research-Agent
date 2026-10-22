import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { githubAuth, type GitHubCompleted } from "@/services/githubAuth";
import { storeAuthSession } from "@/services/adminUser";
import GitHubLogo from "@/components/GitHubLogo";
import "./login.css";

export default function GitHubCallback() {
  const navigate = useNavigate();
  const params = useRef(new URLSearchParams(window.location.search));
  const pending = useRef<Promise<GitHubCompleted> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    // Remove the short-lived code from history immediately; never place application tokens in a URL.
    window.history.replaceState(window.history.state, "", window.location.pathname);
    pending.current ??= githubAuth.complete(params.current);
    pending.current.then((result) => {
      if (!active) return;
      if (result.action === "bind") { navigate("/profile?github=bound", { replace: true }); return; }
      if (!result.auth?.accessToken || !result.auth.refreshToken) throw new Error("GitHub 登录未完成，请重新尝试");
      storeAuthSession(result.auth);
      navigate("/", { replace: true });
    }).catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : "GitHub 登录失败，请重新尝试"); });
    return () => { active = false; };
  }, [navigate]);
  return <main className="research-login-page rl-callback-page"><section className="rl-callback-card" aria-live="polite">
    <GitHubLogo className="rl-callback-logo" />
    <h1>{error ? "GitHub 登录未完成" : "正在返回研究工作台…"}</h1>
    <p role={error ? "alert" : "status"}>{error || "正在确认你的账号，请稍候。"}</p>
    {error && <button type="button" className="rl-submit" onClick={() => navigate("/login", { replace: true })}>返回登录，重新尝试</button>}
  </section></main>;
}
