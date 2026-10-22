import type {MapConfiguration} from "@/services/maps";
export type AmapSdk={Map:new(container:HTMLElement,options:Record<string,unknown>)=>any;Marker:new(options:Record<string,unknown>)=>any;Polyline:new(options:Record<string,unknown>)=>any};
type AmapWindow=Window&{AMap?:AmapSdk;_AMapSecurityConfig?:Record<string,string>;__researchAmapLoaded?:()=>void};
let loading:Promise<AmapSdk>|undefined,signature:string|undefined;
/** One official JS API 2.0 loader per page, shared by independently owned map instances. */
export function loadAmapSdk(config:MapConfiguration):Promise<AmapSdk>{
  if(!config.jsReady||!config.jsKey||!config.securityServiceHost&&!config.securityJsCode)return Promise.reject(Error("地图尚未配置 JS API Key 和安全配置"));
  const key=JSON.stringify([config.jsKey,config.securityServiceHost,config.securityJsCode]);
  if(loading){if(key!==signature)return Promise.reject(Error("当前页面地图配置已变化，请刷新后重试"));return loading;}
  signature=key;
  loading=new Promise<AmapSdk>((resolve,reject)=>{
    const win=window as AmapWindow;
    win._AMapSecurityConfig=config.securityServiceHost?{serviceHost:config.securityServiceHost}:{securityJsCode:config.securityJsCode!};
    const script=document.createElement("script");script.async=true;script.dataset.researchAmap="2.0";
    let finished=false;
    const cleanup=()=>{clearTimeout(timer);delete win.__researchAmapLoaded;script.onerror=null;};
    const fail=()=>{if(finished)return;finished=true;cleanup();script.remove();reject(Error("高德地图初始化失败，请检查网络、Key 类型、域名白名单与安全配置"));};
    const timer=setTimeout(fail,15000);
    win.__researchAmapLoaded=()=>{if(finished)return;if(!win.AMap?.Map){fail();return}finished=true;cleanup();resolve(win.AMap);};
    script.onerror=fail;script.src=`https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.jsKey!)}&callback=__researchAmapLoaded`;
    document.head.append(script);
  }).catch(error=>{loading=undefined;signature=undefined;throw error;});
  return loading;
}
