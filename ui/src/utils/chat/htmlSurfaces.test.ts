import { describe, expect, it } from "vitest";
import { projectHtmlSurfaces } from "./htmlSurfaces";
const doc = (revision: number, id = "html-a") => ({ kind: "html", schemaVersion: "rui/1", sessionId: "s", surfaceId: id, messageId: "r1", revision, artifact: { title: `V${revision}`, relativePath: "game.html", previewUrl: `http://localhost:1601/v1/file_tool/preview/s/v${revision}.html`, downloadUrl: `http://localhost:1601/v1/file_tool/download/s/v${revision}.html` } });
const chat = (requestId: string, docs: any[]) => ({ sessionId: "s", requestId, tasks: [docs.map(surface => ({ messageType: "html", resultMap: { resultMap: { surface } } }))] }) as any;
describe("HTML Surface projection", () => {
  it('projects latest owned snapshots independently of older ledger events',()=>{
    const chats=[chat('r1',[doc(1)])];
    expect(projectHtmlSurfaces(chats,[doc(3),doc(2),{...doc(9),sessionId:'foreign'}]).get('r1')?.[0].revision).toBe(3);
  });
  it("updates the original round without duplicating a new iframe on the edit round", () => {
    const result = projectHtmlSurfaces([chat("r1", [doc(1)]), chat("r2", [doc(2)])]);
    expect(result.get("r1")?.[0].revision).toBe(2);
    expect(result.get("r2")).toBeUndefined();
  });
  it("does not regress when duplicate or old events arrive", () => {
    expect(projectHtmlSurfaces([chat("r1", [doc(3), doc(1), doc(3)])]).get("r1")?.[0].revision).toBe(3);
  });
  it("keeps multiple artifacts separate and refuses foreign-session metadata", () => {
    const bad = { ...doc(8), sessionId: "foreign" };
    const result = projectHtmlSurfaces([chat("r1", [doc(1), doc(1, "html-b"), bad])]);
    expect(result.get("r1")?.map(x => x.surfaceId)).toEqual(["html-a", "html-b"]);
  });
  it("finds nested sub-agent tools and legacy HTML files", () => {
    const modern: any = chat("r1", []);
    modern.multiAgent = { tasks: [[{ messageType: "tool_call", children: [{ resultMap: { surface: doc(2) } }] }]] };
    expect(projectHtmlSurfaces([modern]).get("r1")?.[0].revision).toBe(2);
    const legacy: any = chat("old", []);
    legacy.tasks = [[{ messageType: "html", resultMap: { fileInfo: [{ fileName: "old.html", domainUrl: "http://localhost:1601/v1/file_tool/preview/s/old.html" }] } }]];
    expect(projectHtmlSurfaces([legacy]).get("old")?.[0].serverManaged).toBe(false);
  });
  it("ignores invalid revisions and unsafe preview URLs", () => {
    const bad = doc(1); bad.artifact.previewUrl = "javascript:alert(1)";
    expect(projectHtmlSurfaces([chat("r1", [doc(0), bad])]).size).toBe(0);
  });
});
