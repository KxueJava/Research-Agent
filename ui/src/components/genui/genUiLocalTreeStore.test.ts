import { describe, expect, it, beforeEach } from "vitest";
import {
  applyLocalUiPatches,
  clearLocalUiPatches,
  genUiLocalScopeKey,
  getLocalUiPatches,
  getLocalUiVersion,
  getNodeUiState, setNodeUiState, clearLocalUiSession, getGenUiLocalSnapshot,
} from "./genUiLocalTreeStore";

describe("genUiLocalTreeStore", () => {
  const key = genUiLocalScopeKey("s1", "m1");

  beforeEach(() => {
    clearLocalUiPatches(key);
  });

  it("accumulates local patches per scope", () => {
    applyLocalUiPatches(key, [
      { op: "replace", path: "/root/props/title", value: "A" },
    ]);
    applyLocalUiPatches(key, [
      { op: "replace", path: "/root/props/value", value: 2 },
    ]);
    expect(getLocalUiPatches(key)).toHaveLength(2);
    expect(getLocalUiVersion(key)).toBe(2);
  });

  it("isolates two surfaces in the same message", () => {
    const a=genUiLocalScopeKey("s1","m1","a"), b=genUiLocalScopeKey("s1","m1","b");
    clearLocalUiPatches(a); clearLocalUiPatches(b);
    applyLocalUiPatches(a,[{op:"replace",path:"/root/props/title",value:"only A"}]);
    expect(getLocalUiPatches(a)).toHaveLength(1);
    expect(getLocalUiPatches(b)).toEqual([]);
    clearLocalUiPatches(a);
  });
  it("isolates node state, keeps Surface identity across messages and clears sessions",()=>{
    const a=genUiLocalScopeKey("nodes","m1","a"),b=genUiLocalScopeKey("nodes","m1","b");
    expect(genUiLocalScopeKey("nodes","m2","a")).toBe(a);
    setNodeUiState(a,"filter","February");setNodeUiState(b,"filter","March");
    expect(getNodeUiState(a,"filter")).toBe("February");expect(getNodeUiState(a,"other")).toBeUndefined();
    const before=getGenUiLocalSnapshot();clearLocalUiSession("nodes");
    expect(getNodeUiState(a,"filter")).toBeUndefined();expect(getNodeUiState(b,"filter")).toBeUndefined();expect(getGenUiLocalSnapshot()).toBeGreaterThan(before);
  });
});
