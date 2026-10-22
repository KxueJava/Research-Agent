import { memo, useState, useCallback } from "react";
import { motion } from "motion/react";
import classNames from "classnames";
import { useNavigate } from "react-router-dom";
import { EASE_OUT, useMotionConfig } from "@/lib/motion";
import {
  Blocks,
  Bot,
  Cpu,
  SquarePen,
  Search,
  MoreHorizontal,
  DatabaseZap,
  MessagesSquare,
  Star,
  WandSparkles,
  X,
  FolderOpen,
  LogOut,
  Pin,
  UserRound,
  ChartNoAxesCombined,
} from "lucide-react";
import { adminUserApi, clearAuthSession, getStoredAdminUser } from "@/services/adminUser";
import type { ConversationSessionItem } from "@/services/agentConversation";
import type { PanelItemType } from "@/components/ActionPanel";
import TaskFileSidebar, { type WorkspaceFileItem } from "@/components/ActionView/TaskFileSidebar";
import { AppearanceMenuOptions, ThemeToggle } from "@/components/ThemeProvider";

import ConversationSessionActionMenu from "./ConversationSessionActionMenu";
import type { SidebarView } from "./viewRoutes";
import { canFeatureConversationSession } from "./featuredConversationAdminModel";

type NavItem = {
  key: SidebarView;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

const navItems: NavItem[] = [
  {
    key: "chat",
    label: "对话",
    icon: MessagesSquare,
  },
  {
    key: "mrag",
    label: "MRAG",
    icon: DatabaseZap,
  },
  {
    key: "image-generation",
    label: "生图",
    icon: WandSparkles,
  },
  {
    key: "sub-agents",
    label: "子 Agent",
    icon: Bot,
  },
  {
    key: "models",
    label: "模型",
    icon: Cpu,
  },
  {
    key: "capabilities",
    label: "能力库",
    icon: Blocks,
  },
  {
    key: "featured",
    label: "精品对话",
    icon: Star,
  },
  {
    key: "usage",
    label: "用量统计",
    icon: ChartNoAxesCombined,
  },
];

type SidebarPanel = "sessions" | "task-files";

type ConversationSidebarProps = {
  activeView: SidebarView;
  recentSessions: ConversationSessionItem[];
  recentSessionsLoading: boolean;
  selectedSessionId?: string;
  visitorUsername?: string;
  sidebarPanel?: SidebarPanel;
  taskList?: PanelItemType[];
  selectedTaskFileKey?: string;
  onNewChat: () => void;
  onSelectSession: (session: ConversationSessionItem) => void;
  onDeleteSession: (session: ConversationSessionItem) => void;
  onPinSession: (session: ConversationSessionItem) => void;
  onChangeView: (view: SidebarView) => void;
  onManageFeaturedConversation: (session: ConversationSessionItem) => void;
  onOpenTaskFiles?: () => void;
  onCloseTaskFiles?: () => void;
  onSelectTaskFile?: (file: WorkspaceFileItem) => void;
  onRefreshTaskFiles?: () => void;
  onRequestClose?: () => void;
};

const ConversationSidebar = memo(function ConversationSidebar(
  props: ConversationSidebarProps
) {
  const {
    activeView,
    recentSessions,
    recentSessionsLoading,
    selectedSessionId,
    visitorUsername,
    sidebarPanel = "sessions",
    taskList,
    selectedTaskFileKey,
    onNewChat,
    onSelectSession,
    onDeleteSession,
    onPinSession,
    onChangeView,
    onManageFeaturedConversation,
    onOpenTaskFiles,
    onCloseTaskFiles,
    onSelectTaskFile,
    onRefreshTaskFiles,
    onRequestClose,
  } = props;

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredSessionId, setHoveredSessionId] = useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(
    null
  );
  const { reduce } = useMotionConfig();
  const navigate = useNavigate();
  const [accountOpen, setAccountOpen] = useState(false);
  const avatarUrl = getStoredAdminUser()?.avatarUrl || "";
  const accountName = getStoredAdminUser()?.username || visitorUsername || "研究用户";

  const handleAccountClick = () => {
    setAccountOpen((open) => !open);
  };

  const accountBlock = (
    <div className="relative mt-1 border-t border-[var(--chat-border)]/50 px-2 pt-2">
      {accountOpen ? (
        <div className="ocean-account-menu absolute bottom-[calc(100%+6px)] left-2 right-2 z-20 rounded-xl border border-[var(--chat-border)] bg-[var(--chat-panel-strong)] p-1.5 shadow-xl">
          <button type="button" onClick={() => navigate("/profile")} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-[var(--chat-text)] hover:bg-black/[0.05]">
            <UserRound className="h-4 w-4 text-[var(--chat-text-muted)]" />
            账号设置
          </button>
          <AppearanceMenuOptions />
          <button type="button" onClick={() => { void adminUserApi.logout().catch(() => undefined); clearAuthSession(); navigate("/login", { replace: true }); }} className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[13px] text-[#b42318] hover:bg-[#fff1f0]">
            <LogOut className="h-4 w-4" />
            退出登录
          </button>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
      <button type="button" onClick={handleAccountClick} className="flex h-10 min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-2.5 text-left hover:bg-black/[0.04]" aria-expanded={accountOpen} aria-label="打开用户菜单">
        {avatarUrl ? <img src={avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover" /> : <div className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--chat-accent)] text-[11px] font-semibold text-white">{accountName.slice(0, 1).toUpperCase()}</div>}
        <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--chat-text-soft)]">{accountName}</span>
      </button>
      <ThemeToggle />
      </div>
    </div>
  );

  const filteredSessions = searchQuery.trim()
    ? recentSessions.filter((s) =>
      (s.title || "未命名会话")
        .toLowerCase()
        .includes(searchQuery.toLowerCase()))
    : recentSessions;

  const handleSearchToggle = useCallback(() => {
    setSearchOpen((prev) => !prev);
    if (searchOpen) {
      setSearchQuery("");
    }
  }, [searchOpen]);

  const handleMoreClick = useCallback(
    (e: React.MouseEvent, sessionId: string) => {
      e.stopPropagation();
      setExpandedSessionId((prev) =>
        prev === sessionId ? null : sessionId
      );
    },
    []
  );

  const handlePin = useCallback(
    (session: ConversationSessionItem) => {
      setExpandedSessionId(null);
      onPinSession(session);
    },
    [onPinSession]
  );

  const handleDelete = useCallback(
    (session: ConversationSessionItem) => {
      setExpandedSessionId(null);
      onDeleteSession(session);
    },
    [onDeleteSession]
  );

  const handleManageFeatured = useCallback(
    (session: ConversationSessionItem) => {
      setExpandedSessionId(null);
      onManageFeaturedConversation(session);
    },
    [onManageFeaturedConversation]
  );

  const isTaskFilesPanel = sidebarPanel === "task-files";

  return (
    <div className="ocean-sidebar flex h-full w-full min-w-0 flex-col border-r border-[var(--chat-border)] bg-[var(--chat-nav)]">
      {/* 顶部操作区 — Manus 侧栏风格 */}
      <div className="flex h-14 shrink-0 items-center justify-between px-3.5">
        <div className="text-[16px] font-semibold text-[var(--chat-text)]">
          Research Agent
        </div>
        <div className="flex items-center gap-0.5">
          {!isTaskFilesPanel ? (
            <>
              <button
                type="button"
                onClick={handleSearchToggle}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--chat-text-soft)] transition-colors hover:bg-black/5 hover:text-[var(--chat-text)]"
                aria-label="搜索"
              >
                <Search className="h-[18px] w-[18px]" />
              </button>
              <button
                type="button"
                onClick={onNewChat}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--chat-text-soft)] transition-colors hover:bg-black/5 hover:text-[var(--chat-text)]"
                aria-label="新建任务"
              >
                <SquarePen className="h-[18px] w-[18px]" />
              </button>
            </>
          ) : null}
          {onRequestClose ? (
            <button
              type="button"
              onClick={onRequestClose}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--chat-text-soft)] transition-colors hover:bg-black/5 hover:text-[var(--chat-text)] lg:hidden"
              aria-label="关闭侧边栏"
            >
              <X className="h-[18px] w-[18px]" />
            </button>
          ) : null}
        </div>
      </div>

      {!isTaskFilesPanel ? (
        <div className="shrink-0 px-2 pb-2">
          <button
            type="button"
            onClick={onNewChat}
            className="flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-[14px] font-medium text-[var(--chat-text)] transition-colors hover:bg-black/[0.04]"
          >
            <SquarePen className="h-[18px] w-[18px]" />
            <span>新建任务</span>
          </button>

          <div
            className={classNames(
              "grid",
              reduce
                ? searchOpen
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0"
                : "transition-[grid-template-rows,opacity] duration-200 ease-[cubic-bezier(0.23,1,0.32,1)]",
              !reduce &&
                (searchOpen
                  ? "grid-rows-[1fr] opacity-100"
                  : "grid-rows-[0fr] opacity-0")
            )}
          >
            <div
              className={classNames(
                "min-h-0 overflow-hidden",
                !searchOpen && "pointer-events-none"
              )}
            >
              <div className="relative mt-2">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="搜索会话..."
                  autoFocus={searchOpen}
                  tabIndex={searchOpen ? 0 : -1}
                  className="w-full rounded-[10px] border border-[var(--chat-border)] bg-[var(--chat-surface)] px-3 py-2 pr-8 text-[13px] text-[var(--chat-text)] outline-none transition-colors placeholder:text-[var(--chat-text-muted)] focus:border-[#0000004d]"
                />
                {searchQuery ? (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--chat-text-muted)] hover:text-[var(--chat-text)]"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {isTaskFilesPanel ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <TaskFileSidebar
            taskList={taskList}
            selectedFileKey={selectedTaskFileKey}
            sessionId={selectedSessionId}
            onSelectFile={onSelectTaskFile}
            onBack={() => onCloseTaskFiles?.()}
            onRefresh={onRefreshTaskFiles}
          />
          {accountBlock}
        </div>
      ) : (
        <>
          {/* 导航区 */}
          <div className="shrink-0 px-2 py-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeView === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => onChangeView(item.key)}
                  className={classNames(
                    "ocean-nav-item flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-[14px] font-medium transition-colors",
                    isActive && "ocean-nav-active",
                    isActive
                      ? "bg-black/[0.08] text-[var(--chat-text)]"
                      : "text-[var(--chat-text)] hover:bg-black/[0.04]"
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* 最近会话 */}
          <div className="flex min-h-0 flex-1 flex-col px-2 pt-3">
            <div className="mb-1.5 flex items-center justify-between px-2.5">
              <span className="text-[12px] font-medium text-[var(--chat-text-muted)]">
                任务
              </span>
              {recentSessionsLoading && (
                <span className="text-[11px] text-[var(--chat-text-muted)]">
                  加载中...
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto scrollbar-hover">
              {filteredSessions.length === 0 ? (
                <div className="px-2.5 py-4 text-center text-[12px] text-[var(--chat-text-muted)]">
                  {searchQuery.trim() ? "未找到匹配的会话" : "暂无会话"}
                </div>
              ) : (
                <div className="flex flex-col gap-0.5">
                  {filteredSessions.map((session) => {
                    const isActive = session.sessionId === selectedSessionId;
                    const isHovered = session.sessionId === hoveredSessionId;
                    const isExpanded = session.sessionId === expandedSessionId;

                    return (
                      <div
                        key={session.sessionId}
                        className="relative"
                        onMouseEnter={() => setHoveredSessionId(session.sessionId)}
                        onMouseLeave={() => setHoveredSessionId(null)}
                      >
                        {isActive ? (
                          <motion.div
                            layoutId={reduce ? undefined : "sidebar-active"}
                            className="pointer-events-none absolute inset-0 rounded-[10px] bg-black/[0.08]"
                            transition={{
                              duration: reduce ? 0 : 0.2,
                              ease: EASE_OUT,
                            }}
                          />
                        ) : null}
                        <div
                          role="button"
                          tabIndex={0}
                          onClick={() => onSelectSession(session)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              onSelectSession(session);
                            }
                          }}
                          className={classNames(
                            "group relative z-[1] flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left transition-colors",
                            isActive
                              ? "text-[var(--chat-text)]"
                              : "text-[var(--chat-text)] hover:bg-black/[0.04]"
                          )}
                        >
                          <span
                            className={classNames(
                              "size-3.5 shrink-0 rounded-full border-[1.5px]",
                              isActive
                                ? "border-[var(--chat-accent)] shadow-[inset_0_0_0_3px_var(--chat-accent)]"
                                : "border-[var(--chat-text-muted)]"
                            )}
                            aria-hidden
                          />
                          <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                            {session.title || "未命名会话"}
                          </span>
                          {session.pinned ? (
                            <Pin
                              className="h-3 w-3 shrink-0 text-[var(--chat-accent)]"
                              aria-label="已置顶"
                            />
                          ) : null}
                          <span
                            className={classNames(
                              "shrink-0 transition-opacity",
                              isHovered || isExpanded
                                ? "opacity-100"
                                : "opacity-0"
                            )}
                          >
                            <button
                              type="button"
                              onClick={(e) =>
                                handleMoreClick(e, session.sessionId)
                              }
                              className="rounded p-0.5 text-[var(--chat-text-muted)] transition-colors hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-text)]"
                            >
                              <MoreHorizontal className="h-3.5 w-3.5" />
                            </button>
                          </span>
                        </div>

                        {isExpanded && (
                          <ConversationSessionActionMenu
                            session={session}
                            canManageFeatured={canFeatureConversationSession(
                              session
                            )}
                            onManageFeatured={handleManageFeatured}
                            onPin={handlePin}
                            onDelete={handleDelete}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          <div className="shrink-0 border-t border-[var(--chat-border)]/50 px-2 py-2">
            <button
              type="button"
              onClick={() => onOpenTaskFiles?.()}
              disabled={activeView !== "chat"}
              className={classNames(
                "flex h-9 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-[14px] font-medium transition-colors",
                activeView === "chat"
                  ? "text-[var(--chat-text)] hover:bg-black/[0.04]"
                  : "cursor-not-allowed text-[var(--chat-text-muted)] opacity-50"
              )}
            >
              <FolderOpen className="h-4 w-4 shrink-0 text-[var(--chat-text-muted)]" />
              <span>查看当前会话的文件</span>
            </button>
            {accountBlock}
          </div>
        </>
      )}
    </div>
  );
});

ConversationSidebar.displayName = "ConversationSidebar";

export default ConversationSidebar;
