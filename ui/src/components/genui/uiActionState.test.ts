import {beforeEach,expect,it} from "vitest";
import {clearUiActionSession,hasUncertainUiAction,markUncertainUiAction,receiveUiAction,surfaceUiActions,uiActionSessionEpoch} from "./uiActionState";
const execution={id:"e",sessionId:"actions-test",surfaceId:"a",componentId:"button",actionId:"run",baseRevision:1,status:"running" as const,idempotencyKey:"key",updatedAt:2};
beforeEach(()=>clearUiActionSession("actions-test"));
it('orders durable execution revisions even when timestamps tie or a legacy snapshot arrives late',()=>{
 receiveUiAction({...execution,executionRevision:3,status:'running',updatedAt:5});
 receiveUiAction({...execution,executionRevision:2,status:'accepted',updatedAt:5});
 receiveUiAction({...execution,status:'accepted',updatedAt:9});expect(surfaceUiActions('actions-test','a')[0].status).toBe('running');
 receiveUiAction({...execution,executionRevision:4,status:'completed',updatedAt:5});expect(surfaceUiActions('actions-test','a')[0].status).toBe('completed');
});
it("only matching durable records resolve uncertain submissions",()=>{
  markUncertainUiAction("actions-test","a","key");
  receiveUiAction({...execution,idempotencyKey:"other"});expect(hasUncertainUiAction("actions-test","a")).toBe(true);
  receiveUiAction(execution);expect(hasUncertainUiAction("actions-test","a")).toBe(false);
});
it("keeps terminal states and separates Surface/session cleanup epochs",()=>{
  receiveUiAction({...execution,status:"completed",updatedAt:3});receiveUiAction({...execution,updatedAt:4});
  expect(surfaceUiActions("actions-test","a")[0].status).toBe("completed");
  expect(surfaceUiActions("actions-test","b")).toEqual([]);
  const epoch=uiActionSessionEpoch("actions-test");clearUiActionSession("actions-test");
  expect(uiActionSessionEpoch("actions-test")).toBe(epoch+1);expect(surfaceUiActions("actions-test","a")).toEqual([]);
});
