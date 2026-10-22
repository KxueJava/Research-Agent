import { describe, expect, it } from "vitest";
import { HTML_PREVIEW_SANDBOX } from "./previewPolicy";
describe("untrusted preview isolation",()=>{
  it("allows offline scripts without granting same-origin or popup escape",()=>{
    const flags=HTML_PREVIEW_SANDBOX.split(" ");
    expect(flags).toContain("allow-scripts");
    expect(flags).not.toContain("allow-same-origin");
    expect(flags).not.toContain("allow-popups-to-escape-sandbox");
    expect(flags).not.toContain("allow-top-navigation");
  });
});
