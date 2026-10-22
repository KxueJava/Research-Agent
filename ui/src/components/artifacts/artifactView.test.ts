import { describe, expect, it } from "vitest";
import { artifactFrameKey, artifactRevisionOptions, acceptArtifactResponse } from "./artifactView";
describe("artifact view identity", () => {
  it("preserves runtime between inline/sidebar/immersive but resets on explicit rerun or version change", () => {
    const doc = { surfaceId: "a", revision: 2 };
    expect(artifactFrameKey(doc, 0)).toBe(artifactFrameKey({ ...doc }, 0));
    expect(artifactFrameKey(doc, 1)).not.toBe(artifactFrameKey(doc, 0));
    expect(artifactFrameKey({ ...doc, revision: 3 }, 0)).not.toBe(artifactFrameKey(doc, 0));
  });
  it("bounds large revision menus while retaining the earliest and selected version", () => {
    const values = artifactRevisionOptions(10000, 4);
    expect(values.length).toBeLessThanOrEqual(52);
    expect(values).toContain(1); expect(values).toContain(4); expect(values).toContain(10000);
  });
  it("refuses late results from cancelled selections or older current versions", () => {
    expect(acceptArtifactResponse(1, 2, 4, 4)).toBe(false);
    expect(acceptArtifactResponse(2, 2, 3, 4)).toBe(false);
    expect(acceptArtifactResponse(2, 2, 5, 4)).toBe(true);
  });
});
