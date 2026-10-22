import {afterEach,expect,it,vi} from 'vitest';
import {createInteractionRecovery,type RecoveryStatus} from './interactionRecovery';
import {RecoveryHttpError} from '@/services/uiRecovery';
import {clearResourceSession} from './resources/resourceStore';
const scope={sessionId:'recovery-test',surfaceId:'surface'};
const document=(version=1,state:any={nodes:{month:'Jan'}})=>({...scope,revision:1,interaction:{stateRevision:version,baseRevision:1,state}});
function fixture(api:any){let local:any={nodes:{month:'local'}};const statuses:RecoveryStatus[]=[];const apply=vi.fn((state:any)=>{local=state});const c=createInteractionRecovery(scope,{revision:()=>1,read:()=>local,apply},s=>statuses.push(s),api);return {c,apply,statuses,get status(){return statuses[statuses.length-1]},get local(){return local},edit(value:any){local={nodes:{month:value}};c.changed()}}}
afterEach(()=>{vi.useRealTimers();clearResourceSession(scope.sessionId)});
it('hydrates filters then saves separate state revision without executing any actions',async()=>{
  vi.useFakeTimers();const api={read:vi.fn(async()=>document(3)),write:vi.fn(async()=>({stateRevision:4})),resource:vi.fn()};const f=fixture(api);
  await f.c.start();expect(f.local.nodes.month).toBe('Jan');f.edit('Feb');await vi.advanceTimersByTimeAsync(400);
  expect(api.write).toHaveBeenCalledWith(scope,3,1,{nodes:{month:'Feb'}},expect.any(AbortSignal));expect(f.status?.phase).toBe('ready');f.c.stop();
});
it('does not let a late initial snapshot overwrite edits; conflicting tabs require an explicit decision',async()=>{
  vi.useFakeTimers();let complete!:(value:any)=>void;const api={read:vi.fn().mockImplementationOnce(()=>new Promise(resolve=>complete=resolve)).mockResolvedValue(document(4)),write:vi.fn(async()=>({stateRevision:5})),resource:vi.fn()};const f=fixture(api);
  const load=f.c.start();f.edit('Feb');complete(document(3));await load;expect(f.local.nodes.month).toBe('Feb');expect(f.status?.phase).toBe('conflict');
  await vi.advanceTimersByTimeAsync(500);expect(api.write).not.toHaveBeenCalled();await f.c.retry();await vi.advanceTimersByTimeAsync(400);expect(api.write).toHaveBeenCalledWith(scope,4,1,{nodes:{month:'Feb'}},expect.any(AbortSignal));f.c.stop();
});
it('stops automatic writes after a CAS conflict and reload discards local edits explicitly',async()=>{
  vi.useFakeTimers();const api={read:vi.fn().mockResolvedValueOnce(document(1)).mockResolvedValue(document(2,{nodes:{month:'remote'}})),write:vi.fn().mockRejectedValue(new RecoveryHttpError(409)),resource:vi.fn()};const f=fixture(api);
  await f.c.start();f.edit('Feb');await vi.advanceTimersByTimeAsync(400);f.edit('Mar');await vi.advanceTimersByTimeAsync(400);expect(api.write).toHaveBeenCalledTimes(1);expect(f.local.nodes.month).toBe('Mar');
  await f.c.reload();expect(f.local.nodes.month).toBe('remote');expect(f.status?.phase).toBe('ready');f.c.stop();
});
it('ignores responses after session cleanup and never executes tools on restore',async()=>{
  let complete!:(value:any)=>void;const api={read:vi.fn(()=>new Promise(resolve=>complete=resolve)),write:vi.fn(),resource:vi.fn()};const f=fixture(api);const p=f.c.start();clearResourceSession(scope.sessionId);complete(document());await p;expect(f.apply).not.toHaveBeenCalled();expect(api.write).not.toHaveBeenCalled();f.c.stop();
});
it('shows unavailable resource data and malformed identity instead of silently restoring it',async()=>{
  const invalid={...document(),resources:[{id:'sales',version:1,columns:['month'],rows:[{month:NaN}],source:{type:'inline',name:'bad'},collectedAt:'2026-10-21T00:00:00Z'}]};
  const api={read:vi.fn(async()=>invalid),write:vi.fn(),resource:vi.fn()};const f=fixture(api);await f.c.start();expect(f.status?.phase).toBe('error');f.c.stop();
  const other=fixture({...api,read:vi.fn(async()=>({...document(),sessionId:'foreign'}))});await other.c.start();expect(other.status?.phase).toBe('error');other.c.stop();
});
it('a deleted surface stops future writes',async()=>{
  const api={read:vi.fn().mockRejectedValue(new RecoveryHttpError(404)),write:vi.fn(),resource:vi.fn()};const f=fixture(api);await f.c.start();f.edit('Feb');expect(f.status?.phase).toBe('deleted');expect(api.write).not.toHaveBeenCalled();f.c.stop();
});
