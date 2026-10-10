import { ROUTES } from "@/router/routes";

/**
 * 侧栏视图与 URL 路径的唯一映射。
 *
 * <p>背景：视图原本只是 Home 里的一个 useState，URL 始终停在 "/"，所以刷新一定
 * 回到默认的对话视图——组件重新挂载时 useState 拿到的是初始值，浏览器根本没机会
 * 记住用户在哪。把映射收敛成纯函数后，URL 成为唯一真相源，刷新、前进、后退和
 * 分享链接都会落到正确的视图。</p>
 *
 * <p>放在独立模块而不是组件内，是为了让映射可单测，并避免 Home 与侧栏各维护一份
 * 类型定义（两份同名类型一旦漂移，编译器在跨文件边界上发现不了）。</p>
 */

export type SidebarView =
  | "chat"
  | "mrag"
  | "image-generation"
  | "sop"
  | "sub-agents"
  | "models"
  | "capabilities"
  | "featured"
  | "usage";

/** 视图 → 路径。必须覆盖 SidebarView 的全部成员，Record 会强制检查完整性。 */
export const VIEW_PATHS: Record<SidebarView, string> = {
  chat: ROUTES.HOME,
  mrag: ROUTES.WORKSPACE_MRAG,
  "image-generation": ROUTES.WORKSPACE_IMAGE_GENERATION,
  sop: ROUTES.WORKSPACE_SOP,
  "sub-agents": ROUTES.WORKSPACE_SUB_AGENTS,
  models: ROUTES.WORKSPACE_MODELS,
  capabilities: ROUTES.WORKSPACE_CAPABILITIES,
  featured: ROUTES.FEATURED_CONVERSATIONS,
  usage: ROUTES.USAGE,
};

/**
 * 路径 → 视图；未匹配时回落到对话视图。
 *
 * <p>用最长前缀匹配而不是按声明顺序匹配：路径之间可能存在前缀关系，短前缀不能把
 * 长前缀吃掉，否则以后把某个工作区拆成子路由时会静默匹配到错误的视图。</p>
 */
export function resolveViewFromPath(pathname: string): SidebarView {
  const normalized = (pathname || "").replace(/\/+$/, "") || ROUTES.HOME;
  let matched: SidebarView = "chat";
  let matchedLength = -1;
  for (const [view, path] of Object.entries(VIEW_PATHS) as [SidebarView, string][]) {
    if (path === ROUTES.HOME) {
      // 对话视图是根路径，作为兜底而不是参与前缀匹配
      continue;
    }
    const isSelf = normalized === path;
    const isChild = normalized.startsWith(`${path}/`);
    if ((isSelf || isChild) && path.length > matchedLength) {
      matched = view;
      matchedLength = path.length;
    }
  }
  return matched;
}
