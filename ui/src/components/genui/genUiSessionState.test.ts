import {expect,it} from "vitest";
import {clearGenUiSession} from "./genUiSessionState";
import {genUiFormsStore} from "./genUiForms";
import {applyLocalUiPatches,genUiLocalScopeKey,getNodeUiState,setNodeUiState,getLocalUiPatches} from "./genUiLocalTreeStore";
it("clears form values, node state and patches only for the departed session",()=>{
  const a=genUiLocalScopeKey("cleanup-a","m","a"),b=genUiLocalScopeKey("cleanup-b","m","a");
  const formA=JSON.stringify(["cleanup-a","a","form","f"]),formB=JSON.stringify(["cleanup-b","a","form","f"]);
  genUiFormsStore.setField(formA,"amount",12);genUiFormsStore.setField(formB,"amount",30);
  setNodeUiState(a,"amount",12);setNodeUiState(b,"amount",30);applyLocalUiPatches(a,[{op:"replace",path:"/root/props/title",value:"changed"}]);
  clearGenUiSession("cleanup-a");expect(getNodeUiState(a,"amount")).toBeUndefined();expect(getLocalUiPatches(a)).toEqual([]);expect(genUiFormsStore.getValues(formA)).toEqual({});
  expect(getNodeUiState(b,"amount")).toBe(30);expect(genUiFormsStore.getValues(formB)).toEqual({amount:30});clearGenUiSession("cleanup-b");
});
