import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import ConversationSidebar from "./ConversationSidebar";

// Capture the rendered button's real handler without adding a DOM dependency.
const accountClick = vi.hoisted(() => ({handler: null as (() => void) | null,}));
const navigate = vi.hoisted(() => vi.fn());
vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => navigate,
}));
vi.mock("react/jsx-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react/jsx-runtime")>();
  const capture = (props: unknown) => {
    const buttonProps = props as {
      "aria-label"?: string;
      onClick?: () => void;
    } | null;
    if (buttonProps?.["aria-label"] === "打开用户菜单") {
      accountClick.handler = buttonProps.onClick ?? null;
    }
  };
  return {
    ...actual,
    jsx: (...args: Parameters<typeof actual.jsx>) => {
      capture(args[1]);
      return actual.jsx(...args);
    },
    jsxs: (...args: Parameters<typeof actual.jsxs>) => {
      capture(args[1]);
      return actual.jsxs(...args);
    },
  };
});
vi.mock("react/jsx-dev-runtime", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react/jsx-dev-runtime")>();
  return {
    ...actual,
    jsxDEV: (...args: Parameters<typeof actual.jsxDEV>) => {
      const props = args[1] as {
        "aria-label"?: string;
        onClick?: () => void;
      } | null;
      if (props?.["aria-label"] === "打开用户菜单")
        accountClick.handler = props.onClick ?? null;
      return actual.jsxDEV(...args);
    },
  };
});

beforeEach(() => {
  navigate.mockClear();
  accountClick.handler = null;
});

describe("ConversationSidebar", () => {
  it.each(["mrag", "image-generation", "models"] as const)(
    "does not navigate away from %s when the avatar menu is toggled",
    (activeView) => {
      const onChangeView = vi.fn();
      renderToStaticMarkup(
        <MemoryRouter initialEntries={[`/workspace/${activeView}`]}>
          <ConversationSidebar
            activeView={activeView}
            recentSessions={[]}
            recentSessionsLoading={false}
            onNewChat={vi.fn()}
            onSelectSession={vi.fn()}
            onDeleteSession={vi.fn()}
            onPinSession={vi.fn()}
            onChangeView={onChangeView}
            onManageFeaturedConversation={vi.fn()}
          />
        </MemoryRouter>,
      );
      expect(accountClick.handler).toBeTypeOf("function");
      accountClick.handler!();
      accountClick.handler!();
      expect(navigate).not.toHaveBeenCalled();
      expect(onChangeView).not.toHaveBeenCalled();
    },
  );
  it("renders the featured conversations navigation entry", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ConversationSidebar
          activeView="chat"
          recentSessions={[]}
          recentSessionsLoading={false}
          onNewChat={() => {}}
          onSelectSession={() => {}}
          onDeleteSession={() => {}}
          onPinSession={() => {}}
          onChangeView={() => {}}
          onManageFeaturedConversation={() => {}}
        />
      </MemoryRouter>,
    );

    expect(html).toContain("精品对话");
    expect(html).toContain("子 Agent");
    expect(html).toContain("查看当前会话的文件");
  });

  it("renders task file panel with back action", () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ConversationSidebar
          activeView="chat"
          recentSessions={[]}
          recentSessionsLoading={false}
          sidebarPanel="task-files"
          taskList={[]}
          onNewChat={() => {}}
          onSelectSession={() => {}}
          onDeleteSession={() => {}}
          onPinSession={() => {}}
          onChangeView={() => {}}
          onManageFeaturedConversation={() => {}}
          onCloseTaskFiles={() => {}}
        />
      </MemoryRouter>,
    );

    expect(html).toContain("文件");
    expect(html).toContain("返回");
    expect(html).toContain("当前会话暂无文件");
  });
});
