import { describe, expect, it } from "vitest";
import { projectSessionSurfaces } from "./surfaceProtocol";
import { mergeUiPatchIntoTasks } from "./genuiState";
import { combineData, handleTaskData } from "../chat";
import { parseEventData } from "../sseParsers";
const tree=(title:string)=>({root:{kind:"Card",nodeId:"r",props:{title},children:[]}});
const task=(type:string,resultMap:any,id:string)=>({messageType:type,messageId:id,resultMap});
const chat=(id:string,tasks:any[])=>({requestId:id,sessionId:"s",tasks:[tasks]}) as any;
const meta=(revision:number,eventId:string,surfaceId="a")=>({surfaceId,sessionId:"s",messageId:"r1",revision,eventId,baseRevision:revision-1,schemaVersion:"rui/1"});
describe("session surface projection",()=>{
  it("restores a non-streaming tool-published Surface absent from replay, and keeps newer snapshots",()=>{
    const document={...meta(10,"saved"),tree:tree("Saved map")};
    const restored=projectSessionSurfaces([chat("r1",[])],[document]).get("r1");
    expect(restored?.[0]?.surfaceRevision).toBe(10);expect(restored?.[0]?.tree.root.props.title).toBe("Saved map");
    expect(projectSessionSurfaces([chat("other",[])],[document]).size).toBe(0);
    const live=chat("r1",[task("ui_tree",{tree:tree("Newer"),surface:meta(11,"live")},"t")]);
    expect(projectSessionSurfaces([live],[document]).get("r1")?.[0]?.surfaceRevision).toBe(11);
    expect(projectSessionSurfaces([chat("r1",[])],[{...document,tree:{root:{kind:"Unsupported"}}}]).size).toBe(0);
  });
  const stream=(seq:number,extra:any={})=>({protocol:"rui-stream/1",sessionId:"s",surfaceId:"a",messageId:"r1",generationId:"g",sequence:seq,baseRevision:seq-1,revision:seq,status:"committed",startedAt:1000,firstUsefulAt:1100,emittedAt:1100+seq,snapshot:tree("A"),...extra});
  it("keeps live nested SSE commits before final message, and replays terminal snapshots identically",()=>{
    const c:any={...chat("r1",[]),multiAgent:{tasks:[]},loading:true};
    const incoming=stream(1);
    const frame:any={messageType:"task",messageId:"g:1",messageOrder:1,taskId:"t",taskOrder:1,resultMap:{messageType:"ui_stream",resultMap:incoming}};
    combineData(parseEventData(frame),c);handleTaskData(c,false);
    expect(projectSessionSurfaces([c]).get("r1")?.[0]?.tree.root.props.title).toBe("A");
    expect(c.loading).toBe(true);
    const cancelled=stream(2,{status:"cancelled"});
    const document={...meta(2,"g:2"),stream:cancelled,tree:tree("A")};
    expect(projectSessionSurfaces([chat("r1",[])],[document]).get("r1")?.[0]?.stream?.status).toBe("cancelled");
    const live=projectSessionSurfaces([chat("r1",[task("ui_stream",stream(1),"g:1"),task("ui_stream",cancelled,"g:2")])]).get("r1")?.[0];
    expect(live?.tree).toEqual(document.tree);expect(live?.stream?.firstUsefulLatencyMs).toBe(100);
    expect(()=>parseEventData({...frame,resultMap:{messageType:"ui_stream",resultMap:{...incoming,revision:9}}})).toThrow();
  });
  it("preserves A on gaps and bad B, accepts authoritative recovery and ignores an older list",()=>{
    const c=chat("r1",[task("ui_stream",stream(1),"g:1"),task("ui_stream",stream(3),"g:3")]);
    expect(projectSessionSurfaces([c]).get("r1")?.[0]?.needsResync).toBe(true);
    const restored={...meta(3,"g:3"),stream:stream(3,{status:"completed",snapshot:undefined}),tree:tree("Recovered")};
    expect(projectSessionSurfaces([c],[restored]).get("r1")?.[0]?.tree.root.props.title).toBe("Recovered");
    const newer=chat("r1",[task("ui_tree",{tree:tree("Latest"),surface:meta(5,"p5")},"t")]);
    expect(projectSessionSurfaces([newer],[restored]).get("r1")?.[0]?.tree.root.props.title).toBe("Latest");
    expect(projectSessionSurfaces([chat("other",[])],[restored]).size).toBe(0);
    expect(projectSessionSurfaces([chat("r1",[task("ui_stream",stream(1,{messageId:"other"}),"bad-origin")])]).size).toBe(0);
  });
  it("preserves both surfaces in one message and patches only the named one",()=>{
    const chats=[chat("r1",[
      task("ui_tree",{tree:tree("A"),surface:meta(1,"e1","a")},"a"),
      task("ui_tree",{tree:tree("B"),surface:meta(1,"e2","b")},"b"),
    ]),chat("r2",[task("ui_patch",{surface:meta(2,"e3","a"),snapshot:tree("A2"),patches:[]},"p")])];
    const result=projectSessionSurfaces(chats).get("r1") as any;
    expect(Array.isArray(result)).toBe(true);
    expect(result.map((s:any)=>[s.surfaceId,s.tree.root.props.title])).toEqual([["a","A2"],["b","B"]]);
  });
  it("pairs a frozen original tree with its original revision after eager merging",()=>{
    const t:any=task("ui_tree",{tree:tree("Old"),surface:meta(1,"e1")},"t");
    const p:any=task("ui_patch",{surface:meta(2,"e2"),snapshot:tree("New"),patches:[{op:"replace",path:"/root/props/title",value:"New"}]},"p");
    mergeUiPatchIntoTasks([[t]],p);
    expect(projectSessionSurfaces([chat("r1",[t,p])]).get("r1")?.[0]?.tree.root.props.title).toBe("New");
  });
  it("updates the original round from a later round",()=>{
    const chats=[chat("r1",[task("ui_tree",{tree:tree("Old"),surface:meta(1,"e1")},"t")]),chat("r2",[task("ui_patch",{surface:meta(2,"e2"),snapshot:tree("New"),patches:[]},"p")])];
    expect(projectSessionSurfaces(chats).get("r1")?.[0]?.tree.root.props.title).toBe("New");
    expect(projectSessionSurfaces(chats).has("r2")).toBe(false);
  });
  it("does not route explicitly targeted patches to another surface",()=>{
    const chats=[chat("r1",[task("ui_tree",{tree:tree("A"),surface:meta(1,"e1")},"a")]),chat("r2",[task("ui_tree",{tree:tree("B"),surface:{...meta(1,"eb","b"),messageId:"r2"}},"b")]),chat("r3",[task("ui_patch",{surface:meta(2,"e2"),snapshot:tree("A2"),patches:[]},"p")])];
    const result=projectSessionSurfaces(chats);
    expect(result.get("r1")?.[0]?.tree.root.props.title).toBe("A2");
    expect(result.get("r2")?.[0]?.tree.root.props.title).toBe("B");
  });
  it("does not roll back on late snapshots and deduplicates by event identity",()=>{
    const result=projectSessionSurfaces([chat("r1",[task("ui_tree",{tree:tree("New"),surface:meta(3,"e3")},"t"),task("ui_patch",{surface:meta(2,"e2"),snapshot:tree("Old")},"p")])]);
    expect(result.get("r1")?.[0]?.tree.root.props.title).toBe("New");
  });
  it("replays identical legacy operations when they are distinct events",()=>{
    const t=tree("A") as any;t.root.children=[];
    const p=[{op:"add",path:"/root/children/-",value:{kind:"Card",props:{title:"x"}}}];
    const c=chat("r1",[task("ui_tree",{tree:t},"t"),task("ui_patch",{patches:p},"p1"),task("ui_patch",{patches:p},"p2")]);
    expect(projectSessionSurfaces([c]).get("r1")?.[0]?.tree.root.children).toHaveLength(2);
  });
  it("marks a version gap for resync instead of applying a patch to the wrong base",()=>{
    const c=chat("r1",[task("ui_tree",{tree:tree("A"),surface:meta(1,"e1")},"t"),task("ui_patch",{surface:meta(3,"e3"),patches:[{op:"replace",path:"/root/props/title",value:"Wrong"}]},"p")]);
    const result=projectSessionSurfaces([c]).get("r1")?.[0];
    expect(result?.tree.root.props.title).toBe("A");expect(result?.needsResync).toBe(true);
    expect(result?.requiredRevision).toBe(3);
  });
});
