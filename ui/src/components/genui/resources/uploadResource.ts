import { agentFileApi, type UploadedConversationFile } from "@/services/agentFile";
import { getResource, putResource, resourceSessionEpoch } from "./resourceStore";
import { parseCsvResource } from "./csvResource";
import { fail, safeKey, scopeKey, type Resource, type Result, type Scope } from "./types";
import {persistImportedResource} from './resourcePersistence';
const tickets=new Map<string,symbol>();
const writes=new Map<string,Promise<Result<Resource>>>();
/** Upload and parse the same File; no model URL is fetched or executed. Last chosen file wins. */
export async function importCsvFile(scope:Scope,id:string,file:File,numericColumns:string[]=[],upload:(sessionId:string,file:File)=>Promise<UploadedConversationFile>=agentFileApi.uploadConversationFile):Promise<Result<Resource>>{
  if(!safeKey(scope.sessionId)||!safeKey(scope.surfaceId)||!safeKey(id)||!file.name.toLowerCase().endsWith(".csv")||file.size>2_097_152)return fail("FILE","请选择不超过 2 MiB 的 CSV 文件");
  const key=JSON.stringify([scopeKey(scope),id]);const ticket=Symbol();tickets.set(key,ticket);
  const epoch=resourceSessionEpoch(scope.sessionId);
  try {
    const parsed=parseCsvResource(await file.text(),numericColumns);if(!parsed.ok)return parsed;
    if(!parsed.value.rows.length)return fail("EMPTY","CSV 没有数据行");
    if(epoch!==resourceSessionEpoch(scope.sessionId)||tickets.get(key)!==ticket)return fail("CANCELLED","数据导入已取消");
    const uploaded=await upload(scope.sessionId,file);
    if(epoch!==resourceSessionEpoch(scope.sessionId)||tickets.get(key)!==ticket)return fail("CANCELLED","数据导入已取消");
    const resourceKey=uploaded.resourceKey||uploaded.url;
    if(!resourceKey)return fail("UPLOAD","上传未返回文件资源引用");
    // An already-sent PUT may commit even after another file is selected. Serialize
    // per resource and reconcile that committed version before the newer PUT.
    const previous=writes.get(key)??Promise.resolve();
    const task=previous.catch(()=>{}).then(async():Promise<Result<Resource>>=>{
      if(epoch!==resourceSessionEpoch(scope.sessionId)||tickets.get(key)!==ticket)return fail("CANCELLED","数据导入已取消");
      const {resource,committed}=await persistImportedResource(scope,{id,version:(getResource(scope,id)?.version??0)+1,source:{type:"upload",name:file.name,resourceKey},collectedAt:new Date().toISOString(),...parsed.value});
      if(epoch!==resourceSessionEpoch(scope.sessionId))return fail("CANCELLED","数据导入已取消");
      const registered=putResource(scope,resource,committed);
      return tickets.get(key)===ticket?registered:fail("CANCELLED","新文件已取代当前导入；已提交版本已同步");
    });writes.set(key,task);
    try{return await task}finally{if(writes.get(key)===task)writes.delete(key)}
  }catch{return fail("UPLOAD","数据上传或版本保存失败，请同步界面后重试；上一版数据已保留");}
  finally{if(tickets.get(key)===ticket)tickets.delete(key);}
}
