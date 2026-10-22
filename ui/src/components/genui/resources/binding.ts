import { getResource } from "./resourceStore";
import { aggregateRows,selectRows,type Filter,type Query } from "./selectors";
import { fail,ok,safeKey,type Resource,type Result,type Row,type Scope } from "./types";
import { readLocalInput } from "../bindProps";
export type BoundResource={resource:Resource;rows:Row[];rowIds:string[];props:Record<string,any>;selectionNodeId?:string;selectedIds:string[];groupRowIds:string[][]};
export function resolveResourceBinding(scope:Scope,props:Record<string,any>,kind:string,read:(id:string)=>unknown):Result<BoundResource>{
  const raw=props.dataRef;const ref=typeof raw==="string"?{id:raw}:raw;
  if(!ref||typeof ref!=="object"||Array.isArray(ref)||typeof ref.id!=="string"||ref.version!==undefined&&(!Number.isSafeInteger(ref.version)||ref.version<1))return fail("DATA_REF","数据引用无效");
  const resource=getResource(scope,ref.id,ref.version);if(!resource)return fail("MISSING_RESOURCE","请先导入数据；指定资源版本尚不可用");
  if(ref.filters!==undefined&&(!Array.isArray(ref.filters)||ref.filters.length>20))return fail("FILTER","筛选声明无效");
  const filters:Filter[]=[];
  for(const filter of ref.filters??[]){
    if(!filter||typeof filter!=="object")return fail("FILTER","筛选声明无效");
    if(!resource.columns.includes(filter.column)||!["eq","neq","contains","gt","gte","lt","lte","in"].includes(filter.op))return fail("FILTER","不支持的筛选列或运算符");
    if(filter.value&&typeof filter.value==="object"&&"fromNode" in filter.value&&!safeKey(filter.value.fromNode))return fail("FILTER","筛选状态引用无效");
    const value=readLocalInput(filter.value,read);
    if(filter.value&&typeof filter.value==="object"&&"fromNode" in filter.value&&(value===undefined||value===""))continue;
    filters.push({...filter,value});
  }
  let sort=ref.sort;
  if(sort&&typeof sort==="object"&&"fromNode" in sort){
    const v=readLocalInput(sort,read);
    if(v===undefined||v==="")sort=undefined;
    else if(typeof v!=="string"||v.split(":").length!==2)return fail("SORT","排序状态无效");
    else{const [column,direction]=v.split(":");sort={column,direction};}
  }
  const selectionNodeId=typeof ref.selectionNodeId==="string"?ref.selectionNodeId:undefined;
  const selectedValue=selectionNodeId?read(selectionNodeId):[];
  const selectedIds=Array.isArray(selectedValue)?selectedValue.filter((v):v is string=>typeof v==="string"):[];
  const selected=selectRows(resource,{filters,sort,...(ref.selectedOnly?{selectedIds}:{} )} as Query);if(!selected.ok)return selected;
  const {rows,rowIds}=selected.value;const next={...props};let groupRowIds:string[][]=[];
  if(kind==="Stat"){
    if(!resource.columns.includes(ref.column)&&ref.aggregate!=="count")return fail("COLUMN","聚合列不存在");
    const metric=aggregateRows(rows,ref.column,ref.aggregate??"sum",ref.money===true);if(!metric.ok)return metric;next.value=metric.value;
  }
  if(kind==="Chart"){
    if(!resource.columns.includes(ref.groupBy)||!resource.columns.includes(ref.column))return fail("COLUMN","图表分组或数值列不存在");
    const groups=new Map<string,{rows:Row[];ids:string[]}>();
    rows.forEach((row,i)=>{const label=String(row[ref.groupBy]??"");const group=groups.get(label)??{rows:[],ids:[]};group.rows.push(row);group.ids.push(rowIds[i]);groups.set(label,group);});
    const values:number[]=[];
    for(const group of groups.values()){const aggregate=aggregateRows(group.rows,ref.column,ref.aggregate??"sum",ref.money===true);if(!aggregate.ok)return aggregate;values.push(aggregate.value);}
    next.categories=[...groups.keys()];next.series=[{name:props.seriesName??ref.column,values}];groupRowIds=[...groups.values()].map(g=>g.ids);
  }
  return ok({resource,rows,rowIds,props:next,selectionNodeId,selectedIds,groupRowIds});
}
