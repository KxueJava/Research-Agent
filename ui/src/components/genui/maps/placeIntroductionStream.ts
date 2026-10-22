export type IntroductionState={generationId:string;placeId:string;mapRevision:number;nextSequence:number;text:string;status:"waiting"|"streaming"|"completed"|"failed"|"cancelled";cached:boolean;error?:string};
export function createIntroductionStream(generationId:string,placeId:string,mapRevision:number):IntroductionState{return {generationId,placeId,mapRevision,nextSequence:0,text:"",status:"waiting",cached:false};}
const frameSchema=z.object({generationId:z.string().max(128),placeId:z.string().max(128),mapRevision:z.number().int().positive(),sequence:z.number().int().nonnegative(),type:z.enum(["start","delta","complete","error"]),text:z.string().max(5000),cached:z.boolean()});
export function applyIntroductionEvent(state:IntroductionState,raw:unknown):IntroductionState{
  if(["completed","failed","cancelled"].includes(state.status))return state;
  const parsed=frameSchema.safeParse(raw);
  if(!parsed.success)return {...state,status:"failed",error:"简介数据格式无效，请重试"};
  const e=parsed.data;
  if(e.generationId!==state.generationId||e.placeId!==state.placeId||e.mapRevision!==state.mapRevision||e.sequence<state.nextSequence)return state;
  if(e.sequence!==state.nextSequence||(e.sequence===0&&e.type!=="start")||(e.type==="start"&&e.sequence!==0))return {...state,status:"failed",error:"简介数据流不完整，请重试"};
  const next={...state,nextSequence:state.nextSequence+1,cached:e.cached};
  if(e.type==="error")return {...next,status:"failed",error:e.text||"AI 简介生成失败，请重试"};
  if(e.type==="complete")return state.text.trim()?{...next,status:"completed"}:{...next,status:"failed",error:"AI 未返回简介内容，请重试"};
  if(state.text.length+e.text.length>5000)return {...next,status:"failed",error:"简介内容过长，已停止接收"};
  return {...next,status:"streaming",text:state.text+(e.type==="delta"?e.text:"")};
}
import {z} from "zod";
