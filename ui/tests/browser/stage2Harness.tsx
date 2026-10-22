// Local deterministic browser fixture. Not imported by the application entrypoint.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import Dialogue from "../../src/components/Dialogue";
import GenUiActionBridge from "../../src/components/genui/GenUiActionBridge";
import { projectSessionSurfaces } from "../../src/utils/chat/surfaceProtocol";
import type { HtmlArtifactDocument } from "../../src/utils/chat/htmlSurfaces";
import "../../src/global.css";

const tree = (id: string) => ({ schemaVersion: "1", root: { nodeId: "root", kind: "Card", props: { title: `画布${id}` }, children: [
  { nodeId: "chart", kind: "Chart", props: { chart: "bar", categories: ["一月", "二月"], series: [{ name: "收入", values: [10, 20] }] } },
  { nodeId: "form", kind: "Form", props: { formId: "same-form" }, children: [{ nodeId: "input", kind: "Input", props: { name: "value", value: "未修改", placeholder: "修改本画布" } }] },
  { nodeId: "patch", kind: "Button", props: { label: "只改本画布", action: { type: "patch_ui", payload: { patches: [{ op: "replace", path: "/root/props/title", value: `画布${id}已更新` }] } } } },
] } });
const chat: any = { requestId: "r1", sessionId: "fixture-session", query: "合成多 Surface 验收", agentType: "react", loading: false,
  tasks: [[...['A', 'B'].map(id => ({ messageType: "ui_tree", messageId: id, resultMap: { tree: tree(id), canvas_id: id } }))]] };
const surfaces = projectSessionSurfaces([chat]).get("r1")!;
const doc = (revision: number): HtmlArtifactDocument => ({ kind: "html", schemaVersion: "rui/1", sessionId: "fixture-session", surfaceId: "html-fixture",
  messageId: "r1", revision, serverManaged: true,
  artifact: { title: `合成游戏 V${revision}`, relativePath: "game.html", previewUrl: `/tool/v1/file_tool/preview/fixture-session/v${revision}.html`, downloadUrl: "" } });

function Harness() {
  const [revision, setRevision] = useState(1);
  const [mounted, setMounted] = useState(true);
  return <div style={{ maxWidth: 1000, margin: "auto", padding: 20 }}>
    <h1>阶段 2 确定性浏览器验收</h1>
    <button onClick={() => setRevision(2)}>测试发布 V2</button>
    <button onClick={() => setMounted(value => !value)}>测试卸载</button>
    <GenUiActionBridge />
    {mounted && <Dialogue chat={chat} deepThink={false} sessionSurfaces={surfaces} htmlSurfaces={[doc(revision)]} />}
  </div>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
