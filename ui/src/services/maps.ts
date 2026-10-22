import request,{refreshAccessToken} from "@/utils/request";
import {getAccessToken} from "@/utils/authToken";
import {resolveServiceBaseUrl} from "@/utils/origin";
import {getDeviceId} from "./agentConversation";
import {z} from "zod";
import querySSE from "@/utils/querySSE";
import {readConversationModelState} from "@/utils/conversationModelConfig";
import {placeSchema,placeDetailsSchema,savedViewSchema,type MapScope,type MapView} from "@/components/genui/maps/mapTypes";
const prefix=(session:string)=>`/api/agent/conversation/sessions/${encodeURIComponent(session)}/maps`;
const viewPath=(s:MapScope)=>`${prefix(s.sessionId)}/${encodeURIComponent(s.surfaceId)}/${encodeURIComponent(s.nodeId)}/state`;
const configSchema=z.object({jsReady:z.boolean(),webConfigured:z.boolean(),travelModes:z.array(z.enum(["walking","driving"])),jsKey:z.string().optional(),securityJsCode:z.string().optional(),securityServiceHost:z.string().optional()});
export type MapConfiguration=z.infer<typeof configSchema>;
export const getMapConfiguration=async(session:string)=>configSchema.parse(await request.get(`${prefix(session)}/config`));
export async function searchMapPlaces(session:string,query:string,city:string,signal?:AbortSignal){return z.array(placeSchema).max(10).parse(await request.get(`${prefix(session)}/places`,{params:{query,city,limit:5},signal}));}
export async function getMapView(scope:MapScope){return savedViewSchema.parse(await request.get(viewPath(scope)));}
const photosSchema=z.object({mapRevision:z.number().int().positive(),photos:z.record(z.string(),z.string().url().refine(v=>v.startsWith("https://"))),unavailablePlaceIds:z.array(z.string()).max(10),failedPlaceIds:z.array(z.string()).max(10)});
export async function getMapPhotos(scope:MapScope,signal?:AbortSignal){return photosSchema.parse(await request.get(`${prefix(scope.sessionId)}/${encodeURIComponent(scope.surfaceId)}/${encodeURIComponent(scope.nodeId)}/photos`,{signal}));}
const detailsSchema=z.object({mapRevision:z.number().int().positive(),placeId:z.string(),details:placeDetailsSchema});
export async function getMapPlaceDetails(scope:MapScope,placeId:string,signal?:AbortSignal){return detailsSchema.parse(await request.get(`${prefix(scope.sessionId)}/${encodeURIComponent(scope.surfaceId)}/${encodeURIComponent(scope.nodeId)}/places/${encodeURIComponent(placeId)}`,{signal}));}
export function streamMapPlaceIntroduction(scope:MapScope,placeId:string,mapRevision:number,generationId:string,signal:AbortSignal,callbacks:{message:(value:unknown)=>void;error:(error:Error)=>void;close:()=>void}){
  const base=resolveServiceBaseUrl(typeof SERVICE_BASE_URL==="string"?SERVICE_BASE_URL:"");
  const selection=readConversationModelState(scope.sessionId);
  const model=selection.selected?.model||selection.submitted?.model;
  querySSE({body:{mapRevision,generationId,model},signal,retryOnError:false,handleMessage:callbacks.message,handleError:callbacks.error,handleClose:callbacks.close},`${base}${prefix(scope.sessionId)}/${encodeURIComponent(scope.surfaceId)}/${encodeURIComponent(scope.nodeId)}/places/${encodeURIComponent(placeId)}/introduction`);
}
export async function saveMapView(scope:MapScope,stateRevision:number,mapRevision:number,state:MapView){return savedViewSchema.parse(await request.put(viewPath(scope),{stateRevision,mapRevision,state}));}
/** Surface endpoints intentionally return raw JSON, unlike the standard action response envelope. */
export async function getMapSurface(session:string,surface:string){
  const base=resolveServiceBaseUrl(typeof SERVICE_BASE_URL==="string"?SERVICE_BASE_URL:"");
  const read=(token:string|null)=>fetch(`${base}/api/agent/conversation/sessions/${encodeURIComponent(session)}/surfaces/${encodeURIComponent(surface)}`,{credentials:"include",headers:{"X-Device-Id":getDeviceId(),...(token?{Authorization:`Bearer ${token}`}:{})}});
  let response=await read(getAccessToken());if(response.status===401){const token=await refreshAccessToken();if(token)response=await read(token);}
  if(!response.ok)throw Error("地图快照暂时无法同步");const value=await response.json();if(value.sessionId!==session||value.surfaceId!==surface||!Number.isSafeInteger(value.revision))throw Error("地图响应身份不匹配");return value;
}
export function mapError(error:unknown){const data=(error as {response?:{data?:{message?:unknown}}})?.response?.data;if(typeof data?.message==="string")return data.message;return error instanceof Error?error.message:"地图服务暂时不可用";}
