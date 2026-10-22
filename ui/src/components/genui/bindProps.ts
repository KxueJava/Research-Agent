import { evalLabExpr, interpolateTemplate, normalizeParams } from "./parametricMath";
import { splitMoney,formatCents,numeric } from "./resources/selectors";
import { fail,ok,safeKey,type Result } from "./resources/types";

const SKIP_KEYS = new Set([
  "bind",
  "name",
  "action",
  "params",
  "state",
  "outputs",
  "options",
  "steps",
  "children",
  "dataRef", "computation", "resourceId", "numericColumns",
]);

export function readLocalInput(value:unknown,read:(nodeId:string)=>unknown):unknown {
  if(value&&typeof value==="object"&&!Array.isArray(value)&&Object.prototype.hasOwnProperty.call(value,"fromNode")){
    const id=(value as Record<string,unknown>).fromNode;return safeKey(id)?read(id):undefined;
  }
  return value;
}
export function computeBoundValue(raw:unknown,read:(nodeId:string)=>unknown):Result<string|number>{
  if(!raw||typeof raw!=="object"||Array.isArray(raw))return fail("COMPUTATION","计算声明无效");
  const spec=raw as Record<string,any>;
  if(spec.op==="split"){
    const split=splitMoney(readLocalInput(spec.amount,read),readLocalInput(spec.people,read),spec.tipPercent===undefined?0:readLocalInput(spec.tipPercent,read));
    if(!split.ok)return split;
    if(spec.result===undefined||spec.result==="shares")return ok(split.value.sharesCents.map(formatCents).join(" / "));
    if(spec.result==="tip")return ok(formatCents(split.value.tipCents));
    if(spec.result==="total")return ok(formatCents(split.value.totalCents));
    return fail("COMPUTATION","不支持的分账结果字段");
  }
  if(spec.op==="expression"&&typeof spec.expression==="string"&&spec.expression.length<=1000){
    const inputs=spec.inputs??{};
    if(!inputs||typeof inputs!=="object"||Array.isArray(inputs)||Object.keys(inputs).length>20)return fail("COMPUTATION","计算输入无效");
    const values:Record<string,number>=Object.create(null);
    for(const [key,value] of Object.entries(inputs)){
      const resolved=readLocalInput(value,read);
      if(!safeKey(key)||!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)||!numeric(resolved))return fail("NOT_NUMBER","计算输入缺失或不是有效数值");
      values[key]=Number(resolved);
    }
    const result=evalLabExpr(spec.expression,values);
    return Number.isFinite(result)?ok(result):fail("EXPRESSION","表达式无效或结果不是有限数值");
  }
  return fail("COMPUTATION","不支持的计算运算");
}

const TOKEN = /^\{\{\s*([\s\S]+?)\s*\}\}$/;
const DOLLAR = /^\$([a-zA-Z_][a-zA-Z0-9_]*)$/;

export function evalBoundToken(
  expr: string,
  scope: Record<string, number>
): number | string {
  const n = evalLabExpr(expr, scope);
  if (Number.isFinite(n)) return n;
  return interpolateTemplate(expr, scope, {});
}

export function resolveBoundValue(
  value: unknown,
  scope: Record<string, number>
): unknown {
  if (typeof value === "string") {
    const trimmed = value.trim();
    const m = trimmed.match(TOKEN);
    if (m) return evalBoundToken(m[1], scope);
    const d = trimmed.match(DOLLAR);
    if (d) {
      const n = scope[d[1]];
      return Number.isFinite(n) ? n : value;
    }
    if (/\{\{|\$[a-zA-Z_]/.test(value)) {
      return interpolateTemplate(value, scope, {});
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveBoundValue(item, scope));
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (SKIP_KEYS.has(k)) {
        next[k] = v;
      } else if (k === "values" || k === "expr") {
        next[k] = resolveBoundValue(v, scope);
      } else {
        next[k] = resolveBoundValue(v, scope);
      }
    }
    return next;
  }
  return value;
}

export function resolveBoundProps(
  props: Record<string, unknown> | undefined,
  scope: Record<string, number>
): Record<string, any> {
  if (!props) return {};
  const next: Record<string, any> = {};
  for (const [k, v] of Object.entries(props)) {
    next[k] = SKIP_KEYS.has(k) ? v : resolveBoundValue(v, scope);
  }
  return next;
}

export function derivedScope(
  params: ReturnType<typeof normalizeParams>,
  values: Record<string, number>,
  outputs: unknown
): Record<string, number> {
  const scope: Record<string, number> = {};
  for (const p of params) {
    const v = values[p.id];
    scope[p.id] = Number.isFinite(v) ? v : (p.value ?? p.min ?? 0);
  }
  if (Array.isArray(outputs)) {
    for (const item of outputs) {
      if (!item || typeof item !== "object") continue;
      const o = item as Record<string, unknown>;
      const id = String(o.id || "").trim();
      const expr = String(o.expr || o.formula || "");
      if (!id || !expr) continue;
      const n = evalLabExpr(expr, scope);
      if (Number.isFinite(n)) scope[id] = n;
    }
  }
  return scope;
}
