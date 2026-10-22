import {createContext,useContext,useEffect,useState,type ReactNode} from "react";
import {resolveServiceBaseUrl} from "@/utils/origin";
export type UiFeatures={streaming:boolean;actions:boolean;maps:boolean;planner:boolean};
export const legacyUiFeatures:UiFeatures={streaming:true,actions:true,maps:true,planner:true};
export const disabledUiFeatures:UiFeatures={streaming:false,actions:false,maps:false,planner:false};
const Context=createContext<UiFeatures>(legacyUiFeatures);
export const UiFeaturesContextProvider=Context.Provider;
export const useUiFeatures=()=>useContext(Context);
export const uiFeaturesUrl=(base:string)=>`${resolveServiceBaseUrl(base)}/api/agent/ui-features`;
export function parseUiFeatures(value:unknown):UiFeatures{
 if(!value||typeof value!=="object"||Object.values(legacyUiFeatures).length!==Object.keys(value).filter(k=>k in legacyUiFeatures&&typeof (value as any)[k]==="boolean").length)throw Error("界面开关响应无效");
 const raw=value as UiFeatures;return {streaming:raw.streaming,actions:raw.actions,maps:raw.maps,planner:raw.planner};
}
/** Fail closed until server flags load; no state or old events are deleted. */
export function UiFeaturesProvider({children}:{children:ReactNode}){
 const [flags,setFlags]=useState(disabledUiFeatures),[error,setError]=useState("");
 useEffect(()=>{let disposed=false,controller:AbortController|undefined;
  const load=async()=>{controller?.abort();controller=new AbortController();try{const response=await fetch(uiFeaturesUrl(typeof SERVICE_BASE_URL==="undefined"?"":SERVICE_BASE_URL),{cache:"no-store",signal:controller.signal});if(!response.ok)throw Error("界面开关暂不可用");const next=parseUiFeatures(await response.json());if(!disposed){setFlags(next);setError("");}}
   catch(e){if(!disposed&&!(e instanceof DOMException&&e.name==="AbortError")){setFlags(disabledUiFeatures);setError("扩展功能配置暂不可用，历史内容仍可阅读；正在重试。");}}};
  void load();const timer=setInterval(()=>void load(),30000);return()=>{disposed=true;controller?.abort();clearInterval(timer);};
 },[]);
 return <Context.Provider value={flags}>{error&&<div role="status" className="px-3 py-2 text-sm">{error}</div>}{children}</Context.Provider>;
}
