import {recoveryApi,RecoveryHttpError} from '@/services/uiRecovery';
import {resourceSessionEpoch,getResource,putResource} from './resources/resourceStore';
import {registerResourcePersistence} from './resources/resourcePersistence';
import type {Scope} from './resources/types';
export type RecoveryAdapter={revision:()=>number;read:()=>Record<string,unknown>;apply:(state:Record<string,unknown>,document:any)=>void;document?:(document:any)=>void;deleted?:()=>void};
export type RecoveryStatus={phase:'loading'|'ready'|'dirty'|'saving'|'conflict'|'error'|'deleted';message:string};
/** Snapshot reads never execute tools. A CAS conflict stops writes until an explicit user decision. */
export function createInteractionRecovery(scope:Scope,adapter:RecoveryAdapter,notify:(status:RecoveryStatus)=>void,api=recoveryApi){
  const epoch=resourceSessionEpoch(scope.sessionId),abort=new AbortController();let alive=true,loaded=false,version=0,dirty=0,inFlight=false,loading=false;
  let observed=JSON.stringify(adapter.read()),timer:ReturnType<typeof setTimeout>|undefined;
  let phase:RecoveryStatus['phase']='loading';
  const valid=()=>alive&&!abort.signal.aborted&&epoch===resourceSessionEpoch(scope.sessionId);
  const status=(value:RecoveryStatus['phase'],message='')=>{phase=value;if(valid())notify({phase:value,message})};
  const fail=(error:unknown)=>{if(!valid())return;if(error instanceof RecoveryHttpError&&error.status===404){status('deleted','会话或界面已删除，已停止保存');stop();adapter.deleted?.();return}status(error instanceof RecoveryHttpError&&error.status===409?'conflict':'error',error instanceof Error?error.message:'恢复同步失败')};
  const schedule=()=>{if(timer)clearTimeout(timer);if(valid()&&loaded&&dirty&&!inFlight&&!['conflict','error','deleted'].includes(phase))timer=setTimeout(()=>void save(),350)};
  const resources=(doc:any)=>{
    const list=[...(Array.isArray(doc.resourceHistory)?doc.resourceHistory:[]),...(Array.isArray(doc.resources)?doc.resources:[])].sort((a,b)=>a.version-b.version);
    for(const resource of list){const old=getResource(scope,resource.id,resource.version);if(old)continue;const result=putResource(scope,resource,true);if(!result.ok&&result.error.code!=='STALE_VERSION')throw Error('资源恢复失败：'+result.error.message)}
  };
  async function load(discard=false,rebase=false){
    if(!valid()||loading||inFlight)return;loading=true;const atStart=dirty;
    try{const doc=await api.read(scope,abort.signal);if(!valid())return;
      if(doc?.sessionId!==scope.sessionId||doc?.surfaceId!==scope.surfaceId||!Number.isSafeInteger(doc.revision))throw Error('恢复快照身份或版本无效');
      if(doc.revision<adapter.revision())return;
      const remote=doc.interaction,remoteVersion=remote?.stateRevision??0;
      if(!Number.isSafeInteger(remoteVersion)||remoteVersion<0)throw Error('交互状态版本无效');if(remoteVersion<version)return;
      adapter.document?.(doc);resources(doc);
      const changed=dirty!==atStart;
      if(!rebase&&(!discard||changed)&&dirty&&remoteVersion>version){loaded=true;status('conflict','其他标签页已更新；本页操作已保留，请选择恢复方式');return}
      if(!rebase&&!changed&&(discard||!dirty)&&(!loaded||discard||remoteVersion>version)){adapter.apply(remote?.state??{},doc);dirty=0;observed=JSON.stringify(adapter.read())}
      version=remoteVersion;loaded=true;
      status(dirty?'dirty':'ready');schedule();
    }catch(error){fail(error)}finally{loading=false}
  }
  async function save(){
    if(!valid()||!loaded||!dirty||inFlight||['conflict','error','deleted'].includes(phase))return;
    const ticket=dirty,state=adapter.read();inFlight=true;status('saving');
    try{const result=await api.write(scope,version,adapter.revision(),state,abort.signal);if(!valid())return;
      if(!Number.isSafeInteger(result?.stateRevision)||result.stateRevision!==version+1)throw Error('恢复状态响应版本无效');
      version=result.stateRevision;if(dirty===ticket)dirty=0;status(dirty?'dirty':'ready');
    }catch(error){fail(error)}finally{inFlight=false;schedule()}
  }
  const unregister=registerResourcePersistence(scope,async resource=>{
    if(!valid()||!loaded||['conflict','deleted'].includes(phase))throw Error('请先同步界面恢复状态再导入数据');
    try{return await api.resource(scope,resource,abort.signal)}catch(error){fail(error);throw error}
  });
  function stop(){alive=false;abort.abort();if(timer)clearTimeout(timer);unregister()}
  return {
    start:()=>load(),poll:()=>load(),stop,
    changed:()=>{if(!valid())return;const next=JSON.stringify(adapter.read());if(next===observed)return;observed=next;dirty++;if(!['conflict','error'].includes(phase))status('dirty');schedule()},
    reload:()=>load(true),retry:async()=>{await load(false,true);schedule()},
  };
}
