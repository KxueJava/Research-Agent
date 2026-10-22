import { describe, expect, it } from "vitest";
import { equalDialogueProps } from "./dialogueMemo";
describe("dialogue memoization",()=>{
  it("invalidates an earlier round when only its session Surface changes",()=>{
    const chat={requestId:"r1"};
    expect(equalDialogueProps({chat,sessionSurface:{revision:1}},{chat,sessionSurface:{revision:2}})).toBe(false);
  });
  it("preserves an unchanged set of props",()=>{
    const props={chat:{},sessionSurface:{}};
    expect(equalDialogueProps(props,props)).toBe(true);
  });
});
