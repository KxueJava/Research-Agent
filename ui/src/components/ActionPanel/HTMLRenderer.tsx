import { jumpUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import classNames from "classnames";
import { Download, ExternalLink } from "lucide-react";
import { memo, useLayoutEffect, useMemo, useRef, useState } from "react";
import Loading from "./Loading";
import { Empty } from "antd";
import MarkdownRenderer from "./MarkdownRenderer";
import { HTML_PREVIEW_SANDBOX } from "../genui/previewPolicy";
import { createPreviewLoadGuard } from "./previewLoadGuard";
import { prepareHtmlPreview } from "./prepareHtmlPreview";
import { instrumentHtmlRuntime, readRuntimeMessage, type RuntimeMessage } from "../artifacts/runtimeBridge";

export type HtmlRuntimeOptions = { id: string; paused: boolean; onMessage: (message: RuntimeMessage) => void };

function PreviewFrame({ htmlUrl, htmlContent, runtime }: { htmlUrl?: string; htmlContent?: string; runtime?: HtmlRuntimeOptions }) {
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [attempt, setAttempt] = useState(0);
  const [retry, setRetry] = useState(0);
  const [prepared, setPrepared] = useState(false);
  const [preparedHtml, setPreparedHtml] = useState<string | undefined>();
  const guard = useRef<ReturnType<typeof createPreviewLoadGuard> | null>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const runtimeRef = useRef(runtime); runtimeRef.current = runtime;
  const notify = (type: string) => {
    if (runtimeRef.current) frame.current?.contentWindow?.postMessage({ channel: "research-artifact/v1", runtimeId: runtimeRef.current.id, type }, "*");
  };
  useLayoutEffect(() => {
    if (!runtime?.id) return;
    const listener = (event: MessageEvent) => {
      const message = readRuntimeMessage(event, frame.current?.contentWindow || null, runtime.id);
      if (message) runtimeRef.current?.onMessage(message);
    };
    window.addEventListener("message", listener);
    return () => { notify("dispose"); window.removeEventListener("message", listener); };
  }, [runtime?.id]);
  useLayoutEffect(() => {
    const sync = () => notify(runtimeRef.current?.paused || document.hidden ? "pause" : "resume");
    sync(); document.addEventListener("visibilitychange", sync);
    return () => document.removeEventListener("visibilitychange", sync);
  }, [runtime?.paused]);
  useLayoutEffect(() => {
    setStatus("loading");
    setPrepared(false);
    const controller = new AbortController();
    const preparationTimer = window.setTimeout(() => { controller.abort(); setStatus("error"); }, 20_000);
    void prepareHtmlPreview(htmlUrl, controller.signal).then((html) => {
      if (controller.signal.aborted) return;
      window.clearTimeout(preparationTimer);
      setPreparedHtml(runtimeRef.current && html !== undefined ? instrumentHtmlRuntime(html, runtimeRef.current.id) : html);
      guard.current = createPreviewLoadGuard(
        () => setAttempt((value) => value + 1),
        () => setStatus("error")
      );
      setPrepared(true);
    }).catch(() => {
      window.clearTimeout(preparationTimer);
      if (!controller.signal.aborted) setStatus("error");
    });
    return () => { window.clearTimeout(preparationTimer); controller.abort(); guard.current?.dispose(); guard.current = null; };
  }, [retry, htmlUrl]);

  return <>
    {prepared ? <iframe
      ref={frame}
      key={`${retry}-${attempt}`}
      className="absolute inset-0 h-full w-full border-0 bg-white"
      title="HTML preview"
      sandbox={HTML_PREVIEW_SANDBOX}
      referrerPolicy="no-referrer"
      {...(preparedHtml !== undefined ? { srcDoc: preparedHtml } : htmlUrl ? { src: htmlUrl } : { srcDoc: htmlContent || "" })}
      onLoad={() => { guard.current?.finish(); setStatus("ready"); notify(runtimeRef.current?.paused || document.hidden ? "pause" : "resume"); }}
      onError={() => { guard.current?.finish(); setStatus("error"); }}
    /> : null}
    {status === "loading" ? <Loading loading className="absolute inset-0 z-10 h-full w-full bg-white/70" /> : null}
    {status === "error" ? (
      <div role="alert" className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-white/95 p-6 text-center">
        <p>预览未能加载，请重试；若登录已过期，请重新登录。</p>
        <Button type="button" variant="outline" onClick={() => setRetry((value) => value + 1)}>重新加载预览</Button>
      </div>
    ) : null}
  </>;
}

interface HTMLRendererProps {
  htmlUrl?: string;
  downloadUrl?: string;
  missingReason?: string;
  showToolBar?: boolean;
  /** 内联 HTML 字符串（无文件 URL 时用 srcDoc 渲染） */
  htmlContent?: string;
  outputCode?: string;
  isStreaming?: boolean;
  className?: string;
  runtime?: HtmlRuntimeOptions;
}

const HTMLRenderer: ResearchType.FC<HTMLRendererProps> = memo((props) => {
  const {
    htmlUrl,
    className,
    downloadUrl,
    missingReason,
    showToolBar,
    htmlContent,
    outputCode,
    isStreaming = false,
    runtime,
  } = props;

  const headerActions = useMemo(() => {
    if (!showToolBar || !htmlUrl) return null;
    return (
      <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-full bg-white/90 p-0.5 shadow-sm ring-1 ring-black/[0.04]">
        <Button
          aria-label="在新窗口打开"
          className="h-7 w-7 shrink-0 rounded-full text-[var(--chat-text-soft)] hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-text)]"
          onClick={() => jumpUrl(htmlUrl)}
          size="icon-sm"
          title="在新窗口打开"
          type="button"
          variant="ghost"
        >
          <ExternalLink className="size-3.5" />
        </Button>
        {downloadUrl ? (
          <Button
            aria-label="下载"
            className="h-7 w-7 shrink-0 rounded-full text-[var(--chat-text-soft)] hover:bg-[var(--chat-surface-muted)] hover:text-[var(--chat-text)]"
            onClick={() => jumpUrl(downloadUrl)}
            size="icon-sm"
            title="下载"
            type="button"
            variant="ghost"
          >
            <Download className="size-3.5" />
          </Button>
        ) : null}
      </div>
    );
  }, [showToolBar, htmlUrl, downloadUrl]);

  if (!htmlUrl && !htmlContent && outputCode) {
    return (
      <MarkdownRenderer
        markDownContent={outputCode}
        isStreaming={isStreaming}
      />
    );
  }

  if (missingReason && !htmlUrl && !htmlContent) {
    return (
      <div
        className={classNames(
          "flex h-full min-h-[320px] items-center justify-center p-6 text-red-500",
          className
        )}
      >
        {missingReason}
      </div>
    );
  }

  if (htmlUrl || htmlContent) {
    return (
      <div
        className={classNames(
          "relative h-full min-h-[480px] w-full flex-1 bg-white",
          className
        )}
      >
        {headerActions}
        <PreviewFrame key={htmlUrl || htmlContent} htmlUrl={htmlUrl} htmlContent={htmlContent} runtime={runtime} />
      </div>
    );
  }

  return (
    <div className={classNames(className, "relative min-h-[240px]")}>
      <Empty description="暂无内容" className="mt-32" />
    </div>
  );
});

HTMLRenderer.displayName = "HTMLRenderer";

export default HTMLRenderer;
