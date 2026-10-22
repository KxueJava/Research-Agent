import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createDefaultMRagWorkspaceStoredState,
  formatFileDocCount,
  parseMRagWorkspaceStoredState,
  resolveFileStatusMeta,
  resolveSourceSummary,
} from "./utils";

describe("WorkspaceMRag utils", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("无浏览器环境时使用工具代理路径和空知识库选择", () => {
    expect(createDefaultMRagWorkspaceStoredState()).toEqual({
      toolBaseUrl: "/tool",
      selectedKnowledgeBaseId: "",
    });
  });

  it.each([undefined, null, "invalid-json"])("缺失或非法持久化值 %s 回退默认状态", (rawValue) => {
    expect(parseMRagWorkspaceStoredState(rawValue)).toEqual({
      toolBaseUrl: "/tool",
      selectedKnowledgeBaseId: "",
    });
  });

  it.each([
    "http://127.0.0.1:1601/",
    "https://old-tool.example.invalid/tool/",
  ])("忽略历史工具地址 %s，保留知识库选择", (toolBaseUrl) => {
    expect(
      parseMRagWorkspaceStoredState(
        JSON.stringify({
          toolBaseUrl,
          selectedKnowledgeBaseId: "kb-1",
        })
      )
    ).toEqual({
      toolBaseUrl: "/tool",
      selectedKnowledgeBaseId: "kb-1",
    });
  });

  it("浏览器中历史地址不能覆盖当前站点的工具代理入口", () => {
    vi.stubGlobal("window", {
      location: {
        protocol: "https:",
        host: "research.example.invalid",
        hostname: "research.example.invalid",
      },
    });
    vi.stubGlobal("RESEARCH_TOOL_BASE_URL", "http://127.0.0.1:1601/");

    expect(parseMRagWorkspaceStoredState(JSON.stringify({
      toolBaseUrl: "https://old-tool.example.invalid/tool/",
      selectedKnowledgeBaseId: "kb-1",
    }))).toEqual({
      toolBaseUrl: "https://research.example.invalid/tool",
      selectedKnowledgeBaseId: "kb-1",
    });
  });

  it("根据文件状态返回稳定的展示文案", () => {
    expect(resolveFileStatusMeta("RUNNING")).toMatchObject({label: "处理中",});
    expect(resolveFileStatusMeta("SUCCESS")).toMatchObject({label: "已完成",});
    expect(resolveFileStatusMeta("FAILED")).toMatchObject({label: "失败",});
  });

  it("按不同阶段格式化文件片段数", () => {
    expect(formatFileDocCount({
      docCount: 8,
      fileStatus: "SUCCESS"
    })).toBe("8 个片段");
    expect(formatFileDocCount({
      docCount: 0,
      fileStatus: "FAILED"
    })).toBe("未完成切片");
    expect(formatFileDocCount({
      docCount: 0,
      fileStatus: "RUNNING"
    })).toBe("处理中");
  });

  it("提取来源摘要时优先返回主机名", () => {
    expect(resolveSourceSummary("https://docs.example.com/guide/index.html")).toBe(
      "docs.example.com"
    );
    expect(resolveSourceSummary("not-a-url")).toBe("not-a-url");
  });
});

