import { z } from "zod";

export const uiStreamEventSchema = z.object({
  protocol: z.literal("rui-stream/1"), sessionId: z.string().min(1).max(128), surfaceId: z.string().min(1).max(128),
  messageId: z.string().min(1).max(128), generationId: z.string().min(1).max(128),
  sequence: z.number().int().positive().safe(), baseRevision: z.number().int().nonnegative().safe(), revision: z.number().int().positive().safe(),
  status: z.enum(["committed", "completed", "cancelled", "failed"]),
  startedAt: z.number().nonnegative().finite(), emittedAt: z.number().nonnegative().finite(), firstUsefulAt: z.number().nonnegative().finite(),
  snapshot: z.unknown(),
}).passthrough().refine(e => e.revision === e.baseRevision + 1 && e.startedAt <= e.firstUsefulAt && e.firstUsefulAt <= e.emittedAt);

export type UiStreamEvent = z.infer<typeof uiStreamEventSchema>;
export type UiStreamState = UiStreamEvent & { tree: any; firstUsefulLatencyMs: number };
const blocked = new Set(["HtmlFrame", "ThreeJsFrame", "HostedCanvasFrame", "LiveCamera", "Model3D", "Video"]);
// Complex labs/resources wait for the full tool contract; previews use independently typed primitives.
const previewKinds = new Set("AspectBox Card Stat Progress List ListItem Table TableRow TableCell Image Icon CodeBlock Chart Button LinkButton InteractiveButton ToggleButton Form Input Textarea Select NumberInput Switch Slider SectionHeader Skeleton Avatar".split(" "));
const kinds = new Set("AspectBox Card Stat Progress List ListItem Table TableRow TableCell Image Icon CodeBlock Chart ParametricLab PythagorasLab GeometryLab InteractiveLab ConceptDemo AnimStepLab KnowledgeDemo BindScope ReactiveScope Quiz WorkedExample BeforeAfter CompareSlider NumberLine CoordinateGrid Button LinkButton InteractiveButton ToggleButton MetricCard DataCard WeatherCard ProfileCard MediaCard QuoteCard AlertCard TimelineCard KpiBoard FeatureGrid Form SlideDeck Slide SectionHeader KeyValueList Stepper ChipGroup Chip Skeleton Avatar Input Textarea Select FileInput NumberInput Switch Slider JsonDebug ImageGallery HtmlFrame ThreeJsFrame HostedCanvasFrame LiveCamera Model3D Video".split(" "));
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
kinds.add("MapWidget");

/** Independent structural guard; no partial HTML or unresolved resource references execute. */
export function isUiStreamTree(tree: unknown, completed = false): boolean {
  let count = 0; const ids = new Set<string>(); const seen = new Set<object>();
  function json(value: unknown, depth = 0): boolean {
    if (depth > 24) return false;
    if (typeof value === "string") return value.length <= 65536;
    if (value === null || typeof value === "boolean") return true;
    if (typeof value === "number") return Number.isFinite(value);
    if (Array.isArray(value)) return value.length <= 2000 && value.every(v => json(v, depth + 1));
    if (record(value)) return Object.entries(value).every(([key, v]) => !["__proto__", "prototype", "constructor", ...(!completed ? ["dataRef", "$ref", "$binding", "html", "sceneScript", "srcDoc", "script", "svg"] : [])].includes(key) && json(v, depth + 1));
    return false;
  }
  function node(value: unknown, depth: number): boolean {
    if (!record(value) || depth > 24 || ++count > 200 || seen.has(value)) return false;
    seen.add(value);
    if (!kinds.has(value.kind) || (!completed && (blocked.has(value.kind) || !previewKinds.has(value.kind))) || !record(value.props)) return false;
    if (value.nodeId !== undefined) {
      if (typeof value.nodeId !== "string" || !value.nodeId.trim() || value.nodeId.length > 128 || ids.has(value.nodeId.trim())) return false;
      ids.add(value.nodeId.trim());
    }
    if (!json(value.props)) return false;
    if (!completed || previewKinds.has(value.kind)) {
      const p=value.props;
      for (const [key,v] of Object.entries(p)) {
        if (v !== null && typeof v === "object" && !["action",...(completed?["dataRef","computation","remoteAction"]:[]),...(value.kind === "Chart" ? ["series","categories"] : []),...(value.kind === "Table" ? ["headers"] : []),...(value.kind === "Select" ? ["options"] : [])].includes(key)) return false;
      }
      if (p.action !== undefined && (!record(p.action) || typeof p.action.type !== "string" || p.action.payload !== undefined && !record(p.action.payload))) return false;
      if(p.dataRef!==undefined&&typeof p.dataRef!=="string"&&!record(p.dataRef)||p.computation!==undefined&&!record(p.computation))return false;
      if (value.kind === "Table" && p.headers !== undefined && (!Array.isArray(p.headers) || !p.headers.every((v:unknown)=>typeof v === "string"))) return false;
      if (value.kind === "Select" && p.options !== undefined && (!Array.isArray(p.options) || !p.options.every((v:unknown)=>typeof v === "string" || record(v) && typeof v.label === "string" && ["string","number"].includes(typeof v.value)))) return false;
      for (const key of ["title","text","label","description","subtitle","placeholder","name","chart"]) {
        if (p[key] !== undefined && p[key] !== null && typeof p[key] !== "string") return false;
      }
      if (value.kind === "Chart") {
        if (p.categories !== undefined && (!Array.isArray(p.categories) || !p.categories.every((v:unknown)=>typeof v === "string"))) return false;
        if (p.series !== undefined && (!Array.isArray(p.series) || !p.series.every((s:unknown)=>record(s) && (s.name === undefined || typeof s.name === "string") && (s.values === undefined || Array.isArray(s.values) && s.values.every((v:unknown)=>typeof v === "number" && Number.isFinite(v)))))) return false;
      }
    }
    return value.children === undefined || (Array.isArray(value.children) && value.children.every(child => node(child, depth + 1)));
  }
  try { return record(tree) && JSON.stringify(tree).length <= 1_048_576 && node(tree.root, 1); } catch { return false; }
}

function validate(raw: unknown, sessionId: string): UiStreamEvent | undefined {
  const parsed = uiStreamEventSchema.safeParse(raw);
  if (!parsed.success || parsed.data.sessionId !== sessionId || !isUiStreamTree(parsed.data.snapshot, parsed.data.status === "completed")) return;
  return parsed.data;
}
export function reduceUiStream(state: UiStreamState | undefined, raw: unknown, sessionId: string): UiStreamState | undefined {
  const event = validate(raw, sessionId); if (!event) return state;
  if (!state) { if (event.sequence !== 1 || event.baseRevision !== 0 || ["cancelled","failed"].includes(event.status)) return state; }
  else {
    if (event.surfaceId !== state.surfaceId || event.messageId !== state.messageId) return state;
    if (event.generationId !== state.generationId) {
      if (event.sequence !== 1 || event.startedAt <= state.startedAt || event.baseRevision !== state.revision) return state;
    } else if (state.status !== "committed" || event.sequence !== state.sequence + 1 || event.baseRevision !== state.revision || event.startedAt !== state.startedAt || event.firstUsefulAt !== state.firstUsefulAt) return state;
    if (event.emittedAt < state.emittedAt) return state;
  }
  return { ...event, tree: state && ["cancelled", "failed"].includes(event.status) ? state.tree : event.snapshot, firstUsefulLatencyMs: event.firstUsefulAt - event.startedAt };
}

export function restoreUiStream(document: unknown, sessionId: string): UiStreamState | undefined {
  if (!record(document) || document.sessionId !== sessionId || !record(document.stream)) return;
  const event = validate({ ...document.stream, snapshot: document.tree }, sessionId);
  if (!event || event.surfaceId !== document.surfaceId || event.revision !== document.revision || document.messageId !== undefined && event.messageId !== document.messageId) return;
  return { ...event, tree: event.snapshot, firstUsefulLatencyMs: event.firstUsefulAt - event.startedAt };
}
