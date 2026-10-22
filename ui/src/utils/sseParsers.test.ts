import { describe, expect, it } from "vitest";
import { parseAgentAnswer, parseEventData } from "./sseParsers";

describe("SSE envelope compatibility", () => {
  it("normalizes a null control-frame resultMap without discarding the frame", () => {
    const frame = parseAgentAnswer({status:"success",packageType:"heartbeat",finished:false,resultMap:null});
    expect(frame.resultMap).toEqual({});
    expect(frame.packageType).toBe("heartbeat");
  });
  it("still rejects malformed scalar and array payloads", () => {
    for (const resultMap of [[], "bad", 42]) {
      expect(()=>parseAgentAnswer({status:"success",packageType:"data",finished:false,resultMap})).toThrow();
    }
    expect(()=>parseEventData({messageType:"ui_patch",resultMap:null})).toThrow();
  });
});
