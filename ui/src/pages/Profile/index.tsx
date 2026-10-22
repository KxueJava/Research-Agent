import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Camera, KeyRound, LogOut, Save, UserRound } from "lucide-react";
import { useNavigate } from "react-router-dom";
import {
  adminUserApi,
  clearAuthSession,
  getStoredAdminUser,
  storeAdminUser,
  type AdminUser,
} from "@/services/adminUser";
import { readAvatarDataUrl } from "@/utils/avatarImage";
import { githubAuth, type GitHubBinding } from "@/services/githubAuth";
import GitHubLogo from "@/components/GitHubLogo";
import "./profile.css";

export default function Profile() {
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<AdminUser | null>(() => getStoredAdminUser());
  const [username, setUsername] = useState(user?.username || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(() => new URLSearchParams(window.location.search).get("github") === "bound" ? "GitHub 已绑定，下次可直接使用 GitHub 登录。" : "");
  const [error, setError] = useState("");
  const [githubBinding, setGithubBinding] = useState<GitHubBinding | null>(null);
  const [githubEnabled, setGithubEnabled] = useState(false);
  const [githubError, setGithubError] = useState("");
  const [bindingBusy, setBindingBusy] = useState(false);

  useEffect(() => {
    let active = true;
    Promise.all([githubAuth.binding(), githubAuth.config()]).then(([binding, config]) => {
      if (active) { setGithubBinding(binding); setGithubEnabled(config.enabled); }
    }).catch(() => { if (active) setGithubError("无法读取 GitHub 绑定状态，请刷新后重试。"); });
    return () => { active = false; };
  }, []);

  const bindGitHub = async () => {
    setGithubError(""); setBindingBusy(true);
    try { await githubAuth.start("bind"); }
    catch (cause) { setGithubError(cause instanceof Error ? cause.message : "GitHub 绑定未完成，请重试。"); setBindingBusy(false); }
  };

  useEffect(() => {
    adminUserApi.me().then((nextUser) => {
      setUser(nextUser);
      setUsername(nextUser.username);
      setAvatarUrl(nextUser.avatarUrl || "");
      storeAdminUser(nextUser);
    }).catch(() => undefined);
  }, []);

  const updateProfile = async () => {
    if (!username.trim()) {
      setError("用户名不能为空");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const nextUser = await adminUserApi.updateProfile({
        username: username.trim(),
        avatarUrl
      });
      setUser(nextUser);
      storeAdminUser(nextUser);
      setMessage("资料已保存");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "资料保存失败");
    } finally {
      setSaving(false);
    }
  };

  const updatePassword = async () => {
    if (newPassword.length < 8) {
      setError("新密码至少需要 8 个字符");
      return;
    }
    setSaving(true);
    setError("");
    setMessage("");
    try {
      await adminUserApi.changePassword({
        currentPassword,
        newPassword
      });
      clearAuthSession();
      navigate("/login", { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "密码修改失败");
      setSaving(false);
    }
  };

  const handleAvatar = async (file?: File) => {
    if (!file) return;
    setError("");
    try {
      // 压缩在 readAvatarDataUrl 内完成，失败时给出可读原因
      setAvatarUrl(await readAvatarDataUrl(file));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "头像处理失败");
    }
  };

  const logout = async () => {
    try {
      await adminUserApi.logout();
    } catch {
      // 本地退出仍应完成，即使服务端请求因网络中断失败。
    }
    clearAuthSession();
    navigate("/login", { replace: true });
  };

  const initial = (username || "研").slice(0, 1).toUpperCase();

  return (
    <main className="profile-page min-h-screen bg-[var(--profile-page)] px-6 py-8 text-[var(--profile-ink)]">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center justify-between">
          <button type="button" onClick={() => navigate("/")} className="inline-flex items-center gap-2 text-sm text-[var(--profile-soft)] hover:text-[var(--profile-ink)]">
            <ArrowLeft className="h-4 w-4" /> 返回工作台
          </button>
          <button type="button" onClick={logout} className="inline-flex items-center gap-2 text-sm text-[var(--profile-danger)] hover:text-[var(--profile-danger)]">
            <LogOut className="h-4 w-4" /> 退出登录
          </button>
        </header>

        <section className="profile-heading border-b border-[var(--profile-line)] pb-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--profile-action)]">Account / Research desk</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-[-0.04em]">账号设置</h1>
          <p className="mt-2 text-sm leading-6 text-[var(--profile-soft)]">管理你的研究身份、头像和登录密码。</p>
        </section>

        <div className="mt-8 grid gap-6 md:grid-cols-[1fr_1fr]">
          <section className="profile-card border border-[var(--profile-line)] bg-[var(--profile-card)] p-6">
            <div className="flex items-center gap-2 text-sm font-semibold"><UserRound className="h-4 w-4 text-[var(--profile-action)]" />基本资料</div>
            <div className="mt-6 flex items-center gap-4">
              <button type="button" onClick={() => fileRef.current?.click()} className="group relative h-20 w-20 overflow-hidden rounded-full bg-[var(--profile-action)] text-2xl font-semibold text-[var(--profile-on-action)]" aria-label="选择头像">
                {avatarUrl ? <img src={avatarUrl} alt="当前头像" className="h-full w-full object-cover" /> : initial}
                <span className="absolute inset-0 hidden items-center justify-center bg-black/45 group-hover:flex"><Camera className="h-5 w-5" /></span>
              </button>
              <div>
                <p className="text-sm font-medium">{user?.username || username || "研究用户"}</p>
                <p className="mt-1 text-xs text-[var(--profile-muted)]">点击头像选择图片，原图不超过 8MB，会自动压缩</p>
                <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(event) => { void handleAvatar(event.target.files?.[0]); event.target.value = ""; }} />
              </div>
            </div>
            <label className="mt-6 block text-xs font-semibold">用户名<input value={username} onChange={(event) => setUsername(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[var(--profile-line)] px-3 text-sm outline-none focus:border-[var(--profile-action)]" /></label>
            <button type="button" onClick={() => void updateProfile()} disabled={saving} className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--profile-action)] px-4 text-sm font-semibold text-[var(--profile-on-action)] disabled:opacity-60"><Save className="h-4 w-4" />保存资料</button>
          </section>

          <section className="profile-card border border-[var(--profile-line)] bg-[var(--profile-card)] p-6">
            <div className="flex items-center gap-2 text-sm font-semibold"><KeyRound className="h-4 w-4 text-[var(--profile-action)]" />修改密码</div>
            {githubBinding?.passwordLoginAvailable === false && <p className="mt-4 text-sm leading-6 text-[var(--profile-soft)]">此账号通过 GitHub 创建，请使用 GitHub 登录。暂不支持设置本地密码。</p>}
            <fieldset disabled={saving || githubBinding?.passwordLoginAvailable === false} className="disabled:opacity-50">
            <label className="mt-6 block text-xs font-semibold">当前密码<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[var(--profile-line)] px-3 text-sm outline-none focus:border-[var(--profile-action)]" autoComplete="current-password" /></label>
            <label className="mt-4 block text-xs font-semibold">新密码<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} className="mt-2 h-11 w-full rounded-lg border border-[var(--profile-line)] px-3 text-sm outline-none focus:border-[var(--profile-action)]" autoComplete="new-password" /></label>
            <p className="mt-2 text-xs text-[var(--profile-muted)]">修改密码后，所有已登录设备都会退出。</p>
            <button type="button" onClick={() => void updatePassword()} disabled={saving} className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--profile-line)] px-4 text-sm font-semibold text-[var(--profile-ink)] disabled:opacity-60"><KeyRound className="h-4 w-4" />更新密码</button>
            </fieldset>
          </section>
        </div>
        <section className="profile-card mt-6 border border-[var(--profile-line)] bg-[var(--profile-card)] p-6">
          <div className="flex items-center gap-2 text-sm font-semibold"><GitHubLogo className="h-5 w-5" />GitHub 登录</div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-4">
            <p className="text-sm leading-6 text-[var(--profile-soft)]">{githubBinding?.bound
              ? `已绑定 ${githubBinding.login}，可使用 GitHub 登录当前账号。`
              : githubBinding ? (githubEnabled ? "绑定后保留当前账号的任务、资料与配置。仅获取公开资料，不申请代码仓库权限。" : "GitHub 登录尚未配置，请联系部署者开通。") : "正在读取绑定状态…"}</p>
            {!githubBinding?.bound && <button type="button" onClick={() => void bindGitHub()} disabled={!githubBinding || !githubEnabled || bindingBusy} className="inline-flex h-10 items-center gap-2 rounded-lg border border-[var(--profile-line)] px-4 text-sm font-semibold disabled:opacity-50">{bindingBusy ? "正在前往 GitHub…" : "绑定 GitHub"}</button>}
          </div>
          {githubError && <p role="alert" className="mt-3 text-sm text-[var(--profile-danger)]">{githubError}</p>}
        </section>
        <p className={`mt-5 min-h-5 text-sm ${error ? "text-[var(--profile-danger)]" : "text-[var(--profile-success)]"}`}>{error || message}</p>
      </div>
    </main>
  );
}
