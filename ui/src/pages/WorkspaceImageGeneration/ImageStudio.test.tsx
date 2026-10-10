import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ImageStudio from "./ImageStudio";
import { createDefaultConfig } from "./useImageGenerationConfig";

const props = {
  config: createDefaultConfig(),
  updateConfig: vi.fn(),
  prompt: "",
  setPrompt: vi.fn(),
  references: [],
  addFiles: vi.fn(),
  removeImage: vi.fn(),
  openEditor: vi.fn(),
  works: [],
  generating: false,
  statusText: "",
  statusTone: "default",
  loading: false,
  loadingMore: false,
  hasMore: false,
  onRefresh: vi.fn(),
  onLoadMore: vi.fn(),
  onGenerate: vi.fn(),
  onSettings: vi.fn(),
  onPreview: vi.fn(),
  onReset: vi.fn(),
};

describe("image studio states", () => {
  it("shows an honest empty state without sample output images", () => {
    const html = renderToStaticMarkup(<ImageStudio {...props} />);
    expect(html).toContain("还没有作品");
    expect(html).not.toContain("<img");
    expect(html).toMatch(/studio-generate[^>]*disabled/);
  });
  it("keeps custom stored dimensions and counts available", () => {
    const html = renderToStaticMarkup(
      <ImageStudio
        {...props}
        config={{
          ...props.config,
          size: "1792x1024",
          n: 3
        }}
      />,
    );
    expect(html).toContain('value="1792x1024"');
    expect(html).toContain("自定义");
    expect(html).toContain("3 张");
  });
  it("shows real work links and descriptions", () => {
    const html = renderToStaticMarkup(
      <ImageStudio
        {...props}
        works={[
          {
            url: "/preview.png",
            label: "输出",
            prompt: "林间小屋",
            downloadUrl: "/download.png",
          },
        ]}
      />,
    );
    expect(html).toContain('src="/preview.png"');
    expect(html).toContain('href="/download.png"');
    expect(html).toContain("林间小屋");
    expect(html).not.toContain("还没有作品");
  });
  it("blocks another request while generating and announces its state", () => {
    const html = renderToStaticMarkup(
      <ImageStudio {...props} prompt="建筑" generating />,
    );
    expect(html).toContain("正在将想法变成画面");
    expect(html).toMatch(/studio-generate[^>]*disabled/);
  });
  it("exposes provider and history errors", () => {
    const html = renderToStaticMarkup(
      <ImageStudio
        {...props}
        statusText="模型不可用"
        statusTone="error"
        error="历史查询失败"
      />,
    );
    expect(html).toContain("模型不可用");
    expect(html).toContain("历史查询失败");
    expect(html).toContain('role="alert"');
  });
});
