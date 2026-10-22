import {beforeEach,expect,it,vi} from "vitest";
const {post,get}=vi.hoisted(()=>({post:vi.fn(),get:vi.fn()}));vi.mock("@/utils/request",()=>({default:{post,get}}));
import {submitUiAction,restartUiAction,clearUiActionRequests,parseUiActionExecution,decideUiAction,cancelUiAction,isUiActionUncertainError} from "./uiAction";
beforeEach(()=>{post.mockReset();get.mockReset();clearUiActionRequests();});
const req={surfaceId:"a",componentId:"button",actionId:"analyze",baseRevision:1,payload:{month:"2026-02"}};
it("keeps the same key across timeout/retry and coalesces duplicate clicks",async()=>{
  post.mockRejectedValueOnce(new Error("timeout"));await expect(submitUiAction("s",req)).rejects.toThrow();
  const first=post.mock.calls[0][1].idempotencyKey;
  post.mockResolvedValue({id:"e",sessionId:"s",surfaceId:"a",componentId:"button",actionId:"analyze",status:"approval_required",baseRevision:1});
  const [a,b]=await Promise.all([submitUiAction("s",req),submitUiAction("s",req)]);
  expect(a).toBe(b);expect(post).toHaveBeenCalledTimes(2);expect(post.mock.calls[1][1].idempotencyKey).toBe(first);expect(a.status).toBe("approval_required");
});
it("rejects invalid statuses and incomplete execution identities",()=>{
  expect(()=>parseUiActionExecution({status:"success"})).toThrow();
});
it("distinguishes explicit rejection from an uncertain timeout or gateway error",()=>{
  expect(isUiActionUncertainError({response:{status:409}})).toBe(false);
  expect(isUiActionUncertainError(Error("timeout"))).toBe(true);
  expect(isUiActionUncertainError({response:{status:504}})).toBe(true);
});
it("rotates a key only for an explicit new attempt and validates mutation response identities",async()=>{
  const e={id:"e",sessionId:"s",surfaceId:"a",componentId:"button",actionId:"analyze",status:"failed",baseRevision:1};
  post.mockResolvedValue(e);await submitUiAction("s",req);const original=post.mock.calls[0][1].idempotencyKey;
  await restartUiAction("s",req);expect(post.mock.calls[1][1].idempotencyKey).not.toBe(original);
  post.mockResolvedValue({...e,sessionId:"foreign"});
  await expect(decideUiAction("s","e",true)).rejects.toThrow("身份");await expect(cancelUiAction("s","e")).rejects.toThrow("身份");
});
