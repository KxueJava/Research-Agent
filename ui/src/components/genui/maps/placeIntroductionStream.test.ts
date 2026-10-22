import {expect,it} from "vitest";
import {applyIntroductionEvent,createIntroductionStream} from "./placeIntroductionStream";
const frame=(sequence:number,type:string,text="",extra={})=>({generationId:"g",placeId:"p",mapRevision:2,sequence,type,text,cached:false,emittedAt:new Date().toISOString(),...extra});
it("renders useful text before completion and keeps partial text on failure",()=>{
  let s=createIntroductionStream("g","p",2);s=applyIntroductionEvent(s,frame(0,"start"));s=applyIntroductionEvent(s,frame(1,"delta","第一段。"));expect(s.text).toBe("第一段。");expect(s.status).toBe("streaming");s=applyIntroductionEvent(s,frame(2,"error","生成中断"));expect(s.text).toBe("第一段。");expect(s.status).toBe("failed");
});
it("ignores duplicates and foreign generations but rejects a missing sequence",()=>{
  let s=applyIntroductionEvent(createIntroductionStream("g","p",2),frame(0,"start"));s=applyIntroductionEvent(s,frame(1,"delta","A"));expect(applyIntroductionEvent(s,frame(1,"delta","A"))).toBe(s);expect(applyIntroductionEvent(s,frame(2,"delta","wrong",{generationId:"old"}))).toBe(s);expect(applyIntroductionEvent(s,frame(2,"delta","wrong",{placeId:"other"}))).toBe(s);expect(applyIntroductionEvent(s,frame(3,"delta","B")).status).toBe("failed");
});
it("accepts completed cache snapshots and never appends after a terminal state",()=>{
  let s=applyIntroductionEvent(createIntroductionStream("g","p",2),frame(0,"start","",{cached:true}));s=applyIntroductionEvent(s,frame(1,"delta","完整简介",{cached:true}));s=applyIntroductionEvent(s,frame(2,"complete","",{cached:true}));expect(s.status).toBe("completed");expect(s.cached).toBe(true);expect(applyIntroductionEvent(s,frame(3,"delta","more"))).toBe(s);
});
