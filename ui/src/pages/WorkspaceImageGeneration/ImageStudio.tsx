import { useRef, useState } from "react";
import type { ReactNode } from "react";
import {
  Brush,
  Download,
  Expand,
  ImagePlus,
  Images,
  LoaderCircle,
  RotateCcw,
  Settings,
  Sparkles,
  UploadCloud,
  X,
} from "lucide-react";
import type { EditorImageItem, GenerationConfig } from "./types";
import { checkerboardStyle } from "./utils";
import "./image-studio.css";

interface StudioImage {
  url: string;
  label: string;
  downloadUrl?: string;
  prompt: string;
  createdAt?: string | number | null;
}
interface Props {
  navigation?: ReactNode;
  config: GenerationConfig;
  updateConfig: <K extends keyof GenerationConfig>(
    key: K,
    value: GenerationConfig[K],
  ) => void;
  prompt: string;
  setPrompt: (value: string) => void;
  references: EditorImageItem[];
  addFiles: (files: FileList | File[]) => void;
  removeImage: (id: string) => void;
  openEditor: (id: string) => void;
  works: StudioImage[];
  generating: boolean;
  statusText: string;
  statusTone: string;
  error?: string;
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  onRefresh: () => void;
  onLoadMore: () => void;
  onGenerate: () => void;
  onSettings: () => void;
  onPreview: (url: string) => void;
  onReset: () => void;
}
const presets = [
  {
    title: "建筑空间",
    note: "自然光 · 空间与材质",
    prompt:
      "森林中的现代玻璃小屋，平屋顶与浅色混凝土结构，暖色室内灯光，午后阳光穿过树冠，建筑摄影，安静自然的氛围。",
  },
  {
    title: "产品摄影",
    note: "静物 · 细腻质感",
    prompt:
      "琥珀色护理产品瓶，深色瓶盖与极简白色标签，浅灰背景，搭配一枝植物，自然侧光，细腻材质，商业产品摄影。",
  },
  {
    title: "平面海报",
    note: "排版 · 几何构图",
    prompt:
      "一张现代几何海报，浅蓝底色、米白色圆形和深蓝斜切构图，大字号英文排版，主题为 NEW PERSPECTIVE，清晰克制的平面设计。",
  },
];
const sizes: Record<string, string[]> = {
  "1:1": ["1024x1024", "1536x1536"],
  "16:9": ["1536x864", "2048x1152"],
  "9:16": ["864x1536", "1152x2048"],
};
function ratioOf(size: string) {
  const [w, h] = size.split("x").map(Number);
  return w && h
    ? w === h
      ? "1:1"
      : Math.abs(w / h - 16 / 9) < 0.02
        ? "16:9"
        : Math.abs(w / h - 9 / 16) < 0.02
          ? "9:16"
          : "custom"
    : "custom";
}

export default function ImageStudio(p: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLElement>(null);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [view, setView] = useState("canvas");
  const selected =
    p.works.find((item) => item.url === selectedUrl) ?? p.works[0];
  const isEdit = editing || p.references.length > 0;
  const ratio = ratioOf(p.config.size);
  const sizeOptions = [...new Set([p.config.size, ...(sizes[ratio] ?? [])])];
  const reuse = (text: string) => {
    p.setPrompt(text);
    promptRef.current?.focus();
  };
  const showHistory = () => {
    setView("history");
    historyRef.current?.scrollIntoView({
      block: "nearest",
      behavior: "smooth",
    });
  };
  const generate = () => {
    if (!p.generating && p.prompt.trim() && (!isEdit || p.references.length)) {
      setSelectedUrl(null);
      p.onGenerate();
    }
  };
  const reset = () => {
    p.onReset();
    p.setPrompt("");
    p.references.forEach((item) => p.removeImage(item.id));
    setEditing(false);
    promptRef.current?.focus();
  };
  return (
    <div className="image-studio">
      <header className="studio-header">
        <div>
          <p className="studio-eyebrow">RESEARCH / CREATE</p>
          <h1>图像工作室</h1>
        </div>
        <div className="studio-header-actions">
          {p.navigation}
          <button onClick={showHistory}>
            <Images size={16} />
            作品记录
          </button>
          <button
            className="studio-icon-button"
            aria-label="生成设置"
            onClick={p.onSettings}
          >
            <Settings size={18} />
          </button>
        </div>
      </header>
      <div className="studio-workspace">
        <aside className="studio-control" aria-label="创作参数">
          <div className="studio-control-scroll">
            <div className="studio-section-title">
              <h2>开始创作</h2>
              <button
                className="studio-icon-button"
                onClick={reset}
                aria-label="重置创作"
                disabled={p.generating}
              >
                <RotateCcw size={16} />
              </button>
            </div>
            <div className="studio-tabs" aria-label="创作方式">
              <button
                aria-pressed={!isEdit}
                onClick={() => {
                  setEditing(false);
                  if (p.references.length) return;
                  promptRef.current?.focus();
                }}
                disabled={p.references.length > 0}
              >
                文字生成
              </button>
              <button aria-pressed={isEdit} onClick={() => setEditing(true)}>
                图片编辑
              </button>
            </div>
            <div className="studio-label-row">
              <label htmlFor="studio-prompt">画面描述</label>
              <button onClick={() => reuse(presets[0].prompt)}>试试示例</button>
            </div>
            <div className="studio-prompt">
              <textarea
                id="studio-prompt"
                ref={promptRef}
                value={p.prompt}
                onChange={(event) => p.setPrompt(event.target.value)}
                placeholder={
                  "描述画面主体、场景、光线和风格。\n例如：森林中的现代玻璃小屋，午后自然光，建筑摄影。"
                }
                onKeyDown={(event) => {
                  if (
                    (event.ctrlKey || event.metaKey) &&
                    event.key === "Enter" &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault();
                    generate();
                  }
                }}
              />
              <span>{p.prompt.length} 字</span>
            </div>
            <div className="studio-label-row">
              <label>参考图片</label>
              <small>{isEdit ? "添加图片后可涂抹编辑" : "可选"}</small>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event) => {
                if (event.target.files) p.addFiles(event.target.files);
                event.target.value = "";
              }}
            />
            <button
              className="studio-upload"
              onClick={() => fileRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                p.addFiles(event.dataTransfer.files);
              }}
            >
              <UploadCloud size={21} />
              <span>
                点击上传，或拖放图片<small>上传参考图，保留画面细节</small>
              </span>
            </button>
            {p.references.length > 0 && (
              <div className="studio-references">
                {p.references.map((item) => (
                  <div key={item.id}>
                    <img src={item.objectUrl} alt={item.file.name} />
                    <button
                      className="studio-reference-edit"
                      onClick={() => p.openEditor(item.id)}
                      aria-label={`涂抹 ${item.file.name}`}
                    >
                      <Brush size={13} />
                      {item.maskDataUrl ? "已涂抹" : "涂抹"}
                    </button>
                    <button
                      className="studio-reference-remove"
                      onClick={() => p.removeImage(item.id)}
                      aria-label={`移除 ${item.file.name}`}
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            {p.references.length > 1 && (
              <label className="studio-check">
                <input
                  type="checkbox"
                  checked={p.config.batchMode}
                  onChange={(event) =>
                    p.updateConfig("batchMode", event.target.checked)
                  }
                />
                每张参考图分别生成
              </label>
            )}
            <div className="studio-divider" />
            <label className="studio-field" htmlFor="studio-model">
              生成模型
              <input
                id="studio-model"
                value={p.config.model}
                onChange={(event) =>
                  p.updateConfig("model", event.target.value)
                }
              />
            </label>
            <span className="studio-field-label">画面比例</span>
            <div className="studio-choices">
              {Object.keys(sizes).map((value) => (
                <button
                  key={value}
                  aria-pressed={ratio === value}
                  onClick={() => p.updateConfig("size", sizes[value][0])}
                >
                  <span
                    className={`studio-ratio ratio-${value.replace(":", "-")}`}
                  />
                  {value}
                </button>
              ))}
            </div>
            <label className="studio-field" htmlFor="studio-size">
              输出尺寸
              <select
                id="studio-size"
                value={p.config.size}
                onChange={(event) => p.updateConfig("size", event.target.value)}
              >
                {sizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size.replace("x", " × ")}
                    {ratio === "custom" ? " · 自定义" : ""}
                  </option>
                ))}
              </select>
            </label>
            <span className="studio-field-label">生成数量</span>
            <div className="studio-choices">
              {[...new Set([1, 2, 4, p.config.n])]
                .sort((a, b) => a - b)
                .map((n) => (
                  <button
                    key={n}
                    aria-pressed={p.config.n === n}
                    onClick={() => p.updateConfig("n", n)}
                  >
                    {n} 张
                  </button>
                ))}
            </div>
            <div className="studio-divider" />
            <div className="studio-label-row">
              <span>寻找一点灵感</span>
              <small>点击填入描述</small>
            </div>
            <div className="studio-presets">
              {presets.map((item) => (
                <button key={item.title} onClick={() => reuse(item.prompt)}>
                  <span>{item.title}</span>
                  <small>{item.note}</small>
                  <span aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
          </div>
          <div className="studio-submit">
            <button
              className="studio-generate"
              onClick={generate}
              disabled={
                p.generating ||
                !p.prompt.trim() ||
                (isEdit && !p.references.length)
              }
            >
              {p.generating ? (
                <LoaderCircle className="studio-spin" size={17} />
              ) : (
                <Sparkles size={17} />
              )}
              {p.generating ? "正在创作…" : isEdit ? "编辑图片" : "生成图片"}
            </button>
            <small>
              {isEdit && !p.references.length
                ? "请先添加待编辑图片"
                : "Ctrl / ⌘ + Enter 快速生成"}
            </small>
          </div>
        </aside>
        <main className="studio-output">
          <div className="studio-output-bar">
            <div className="studio-view-tabs">
              <button
                aria-pressed={view === "canvas"}
                onClick={() => setView("canvas")}
              >
                创作画布
              </button>
              <button aria-pressed={view === "history"} onClick={showHistory}>
                作品记录 <span>{p.works.length}</span>
              </button>
            </div>
            <span className="studio-ready">
              <i />
              {p.generating ? "正在生成" : "准备就绪"}
            </span>
          </div>
          {p.statusText && (
            <div
              className={`studio-status tone-${p.statusTone}`}
              role={p.statusTone === "error" ? "alert" : "status"}
            >
              {p.statusText}
              {p.statusTone === "error" && (
                <small>请检查生成设置或重试。</small>
              )}
            </div>
          )}
          {view === "canvas" && (
            <>
              <section
                className="studio-canvas"
                aria-label="图片预览"
                style={selected ? checkerboardStyle : undefined}
              >
                {selected ? (
                  <>
                    <img src={selected.url} alt={selected.label} />
                    <button
                      className="studio-expand studio-icon-button"
                      aria-label="放大图片"
                      onClick={() => p.onPreview(selected.url)}
                    >
                      <Expand size={18} />
                    </button>
                  </>
                ) : (
                  <div className="studio-empty">
                    <div className="studio-empty-icon">
                      <ImagePlus size={38} strokeWidth={1.3} />
                    </div>
                    <p className="studio-eyebrow">
                      A LITTLE IDEA. A NEW PERSPECTIVE.
                    </p>
                    <h2>让想象，有了画面。</h2>
                    <p>写下你的想法，从第一张图片开始。</p>
                    <button onClick={() => reuse(presets[0].prompt)}>
                      试试建筑摄影 <span>↗</span>
                    </button>
                  </div>
                )}
                {p.generating && (
                  <div className="studio-generating" role="status">
                    <LoaderCircle size={26} className="studio-spin" />
                    <strong>正在将想法变成画面</strong>
                    <span>生成可能需要一些时间，请稍候</span>
                  </div>
                )}
              </section>
              {selected && (
                <div className="studio-art-info">
                  <div>
                    <h2>{selected.prompt || selected.label}</h2>
                    <p>
                      {selected.createdAt
                        ? new Date(selected.createdAt).toLocaleString("zh-CN")
                        : "生成作品"}
                    </p>
                  </div>
                  <div className="studio-art-actions">
                    <button
                      disabled={!selected.prompt}
                      onClick={() => reuse(selected.prompt)}
                    >
                      使用描述
                    </button>
                    {selected.downloadUrl && (
                      <a
                        href={selected.downloadUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <Download size={15} />
                        下载
                      </a>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
          <section
            className="studio-history"
            ref={historyRef}
            aria-label="作品记录"
          >
            <div className="studio-section-title">
              <h2>
                最近的作品 <span>{p.works.length}</span>
              </h2>
              <button
                disabled={p.loading}
                onClick={p.onRefresh}
                aria-label="刷新作品记录"
              >
                <RotateCcw
                  size={14}
                  className={p.loading ? "studio-spin" : ""}
                />
                刷新
              </button>
            </div>
            {p.error && (
              <p className="studio-status tone-error" role="alert">
                {p.error}
              </p>
            )}
            {!p.works.length && (
              <p className="studio-history-empty">
                {p.loading
                  ? "正在加载作品…"
                  : "还没有作品，你的创作会保存在这里。"}
              </p>
            )}
            <div className="studio-thumbnails">
              {p.works.map((item) => (
                <button
                  key={item.url}
                  aria-pressed={selected?.url === item.url}
                  onClick={() => {
                    setSelectedUrl(item.url);
                    setView("canvas");
                  }}
                >
                  <div style={checkerboardStyle}>
                    <img src={item.url} alt={item.label} loading="lazy" />
                  </div>
                  <span>{item.prompt || item.label}</span>
                  <small>
                    {item.createdAt
                      ? new Date(item.createdAt).toLocaleDateString("zh-CN")
                      : "生成作品"}
                  </small>
                </button>
              ))}
            </div>
            {p.hasMore && (
              <button
                className="studio-load-more"
                disabled={p.loadingMore}
                onClick={p.onLoadMore}
              >
                {p.loadingMore ? "加载中…" : "加载更多作品"}
              </button>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}
