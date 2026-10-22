import { fail, ok, type Cell, type Resource, type Result, type Row } from "./types";
export type Filter={column:string;op:"eq"|"neq"|"contains"|"gt"|"gte"|"lt"|"lte"|"in";value:unknown};
export type Query={filters?:Filter[];sort?:{column:string;direction:"asc"|"desc"};selectedIds?:string[]};
export function selectRows(resource:Resource,query:Query={}):Result<{rows:Row[];rowIds:string[]}>{
  if(!query||typeof query!=="object"||query.filters!==undefined&&!Array.isArray(query.filters)||query.filters&&query.filters.length>20)return fail("QUERY","筛选格式无效");
  let rows=resource.rows.map((row,i)=>({row,id:`${resource.id}@${resource.version}:${i}`}));
  for(const f of query.filters??[]){
    if(!f||!resource.columns.includes(f.column)||!["eq","neq","contains","gt","gte","lt","lte","in"].includes(f.op))return fail("FILTER","不支持的筛选列或运算符");
    const scalar=(v:unknown)=>v===null||typeof v==="string"||typeof v==="boolean"||typeof v==="number"&&Number.isFinite(v);
    if(f.op==="in"?(!Array.isArray(f.value)||f.value.length>1000||!f.value.every(scalar)):!scalar(f.value))return fail("FILTER","筛选值格式无效");
    if(f.op==="contains"&&typeof f.value!=="string")return fail("FILTER","contains 筛选需要文本");
    if(["gt","gte","lt","lte"].includes(f.op)&&!numeric(f.value))return fail("NOT_NUMBER","比较值不是有效数值");
    if(["gt","gte","lt","lte"].includes(f.op)&&rows.some(({row})=>!numeric(row[f.column])))return fail("NOT_NUMBER","比较列包含非数值");
    rows=rows.filter(({row})=>{const v=row[f.column];switch(f.op){
      case "eq":return v===f.value;case "neq":return v!==f.value;case "contains":return typeof f.value==="string"&&String(v??"").includes(f.value);
      case "in":return (f.value as Cell[]).includes(v);case "gt":return Number(v)>Number(f.value);case "gte":return Number(v)>=Number(f.value);case "lt":return Number(v)<Number(f.value);case "lte":return Number(v)<=Number(f.value);
    }});
  }
  if(query.sort){const {column,direction}=query.sort;
    if(!resource.columns.includes(column)||!["asc","desc"].includes(direction))return fail("SORT","不支持的排序列或方向");
    rows.sort((a,b)=>{const x=a.row[column],y=b.row[column];const comparison=typeof x==="number"&&typeof y==="number"?x-y:String(x??"").localeCompare(String(y??""));return direction==="asc"?comparison:-comparison;});
  }
  if(query.selectedIds){if(!Array.isArray(query.selectedIds))return fail("SELECTION","选择格式无效");rows=rows.filter(r=>query.selectedIds!.includes(r.id));}
  return ok({rows:rows.map(r=>r.row),rowIds:rows.map(r=>r.id)});
}
export function numeric(v:unknown):boolean{return typeof v==="number"?Number.isFinite(v):typeof v==="string"&&/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(v.trim())&&Number.isFinite(Number(v));}
export function toCents(value:unknown):Result<number>{
  if(!numeric(value))return fail("NOT_NUMBER","金额不是有效数值");
  const match=String(value).trim().match(/^([+-]?)(\d*)(?:\.(\d*))?$/);if(!match)return fail("NOT_NUMBER","金额格式不支持");
  try {const fraction=(match[3]??"").padEnd(3,"0");let cents=BigInt(match[2]||"0")*100n+BigInt(fraction.slice(0,2));if(fraction[2]>="5")cents++;
    if(match[1]==="-")cents=-cents;if(cents>BigInt(Number.MAX_SAFE_INTEGER)||cents<BigInt(Number.MIN_SAFE_INTEGER))return fail("RANGE","金额超出安全范围");return ok(Number(cents));
  }catch{return fail("RANGE","金额超出安全范围");}
}
export function formatCents(cents:number){const value=BigInt(cents),absolute=value<0n?-value:value;return `${value<0n?"-":""}${absolute/100n}.${String(absolute%100n).padStart(2,"0")}`;}
export function splitMoney(amount:unknown,people:unknown,tipPercent:unknown=0):Result<{tipCents:number;totalCents:number;sharesCents:number[]}>{
  const cents=toCents(amount);if(!cents.ok)return cents;
  if(cents.value<0||!numeric(people)||!Number.isSafeInteger(Number(people))||Number(people)<=0||Number(people)>10000)return fail("SPLIT_INPUT","金额须非负，人数须为 1–10000 的整数");
  if(!numeric(tipPercent)||Number(tipPercent)<0||Number(tipPercent)>100)return fail("TIP_INPUT","小费比例须为 0–100 的数值");
  const rate=String(tipPercent).trim().match(/^\+?(\d*)(?:\.(\d{1,6}))?$/);
  if(!rate)return fail("TIP_INPUT","小费比例最多支持 6 位小数");
  const fraction=rate[2]??"",divisor=10n**BigInt(fraction.length)*100n,numerator=BigInt((rate[1]||"0")+fraction)*BigInt(cents.value);
  const tip=numerator/divisor+(numerator%divisor*2n>=divisor?1n:0n),total=BigInt(cents.value)+tip;
  if(total>BigInt(Number.MAX_SAFE_INTEGER))return fail("RANGE","含小费总额超出安全范围");
  const totalCents=Number(total),n=Number(people),base=Math.floor(totalCents/n),remainder=totalCents%n;
  return ok({tipCents:Number(tip),totalCents,sharesCents:Array.from({length:n},(_,i)=>base+(i<remainder?1:0))});
}
export function aggregateRows(rows:readonly Row[],column:string,op:string,money=false):Result<number>{
  if(!["sum","avg","min","max","count"].includes(op))return fail("AGGREGATE","不支持的聚合运算");
  if(op==="count")return ok(rows.length);
  if(!rows.length)return op==="sum"?ok(0):fail("EMPTY","没有可聚合的数据");
  const values:number[]=[];
  for(const row of rows){const raw=row[column];if(!numeric(raw))return fail("NOT_NUMBER",`${column} 包含非数值`);const v=money?toCents(raw):ok(Number(raw));if(!v.ok)return v;values.push(v.value);}
  if(money){
    let cents=op==="min"?BigInt(Math.min(...values)):op==="max"?BigInt(Math.max(...values)):values.reduce((sum,value)=>sum+BigInt(value),0n);
    if(op==="avg"){
      const sign=cents<0n?-1n:1n,absolute=cents*sign,count=BigInt(values.length);
      cents=sign*(absolute/count+(absolute%count*2n>=count?1n:0n));
    }
    if(cents>BigInt(Number.MAX_SAFE_INTEGER)||cents<BigInt(Number.MIN_SAFE_INTEGER))return fail("RANGE","聚合金额超出安全范围");
    const result=Number(cents)/100,roundtrip=toCents(result);
    return roundtrip.ok&&BigInt(roundtrip.value)===cents?ok(result):fail("PRECISION","聚合金额无法精确表示");
  }
  let result=op==="min"?Math.min(...values):op==="max"?Math.max(...values):values.reduce((a,b)=>a+b,0);
  if(!Number.isFinite(result))return fail("RANGE","聚合结果超出安全范围");
  if(op==="avg")result/=values.length;
  return ok(result);
}
