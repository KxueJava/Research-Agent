import { beforeEach, expect, it, vi } from "vitest";
vi.mock("@/services/agentFile",()=>({agentFileApi:{uploadConversationFile:vi.fn()}}));
import { importCsvFile } from "./uploadResource";
import { clearResourceSession, getResource,putResource } from "./resourceStore";
import {registerResourcePersistence} from './resourcePersistence';
const scope={sessionId:"upload-s",surfaceId:"a"};
const file={name:"sales.csv",size:20,text:async()=>"product,revenue\na,10"} as File;
beforeEach(()=>clearResourceSession(scope.sessionId));
it('serializes a superseded durable PUT and reconciles its version before committing the latest file',async()=>{
  let release!:(value:any)=>void;const versions:number[]=[];const unregister=registerResourcePersistence(scope,async resource=>{versions.push(resource.version);return versions.length===1?await new Promise<any>(resolve=>release=resolve):resource});
  try{
    const a=importCsvFile(scope,'sales',file,['revenue'],async()=>({resourceKey:'a'}) as any);
    await vi.waitFor(()=>expect(release).toBeDefined());
    const b=importCsvFile(scope,'sales',{...file,text:async()=>"product,revenue\nb,22"} as File,['revenue'],async()=>({resourceKey:'b'}) as any);
    release({id:'sales',version:1,source:{type:'upload',name:'sales.csv'},collectedAt:'2026-10-21T00:00:00Z',columns:['product','revenue'],rows:[{product:'a',revenue:10}]});
    expect((await a).ok).toBe(false);expect((await b).ok).toBe(true);expect(versions).toEqual([1,2]);expect(getResource(scope,'sales')).toMatchObject({version:2,rows:[{product:'b',revenue:22}]});
  }finally{unregister()}
});
it('reconciles superseded committed versions even when the ten-version cache is full',async()=>{
  const input={id:'sales',source:{type:'upload' as const,name:'sales.csv'},collectedAt:'2026-10-21T00:00:00Z',columns:['product','revenue'],rows:[{product:'old',revenue:1}]};
  for(let version=1;version<=10;version++)expect(putResource(scope,{...input,version}).ok).toBe(true);
  let release!:(value:any)=>void;const versions:number[]=[];const unregister=registerResourcePersistence(scope,async resource=>{versions.push(resource.version);return versions.length===1?await new Promise<any>(resolve=>release=resolve):resource});
  try{const a=importCsvFile(scope,'sales',file,['revenue'],async()=>({resourceKey:'a'}) as any);await vi.waitFor(()=>expect(release).toBeDefined());
    const b=importCsvFile(scope,'sales',{...file,text:async()=>"product,revenue\nb,22"} as File,['revenue'],async()=>({resourceKey:'b'}) as any);
    release({...input,version:11});await a;expect((await b).ok).toBe(true);expect(versions).toEqual([11,12]);expect(getResource(scope,'sales')?.version).toBe(12);
  }finally{unregister()}
});
it("uploads the actual CSV file before registering provenance and rows",async()=>{
  const upload=vi.fn().mockResolvedValue({resourceKey:"server/file",name:file.name});
  const result=await importCsvFile(scope,"sales",file,["revenue"],upload);
  expect(upload).toHaveBeenCalledWith(scope.sessionId,file);
  expect(result.value).toMatchObject({version:1,source:{type:"upload",resourceKey:"server/file"},rows:[{product:"a",revenue:10}]});
});
it("keeps the previous resource on upload failure and refuses late completion after session cleanup",async()=>{
  const uploaded=async()=>({resourceKey:"server/file"});await importCsvFile(scope,"sales",file,["revenue"],uploaded as any);
  const first=getResource(scope,"sales");
  expect((await importCsvFile(scope,"sales",file,["revenue"],async()=>{throw Error("offline");})).ok).toBe(false);
  expect(getResource(scope,"sales")).toBe(first);
  let resolve!:(v:any)=>void;const pending=importCsvFile(scope,"sales",file,["revenue"],()=>new Promise(r=>{resolve=r;}));
  await vi.waitFor(()=>expect(resolve).toBeDefined());clearResourceSession(scope.sessionId);resolve({resourceKey:"late"});
  expect((await pending).ok).toBe(false);expect(getResource(scope,"sales")).toBeUndefined();
});
it("ignores a slower earlier upload when a new file has already been selected",async()=>{
  let resolve!:(v:any)=>void;
  const first=importCsvFile(scope,"sales",file,["revenue"],()=>new Promise(r=>{resolve=r;}));
  await vi.waitFor(()=>expect(resolve).toBeDefined());
  const latest=await importCsvFile(scope,"sales",{...file,text:async()=>"product,revenue\nb,22"} as File,["revenue"],async()=>({resourceKey:"latest"}) as any);
  resolve({resourceKey:"older"});expect((await first).ok).toBe(false);expect(getResource(scope,"sales")).toBe(latest.value);expect(latest.value?.rows).toEqual([{product:"b",revenue:22}]);
});
