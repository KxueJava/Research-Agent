import {getAccessToken} from '@/utils/authToken';
import {refreshAccessToken} from '@/utils/request';
import {getDeviceId} from './agentConversation';
import {resolveServiceBaseUrl} from '@/utils/origin';
import type {Scope,Resource} from '@/components/genui/resources/types';
export class RecoveryHttpError extends Error{constructor(public status:number){super(status===409?'另一标签页或界面版本已更新':status===404?'会话或界面已删除':'恢复数据暂时无法同步')}}
async function call(scope:Scope,path:string,signal?:AbortSignal,body?:unknown){
  const base=resolveServiceBaseUrl(typeof SERVICE_BASE_URL==='string'?SERVICE_BASE_URL:'');
  const url=`${base}/api/agent/conversation/sessions/${encodeURIComponent(scope.sessionId)}/surfaces/${encodeURIComponent(scope.surfaceId)}${path}`;
  const read=(token:string|null)=>fetch(url,{method:body===undefined?'GET':'PUT',signal,credentials:'include',headers:{'X-Device-Id':getDeviceId(),...(token?{Authorization:`Bearer ${token}`} :{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});
  let response=await read(getAccessToken());if(response.status===401&&!signal?.aborted){const token=await refreshAccessToken();if(token&&!signal?.aborted)response=await read(token)}
  if(!response.ok)throw new RecoveryHttpError(response.status);return response.json();
}
export const recoveryApi={
  read:(scope:Scope,signal?:AbortSignal)=>call(scope,'',signal),
  write:(scope:Scope,stateRevision:number,baseRevision:number,state:Record<string,unknown>,signal?:AbortSignal)=>call(scope,'/interaction',signal,{stateRevision,baseRevision,state}),
  resource:(scope:Scope,resource:Resource,signal?:AbortSignal)=>call(scope,'/resources',signal,{baseVersion:resource.version-1,resource})
};
