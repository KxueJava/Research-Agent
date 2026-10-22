import { describe, expect, it } from "vitest";
import { isUiStreamTree, reduceUiStream, restoreUiStream } from "./uiStreamReducer";
const tree = (value = "A") => ({ schemaVersion: "1", root: { kind: "Card", nodeId: "root", props: {}, children: [{ kind: "Stat", nodeId: "a", props: { value }, children: [] }] } });
const event = (sequence = 1, overrides: Record<string, unknown> = {}) => ({ protocol: "rui-stream/1", sessionId: "s", surfaceId: "a", messageId: "r1", generationId: "g1", sequence, baseRevision: sequence - 1, revision: sequence,
  status: "committed", startedAt: 1000, emittedAt: 1200 + sequence, firstUsefulAt: 1201, snapshot: tree(), ...overrides });
describe("incremental UI commits", () => {
  it("allows complete resource/calculation declarations while leaving previews staged",()=>{
    for(const prop of ["dataRef","computation"]){
      const value={root:{kind:"Stat",props:{[prop]:{id:"sales",op:"split",amount:100,people:3}}}};
      expect(isUiStreamTree(value,true)).toBe(true);expect(isUiStreamTree(value,false)).toBe(false);
    }
  });
  it("rejects closed but ill-typed render props and oversized trees", () => {
    for (const props of [{title:{}}, {series:"bad"}, {series:[{values:"bad"}]}, {categories:{}}, {chart:42}]) {
      expect(isUiStreamTree({root:{kind:"Chart",props}})).toBe(false);
    }
    expect(isUiStreamTree({root:{kind:"Card",props:{items:Array(100).fill("x".repeat(20000))}}})).toBe(false);
    for (const kind of ["Stat","TableCell","CodeBlock"]) for (const completed of [false,true]) expect(isUiStreamTree({root:{kind,props:{value:{bad:true}}}},completed)).toBe(false);
  });
  it("requires immutable generation timestamps and a real initial commit", () => {
    const state=reduceUiStream(undefined,event(),"s")!;
    expect(reduceUiStream(state,event(2,{firstUsefulAt:1202}),"s")).toBe(state);
    expect(reduceUiStream(undefined,event(1,{status:"cancelled"}),"s")).toBeUndefined();
  });
  it("shows complete A before completion and records first useful latency", () => {
    const state = reduceUiStream(undefined, event(), "s")!;
    expect(state.status).toBe("committed"); expect(state.tree.root.children[0].props.value).toBe("A");
    expect(state.firstUsefulLatencyMs).toBe(201);
  });
  it("rejects malformed B without mutating or discarding A", () => {
    const state = reduceUiStream(undefined, event(), "s")!;
    const broken: any = tree(); broken.root.children.push({ kind: "Stat", nodeId: "b", props: "unfinished" });
    expect(reduceUiStream(state, event(2, { snapshot: broken }), "s")).toBe(state);
  });
  it("deduplicates and rejects gaps, stale generations and foreign sessions", () => {
    const state = reduceUiStream(undefined, event(), "s")!;
    for (const incoming of [event(), event(3), event(2, { generationId: "old", startedAt: 900 }), event(2, { sessionId: "other" })]) {
      expect(reduceUiStream(state, incoming, "s")).toBe(state);
    }
    const newer = reduceUiStream(state, event(1, { generationId: "g2", startedAt: 1300, emittedAt: 1400, firstUsefulAt: 1400, baseRevision: 1, revision: 2 }), "s")!;
    expect(newer.generationId).toBe("g2"); expect(reduceUiStream(newer, event(2), "s")).toBe(newer);
  });
  it("retains A on cancellation and cannot accept late events after terminal state", () => {
    const state = reduceUiStream(undefined, event(), "s")!;
    const cancelled = reduceUiStream(state, event(2, { status: "cancelled" }), "s")!;
    expect(cancelled.tree).toEqual(state.tree); expect(cancelled.status).toBe("cancelled");
    expect(reduceUiStream(cancelled, event(3), "s")).toBe(cancelled);
  });
  it("keeps executable HTML and unresolved data references out of partial commits", () => {
    for (const node of [{ kind: "HtmlFrame", nodeId: "html", props: { html: "<script>alert(1)</script>" } }, { kind: "Chart", nodeId: "chart", props: { dataRef: "missing" } }]) {
      const bad: any = tree(); bad.root.children.push(node);
      expect(reduceUiStream(undefined, event(1, { snapshot: bad }), "s")).toBeUndefined();
    }
  });
  it("hydrates an interrupted persisted snapshot with the same validation and timing", () => {
    const stream: any = event(3, { status: "failed" }); delete stream.snapshot;
    const state = restoreUiStream({ sessionId: "s", surfaceId: "a", revision: 3, stream, tree: tree() }, "s")!;
    expect(state.status).toBe("failed"); expect(state.tree).toEqual(tree()); expect(state.firstUsefulLatencyMs).toBe(201);
    expect(restoreUiStream({ sessionId: "other", surfaceId: "a", revision: 3, stream, tree: tree() }, "s")).toBeUndefined();
  });
});
