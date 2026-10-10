// Isolated visual verification of the production component. No API calls.
import { useState } from "../ui/node_modules/react";
import { createRoot } from "../ui/node_modules/react-dom/client";
import ImageStudio from "../ui/src/pages/WorkspaceImageGeneration/ImageStudio";
import type { GenerationConfig } from "../ui/src/pages/WorkspaceImageGeneration/types";
function Check() {
  const [prompt, setPrompt] = useState("");
  const [state, setState] = useState("empty");
  const [config, setConfig] = useState<GenerationConfig>({ baseUrl: "", apiKey: "", model: "gpt-image-2", mode: "images", size: "1024x1024", n: 1, batchMode: true });
  return <><div className="check-toolbar">组件验证 · 无接口请求 <button onClick={() => setState("empty")}>空白</button><button onClick={() => setState("loading")}>生成中</button><button onClick={() => setState("error")}>失败</button></div><div className="check-frame"><ImageStudio config={config} updateConfig={(key, value) => setConfig(previous => ({ ...previous, [key]: value }))} prompt={prompt} setPrompt={setPrompt} references={[]} addFiles={() => {}} removeImage={() => {}} openEditor={() => {}} works={[]} generating={state === "loading"} statusText={state === "error" ? "测试状态：模型连接失败" : ""} statusTone={state === "error" ? "error" : "default"} loading={false} loadingMore={false} hasMore={false} onRefresh={() => {}} onLoadMore={() => {}} onGenerate={() => setState("loading")} onSettings={() => {}} onPreview={() => {}} onReset={() => setState("empty")} /></div></>;
}
createRoot(document.getElementById("root")!).render(<Check />);
