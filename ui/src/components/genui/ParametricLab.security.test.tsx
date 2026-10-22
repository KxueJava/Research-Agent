import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ParametricLab from "./ParametricLab";
describe("model-authored SVG boundary",()=>{
  it("does not inject an authored foreignObject or nested iframe into the host DOM",()=>{
    const html=renderToStaticMarkup(createElement(ParametricLab,{
      scene:"custom_svg",svg:'<svg><foreignObject><iframe srcdoc="<script>parent.pwned=1</script>"></iframe></foreignObject></svg>',
    }));
    expect(html).not.toContain("<foreignObject>");
    expect(html).toContain('sandbox=""');
  });
});
