import type {RecoveryStatus} from './interactionRecovery';
export default function RecoveryNotice({status,reload,retry}:{status:RecoveryStatus;reload:()=>void;retry:()=>void}){
  if(['ready','dirty','saving','loading'].includes(status.phase))return null;
  return <div role="status" data-recovery-status={status.phase} className="m-2 rounded border border-[var(--chat-border)] p-3 text-sm">
    <p>{status.message}</p>{status.phase!=='deleted'&&<div className="mt-2 flex flex-wrap gap-3"><button type="button" onClick={reload}>载入服务器状态</button><button type="button" onClick={retry}>保留本页并重试保存</button></div>}
  </div>;
}
