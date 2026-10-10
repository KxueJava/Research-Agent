import { describe, expect, it } from "vitest";

import {
  resolveVisitorWorkspaceStage,
  shouldBootstrapVisitor,
  shouldLoadVisitorProtectedData,
} from "./visitorGate";

describe("visitorGate", () => {
  it("未完成 bootstrap 前不能加载 visitor 保护数据", () => {
    expect(
      shouldLoadVisitorProtectedData({
        bootstrapLoaded: false,
        bootstrapLoading: true,
      })
    ).toBe(false);
  });

  it("bootstrap 完成后即可加载 visitor 保护数据", () => {
    expect(
      shouldLoadVisitorProtectedData({
        bootstrapLoaded: true,
        bootstrapLoading: false,
      })
    ).toBe(true);
  });

  it("仅在尚未加载且不处于加载中时才需要触发 bootstrap", () => {
    expect(
      shouldBootstrapVisitor({
        bootstrapLoaded: false,
        bootstrapLoading: false,
      })
    ).toBe(true);

    expect(
      shouldBootstrapVisitor({
        bootstrapLoaded: false,
        bootstrapLoading: true,
      })
    ).toBe(false);
  });

  it("首页首访先停留在 bootstrap 阶段，完成后直接进入 ready（不再有命名阶段）", () => {
    expect(
      resolveVisitorWorkspaceStage({
        bootstrapLoaded: false,
        bootstrapLoading: false,
      })
    ).toBe("bootstrapping");

    expect(
      resolveVisitorWorkspaceStage({
        bootstrapLoaded: true,
        bootstrapLoading: false,
      })
    ).toBe("ready");
  });
});
