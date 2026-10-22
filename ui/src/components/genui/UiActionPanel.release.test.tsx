import {it,expect} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import UiActionPanel from "./UiActionPanel";
import {UiFeaturesContextProvider,disabledUiFeatures} from "./UiFeatures";
import {receiveUiAction} from "./uiActionState";
it("keeps history rejection and cancellation while disabling restart and approval",()=>{
 const base={sessionId:"flag-test",surfaceId:"surface",componentId:"button",actionId:"run",baseRevision:1};
 receiveUiAction({...base,id:"approval",status:"approval_required"});receiveUiAction({...base,id:"failed",status:"failed"});
 const html=renderToStaticMarkup(<UiFeaturesContextProvider value={disabledUiFeatures}><UiActionPanel {...base}/></UiFeaturesContextProvider>);
 expect(html).toMatch(/<button[^>]*disabled[^>]*>批准执行/);expect(html).toMatch(/<button[^>]*disabled[^>]*>重新发起/);
 expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>取消任务/);expect(html).toMatch(/<button(?![^>]*disabled)[^>]*>拒绝/);expect(html).toContain("查询动作状态");
});
