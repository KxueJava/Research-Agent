/**
 * 首页 visitor bootstrap 编排判断。
 */
export function shouldBootstrapVisitor(params: {
  bootstrapLoaded: boolean;
  bootstrapLoading: boolean;
}) {
  return !params.bootstrapLoaded && !params.bootstrapLoading;
}

/**
 * 当前首页工作区处于哪个 visitor 引导阶段。
 *
 * <p>已移除访客命名阶段：`/` 由 AuthGuard 保护，能进入首页的一定是登录用户，
 * 而 VisitorIdentityFilter 会用 admin userId 派生访客身份，命名步骤对任何人都是多余的。
 * 这里只保留 bootstrap 等待，避免首访并发拉取历史与近期会话。</p>
 */
export function resolveVisitorWorkspaceStage(params: {
  bootstrapLoaded: boolean;
  bootstrapLoading: boolean;
}) {
  if (!params.bootstrapLoaded || params.bootstrapLoading) {
    return "bootstrapping" as const;
  }
  return "ready" as const;
}

/**
 * bootstrap 完成后即可加载 visitor 保护数据。
 */
export function shouldLoadVisitorProtectedData(params: {
  bootstrapLoaded: boolean;
  bootstrapLoading: boolean;
}) {
  return resolveVisitorWorkspaceStage(params) === "ready";
}
