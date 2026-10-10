import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import classNames from "classnames";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  Brush,
  Eraser,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import WorkspaceToolSwitcher from "@/components/WorkspaceToolSwitcher";
import ImageStudio from "./ImageStudio";

import {
  resolveDownloadUrl,
  resolvePreviewUrl,
} from "./utils";
import { useImageGenerationConfig } from "./useImageGenerationConfig";
import { useImageGenerationHistory } from "./useImageGenerationHistory";
import { useImageEditor } from "./useImageEditor";
import { useImageGenerationSession } from "./useImageGenerationSession";

interface WorkspaceImageGenerationProps {
  embedded?: boolean;
}

function ImagePreviewModal({
  src,
  onClose,
}: {
  src: string | null;
  onClose: () => void;
}) {
  if (!src) return null;

  return (
    <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Content aria-describedby={undefined} className="fixed left-1/2 top-1/2 z-50 max-w-[90vw] -translate-x-1/2 -translate-y-1/2 outline-none">
          <Dialog.Title className="sr-only">图片预览</Dialog.Title>
          <img src={src} alt="预览" className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain shadow-2xl" />
          <Dialog.Close aria-label="关闭图片预览" className="absolute right-2 top-2 rounded-full bg-black/60 p-2 text-white"><X className="h-4 w-4" /></Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const WorkspaceImageGeneration: ResearchType.FC<WorkspaceImageGenerationProps> = ({embedded,}) => {
  const { config, updateConfig } = useImageGenerationConfig();
  const {
    historyBatches,
    historyTotal,
    historyPageNo,
    historyLoading,
    historyLoadingMore,
    historyError,
    loadHistory,
  } = useImageGenerationHistory();
  const {
    images,
    editingImage,
    brushSize,
    toolMode,
    editorImageRef,
    maskCanvasRef,
    addFiles,
    collectEffectiveImages,
    closeEditor,
    openEditor,
    removeImage,
    clearCurrentMask,
    refreshEditorLayout,
    buildMaskCompositeDataUrls,
    setBrushSize,
    setToolMode,
  } = useImageEditor();
  const {
    prompt,
    setPrompt,
    messages,
    clearMessages,
    handleSend,
    statusText,
    statusTone,
  } = useImageGenerationSession({
    config,
    collectEffectiveImages,
    buildMaskCompositeDataUrls,
    reloadHistory: () => loadHistory(1, true),
  });

  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const isGenerating = messages.some(
    (m) => m.role === "assistant" && m.status === "loading"
  );

  const sessionImages = useMemo(
    () =>
      messages.flatMap((msg, index) =>
        msg.role === "assistant" && msg.status !== "loading"
          ? msg.images.map((img) => ({
            ...img,
            messageId: msg.id,
            prompt: [...messages.slice(0, index)].reverse().find(item => item.role === "user")?.prompt ?? "",
            createdAt: msg.timestamp,
          }))
          : []
      ),
    [messages]
  );

  const historyImages = useMemo(
    () =>
      historyBatches.flatMap((batch) =>
        batch.images
          .map((item, index) => {
            const previewUrl = resolvePreviewUrl(item);
            if (!previewUrl) return null;
            return {
              url: previewUrl,
              label: item.fileName || batch.prompt || `图片 ${index + 1}`,
              downloadUrl: resolveDownloadUrl(item) || undefined,
              messageId: batch.requestId,
              prompt: batch.prompt,
              createdAt: batch.createdAt,
              mode: batch.mode,
            };
          })
          .filter(Boolean) as Array<{
          url: string;
          label: string;
          downloadUrl?: string;
          messageId: string;
          prompt: string;
          createdAt?: string | null;
          mode?: string;
        }>
      ),
    [historyBatches]
  );

  const myImages = useMemo(() => {
    const seen = new Set<string>();
    const merged = [...[...sessionImages].reverse(), ...historyImages];
    return merged.filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    });
  }, [historyImages, sessionImages]);

  return (
    <div className="relative h-full min-h-0 bg-[var(--chat-bg)] text-[var(--chat-text)]">
      <ImageStudio
        navigation={!embedded ? <><Link to="/" target="_blank" rel="noreferrer" className="studio-icon-button" aria-label="返回首页"><ArrowLeft className="h-4 w-4" /></Link><WorkspaceToolSwitcher /></> : undefined}
        config={config} updateConfig={updateConfig} prompt={prompt} setPrompt={setPrompt}
        references={images} addFiles={addFiles} removeImage={removeImage} openEditor={openEditor}
        works={myImages} generating={isGenerating}
        statusText={statusTone === "error" ? [...messages].reverse().filter(item => item.role === "assistant").find(item => item.error)?.error || statusText : statusText}
        statusTone={statusTone}
        error={historyError} loading={historyLoading} loadingMore={historyLoadingMore}
        hasMore={historyBatches.length < historyTotal}
        onRefresh={() => void loadHistory(1, true)}
        onLoadMore={() => void loadHistory(historyPageNo + 1, false)}
        onGenerate={() => void handleSend()} onSettings={() => setShowSettings(true)}
        onPreview={setPreviewImage} onReset={clearMessages}
      />

      {/* settings panel */}
      {showSettings ? (
        <>
          <button
            type="button"
            aria-label="关闭设置"
            className="fixed inset-0 z-30 bg-[oklch(0.2_0.01_60/0.14)]"
            onClick={() => setShowSettings(false)}
          />
          <aside className="fixed right-0 top-0 z-40 flex h-full w-full max-w-[340px] flex-col border-l border-[var(--chat-border)] bg-[var(--chat-surface)] shadow-[var(--shadow-xl)]">
            <div className="flex items-center justify-between border-b border-[var(--chat-border)] px-4 py-4">
              <div>
                <div className="text-[14px] font-semibold text-[var(--chat-text)]">生成设置</div>
                <div className="mt-0.5 text-[12px] text-[var(--chat-text-muted)]">
                  模型与输出参数
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSettings(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--chat-text-muted)] hover:bg-[var(--chat-surface-soft)]"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-4 overflow-y-auto p-4">
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-[var(--chat-text-muted)]">
                  Base URL
                </span>
                <input
                  value={config.baseUrl}
                  onChange={(event) => updateConfig("baseUrl", event.target.value)}
                  placeholder="https://..."
                  className="w-full rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-soft)] px-3 py-2 text-sm text-[var(--chat-text)] outline-none focus:border-[var(--chat-accent)]/30"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-[var(--chat-text-muted)]">
                  API Key
                </span>
                <input
                  type="password"
                  value={config.apiKey}
                  onChange={(event) => updateConfig("apiKey", event.target.value)}
                  placeholder="sk-..."
                  className="w-full rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-soft)] px-3 py-2 font-mono text-sm tracking-wide text-[var(--chat-text)] outline-none focus:border-[var(--chat-accent)]/30"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-[var(--chat-text-muted)]">
                  Model
                </span>
                <input
                  value={config.model}
                  onChange={(event) => updateConfig("model", event.target.value)}
                  className="w-full rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-soft)] px-3 py-2 font-mono text-sm text-[var(--chat-text)] outline-none focus:border-[var(--chat-accent)]/30"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-[var(--chat-text-muted)]">
                  Size
                </span>
                <input
                  value={config.size}
                  onChange={(event) => updateConfig("size", event.target.value)}
                  placeholder="1024x1024"
                  className="w-full rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-soft)] px-3 py-2 text-sm text-[var(--chat-text)] outline-none focus:border-[var(--chat-accent)]/30"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-[11px] font-medium text-[var(--chat-text-muted)]">
                  数量 n
                </span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={config.n}
                  onChange={(event) => updateConfig("n", Number(event.target.value) || 1)}
                  className="w-full rounded-xl border border-[var(--chat-border)] bg-[var(--chat-surface-soft)] px-3 py-2 text-sm text-[var(--chat-text)] outline-none focus:border-[var(--chat-accent)]/30"
                />
              </label>
            </div>
          </aside>
        </>
      ) : null}

      {/* mask editor overlay */}
      {editingImage && (
        <div className="fixed inset-0 z-40 flex flex-col bg-black/80">
          <div className="flex items-center justify-between gap-4 bg-black/40 px-6 py-3 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <span className="text-[14px] font-medium text-white/90">
                编辑 #{images.findIndex((i) => i.id === editingImage.id) + 1}
              </span>
              <span className="text-[12px] text-white/50">
                {editingImage.naturalWidth}×{editingImage.naturalHeight}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={clearCurrentMask}
                className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[13px] text-white/80 transition hover:bg-white/20"
              >
                <Trash2 className="h-3.5 w-3.5" />
                清除涂抹
              </button>
              <button
                type="button"
                onClick={closeEditor}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[var(--primary)] px-4 py-1.5 text-[13px] font-medium text-white transition hover:bg-[var(--primary)]/90"
              >
                <Sparkles className="h-3.5 w-3.5" />
                完成编辑
              </button>
            </div>
          </div>

          <div className="flex flex-1 items-center justify-center overflow-auto p-6">
            <div className="relative inline-block">
              <img
                ref={editorImageRef}
                src={editingImage.objectUrl}
                alt="编辑中"
                draggable={false}
                onLoad={refreshEditorLayout}
                className="block max-h-[70vh] max-w-full select-none rounded-lg shadow-2xl"
              />
              <canvas
                ref={maskCanvasRef}
                className="absolute inset-0 cursor-crosshair rounded-lg touch-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 bg-black/40 px-6 py-3 backdrop-blur-sm">
            <div className="inline-flex rounded-full bg-white/10 p-0.5">
              <button
                type="button"
                onClick={() => setToolMode("brush")}
                className={classNames(
                  "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium transition",
                  toolMode === "brush"
                    ? "bg-white/20 text-white shadow-sm"
                    : "text-white/60 hover:text-white/90"
                )}
              >
                <Brush className="h-4 w-4" />
                笔刷
              </button>
              <button
                type="button"
                onClick={() => setToolMode("eraser")}
                className={classNames(
                  "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[13px] font-medium transition",
                  toolMode === "eraser"
                    ? "bg-white/20 text-white shadow-sm"
                    : "text-white/60 hover:text-white/90"
                )}
              >
                <Eraser className="h-4 w-4" />
                擦除
              </button>
            </div>

            <div className="inline-flex items-center gap-3 rounded-full bg-white/10 px-4 py-2 text-[13px] text-white/70">
              <span>笔刷大小</span>
              <input
                type="range"
                min={8}
                max={96}
                step={2}
                value={brushSize}
                onChange={(event) => setBrushSize(Number(event.target.value))}
                className="w-24 accent-white"
              />
              <span className="min-w-[2ch] font-mono text-white">{brushSize}</span>
            </div>
          </div>
        </div>
      )}

      <ImagePreviewModal src={previewImage} onClose={() => setPreviewImage(null)} />
    </div>
  );
};

export default WorkspaceImageGeneration;
