package org.wwz.ai.domain.agent.runtime.tool.common.canvas;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 按需返回高频 GenUI 子集的协议与布局指南。
 *
 * 该类维护的是给模型阅读的稳定提示数据，而不是运行时组件注册表；组件能力的
 * 真正校验仍由 list_ui_components 和 emit_ui_tree/patch 的执行链负责。
 */
public final class GenUiGuidePayload {

    private GenUiGuidePayload() {
    }

    public static Map<String, Object> payload() {
        Map<String, Object> guide = new LinkedHashMap<>();
        // 按 wire format、调用顺序、路由和视觉约束组织，减少模型在不同阶段混用字段。
        guide.put("purpose",
                "Ship polished, scannable gen UI with clear hierarchy — not noisy decoration.");
        guide.put("wire_format_and_syntax", List.of(
                "Envelope: {\"schemaVersion\":\"1\",\"root\":{...}} or bare root {kind,props,children}.",
                "Node keys: kind, optional props, optional children, optional nodeId.",
                "All component fields live under props. children holds only nested nodes.",
                "kind must match list_ui_components exactly (PascalCase).",
                "emit_ui_tree args: {tree, optional canvas_id}. Prefer tree as nested JSON object.",
                "emit_ui_patch: {patches:[{op,path,value?}], optional seq, canvas_id}. Paths are RFC6901 into the tree.",
                "Interactive (in-UI first): props.action = {type, payload}. Types: patch_ui|set_state|submit_form|remote_action|open_url|navigate|send_message.",
                "Default: keep interaction inside GenUI. Prefer patch_ui for local UI updates (tabs, toggles, counters, visibility).",
                "patch_ui payload: {patches:[{op,path,value?}]} — applied client-side on the current tree; no chat turn.",
                "submit_form: wrap fields in Form; each field needs props.name; values stay in-UI (not sent as chat).",
                "send_message payload: {content:string} — ONLY when the Agent must reply; injects a normal user chat turn.",
                "Bare actionId string alone does NOT send chat; use explicit type send_message when needed."
        ));
        guide.put("workflow_order", List.of(
                "1. Confirm GenUI is appropriate (charts, KPI, multi-card, dashboards — not plain Q&A).",
                "2. Call list_ui_components for exact kinds/props.",
                "3. Build a minimal valid tree using wire_format_and_syntax.",
                "4. emit_ui_tree; use emit_ui_patch for small server-side follow-ups (re-renders the same final GenUI).",
                "5. For clickable controls, set Button props.action to patch_ui (local) or send_message (needs Agent).",
                "6. NEVER use canvas_publish for a simple pie/bar/line chart — Chart kind renders interactive ECharts."
        ));
        guide.put("local_resources_and_computation",List.of(
                "Use stable nodeId on every interactive field. State is isolated by sessionId/surfaceId/nodeId; no Agent run is started for local filters/sort/selection/calculation.",
                "FileInput props {resourceId:'sales',numericColumns:['quantity','unit_price','revenue'],label:'Import CSV'} opens a real CSV upload. Success registers immutable {id,version,source,collectedAt,columns,rows}; upload failure preserves previous data. Old FileInput without resourceId remains a path field.",
                "Chart/Table/Stat props.dataRef: {id:'sales',optional version,filters:[{column:'month',op:'eq',value:{fromNode:'month-filter'}}],sort:{fromNode:'sort-control'},column:'revenue',groupBy:'product',aggregate:'sum',money:true,selectionNodeId:'sales-selection'}. Select options can be strings or {label,value}; sort-control values are column:asc or column:desc. Empty filter state means all rows.",
                "Allowed filters: eq/neq/contains/gt/gte/lt/lte/in. Aggregates: sum/avg/min/max/count. Table lists the same filtered version as Chart; row selection and chart clicks share selectionNodeId. A Stat with selectedOnly:true aggregates only selected rows. Missing resources/invalid queries show an error, never fabricated totals.",
                "Stat props.computation {op:'split',amount:{fromNode:'amount'},people:{fromNode:'people'},optional tipPercent:{fromNode:'tip'},optional result:'shares'|'tip'|'total'} splits money in integer cents and distributes remainder. Tip is 0–100 percent (up to 6 decimal places), rounded half up to cents before splitting. Negative amount, zero/noninteger people and nonnumbers are explicit errors.",
                "Stat props.computation {op:'expression',expression:'a / b',inputs:{a:{fromNode:'a'},b:{fromNode:'b'}}} uses the existing safe math parser; no JavaScript or eval.",
                "Button props.action {type:'set_state',payload:{nodeId:'month-filter',value:''}} resets a local filter. Inline Chart series/categories and Table children remain supported. Resources/state are ephemeral and cleared on session exit; do not promise cross-reload persistence."
        ));
        guide.put("remote_actions",List.of(
                "Remote execution requires a persisted Surface revision, a stable component nodeId, and props.remoteAction:{id:'analyze',capability:'sales_analysis',sourceFile:'sales.csv',targetId:'results'}. The target is a Card on the same Surface. Never supply tool names, permissions, URLs or targetPath in action payloads.",
                "Button props.action:{type:'remote_action',payload:{actionId:'analyze'}} submits current form values. Alternatively put remoteAction on Form; its submit button uses Form nodeId. Supported sales_analysis payload: optional month in YYYY-MM format; do not include unrelated form fields.",
                "sales_analysis reads the real uploaded sourceFile from the current session, requires explicit approval, computes decimal totals and publishes Chart/Table/Stat resources into targetId. Only registered capabilities are executable. Approval expires after five minutes; rejection, errors and cancellation are visible execution states.",
                "The client creates idempotency keys, queries durable execution records after reconnect/timeout, and updates the original Surface. A cancel request during an external write does not prove rollback. Explicit 'Continue with Agent' starts a normal chat turn with the persisted result summary; restoring a record never starts another Agent run."
        ));
        guide.put("intelligent_maps",List.of(
                "For place search and routes use search_places, geocode_places, plan_route and modify_itinerary. They use actual AMap data and publish MapWidget using the existing Surface/SSE protocol. Do not manually draw a route in HTML or fabricate mapData, coordinates, distance or duration.",
                "Search with the user's explicit city/context. If ambiguous, show candidates or ask. Pass 2–10 stable provider placeIds in explicit order to plan_route, title and travelMode walking|driving. Do not infer current location or automatically reorder user's stops. Service availability and permissions are checked by the provider.",
                "plan_route publishes a stable MapWidget Surface. Before modifying, call get_map with surfaceId/nodeId to read current baseRevision and ordered placeIds; UI actions can supersede versions in old chat messages. Then use modify_itinerary to change the same map. The UI supports local selection, viewport/theme/fullscreen, and authenticated remote itinerary edits. Keep old valid route on errors; never claim a missing API permission was a successful plan.",
                "GCJ-02 coordinates are provider-native [longitude,latitude], not WGS-84 GeoJSON. No default city or hardcoded route exists. Photos/ratings are optional and never invented."
        ));
        guide.put("canvas_routing", List.of(
                "Places / itinerary / walking or driving road routes → search_places then plan_route (MapWidget).",
                "Prose / Q&A / bullets → markdown (no tools).",
                "Charts / KPI / dashboards / multi-card / data grids → emit_ui_tree.",
                "Teaching / formula demos with drag sliders (Pythagoras, circle, functions) → ParametricLab or PythagorasLab (NOT a static chart).",
                "Concept / knowledge animation (playable steps, flow, layering, formula transform) → ConceptDemo or AnimStepLab.",
                "Structured 3D (geometry/color/particles) → emit_ui_tree ThreeJsFrame.",
                "Existing glb/gltf URL → emit_ui_tree Model3D (src required).",
                "Custom Three.js scene or complex 3D assembly → emit_ui_tree ThreeJsFrame with props.sceneScript. The script is a JavaScript body executed in an isolated sandbox iframe; window.THREE, window.OrbitControls, window.GLTFLoader, window.container, window.canvas, window.onResize and window.frameOptions are available.",
                "Free-form WebGL HTML → canvas_publish (window.THREE preloaded on bare pages).",
                "Hosted webpage / landing / printable HTML report / page-scale layout -> canvas_publish after workspace_write.",
                "If markdown is enough, stay in markdown; offer GenUI only when visual layout earns it."
        ));
        guide.put("teaching_labs", List.of(
                "ParametricLab: client-side interactive lab. User drags sliders; formulas + scene update live (no send_message).",
                "scene: right_triangle | circle | rectangle | linear | quadratic | unit_circle | custom_svg | none.",
                "params: [{id,label,value,min,max,step,unit}]. outputs: [{id,label,expr,format}] with expr like sqrt(a*a+b*b).",
                "Expr allows + - * / ^ ( ) and sqrt,abs,sin,cos,tan,min,max,pow,log,ln,exp,hypot,pi,e.",
                "PythagorasLab: shortcut for 勾股定理 — defaults a,b sliders + c=sqrt(a²+b²) + live triangle.",
                "Example tree root: {kind:'PythagorasLab', props:{title:'勾股定理'}}.",
                "custom_svg: set scene:'custom_svg' and svg:'<svg>...</svg>' with {{a}} placeholders for live numbers."
        ));
        guide.put("concept_animation", List.of(
                "ConceptDemo / AnimStepLab / KnowledgeDemo: narrative animation with play/pause/prev/next/scrub (no chat).",
                "scene: flow | stack | tree | formula | compare | sequence. Omit steps to use built-in demo for that scene.",
                "steps: [{title, caption, duration(ms), highlight:[nodeOrEdgeId], badge}]. highlight drives emphasis + packet motion on edges.",
                "flow/sequence: provide nodes+edges. stack: nodes as layers. tree: nodes+edges. formula: formulas string[]. compare: left/right string[].",
                "Example: {kind:'ConceptDemo', props:{title:'HTTP 请求路径', scene:'flow'}}.",
                "Example formula: {kind:'ConceptDemo', props:{scene:'formula', title:'勾股恒等式', formulas:['a²+b²','→','c²'], steps:[{title:'平方和',caption:'…',highlight:['f0']},…]}}.",
                "Use ConceptDemo when the user should WATCH a concept unfold; use ParametricLab when they should DRAG parameters."
        ));
        guide.put("bind_and_practice", List.of(
                "BindScope: params sliders + children props with {{expr}} or $id update live (no send_message).",
                "Example: {kind:'BindScope', props:{params:[{id:'a',value:3,min:1,max:10}]}, children:[{kind:'NumberLine', props:{value:'{{a}}',min:-10,max:10}}]}.",
                "outputs: [{id:'c', expr:'sqrt(a*a+b*b)'}] adds derived ids usable in {{c}}.",
                "Quiz after a demo: {kind:'Quiz', props:{prompt:'c 等于？', options:['3','4','5'], answer:'c'}} (option id defaults a/b/c).",
                "WorkedExample: reveal steps then final answer. BeforeAfter: drag compare two images/texts.",
                "NumberLine / CoordinateGrid: standalone or inside BindScope. ParametricLab scene=number_line|coordinate also works."
        ));
        guide.put("three_js_script", List.of(
                "sceneScript is a JavaScript body, not an HTML document and not a <script> wrapper.",
                "The isolated iframe exposes window.THREE, window.OrbitControls, window.GLTFLoader, window.container, window.canvas, window.onResize, window.frameOptions and window.importThreeAddon.",
                "Create the renderer with new THREE.WebGLRenderer({canvas, antialias:true}) or append renderer.domElement to container; the script owns the scene, camera, lights and animation loop.",
                "Register onResize(() => ...) to update renderer size and camera aspect when the chat panel changes width.",
                "Use new GLTFLoader().load(url, ...) for glb/gltf models. Model and texture URLs must be browser-reachable and allow CORS from the sandbox; prefer GLB with embedded textures.",
                "For additional Three.js addons, use importThreeAddon('loaders/OBJLoader.js') or another path under three/addons/."
        ));
        guide.put("layout_structure", List.of(
                "Use domain components such as Card, FeatureGrid, KpiBoard, Table and Chart to structure visual output.",
                "Keep nesting shallow (≤3–4 levels) and prefer a small number of meaningful components.",
                "Use the normal assistant message for prose, headings, Markdown and feedback text."
        ));
        guide.put("anti_patterns", List.of(
                "Invalid kind / snake_case kinds.",
                "Props beside kind instead of under props.",
                "Do not put HTML markup in ThreeJsFrame.sceneScript; use HtmlFrame or canvas_publish for HTML documents.",
                "Emoji on every line.",
                "Flat 10+ peer nodes without a domain container such as Card."
        ));
        guide.put("subset_note",
                "Research currently validates a high-frequency kind subset only. "
                        + "Call list_ui_components; unsupported kinds will fail validation.");
        return guide;
    }
}
