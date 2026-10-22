import {z} from "zod";
export const coordinateSchema=z.tuple([z.number().finite().min(-180).max(180),z.number().finite().min(-90).max(90)]);
const id=z.string().min(1).max(128).refine(v=>!["__proto__","prototype","constructor"].includes(v)&&!/[\x00-\x1f]/.test(v));
export const travelModeSchema=z.enum(["walking","driving"]);
const provider=z.enum(["amap","mock"]),integer=z.number().int().safe().nonnegative();
const timestamp=z.string().refine(v=>Number.isFinite(Date.parse(v)),"Invalid map timestamp");
export const placeSchema=z.object({placeId:id,name:z.string().min(1).max(200),coordinates:coordinateSchema,coordinateSystem:z.literal("GCJ-02"),address:z.string().max(500),source:provider,photoUrl:z.string().url().refine(v=>v.startsWith("https://")).optional()});
const website=z.string().url().max(2048).refine(v=>{try{const u=new URL(v);return ["http:","https:"].includes(u.protocol)&&!u.username&&!u.password;}catch{return false;}});
export const placeDetailsSchema=z.object({place:placeSchema,photos:z.array(z.string().url().max(4096).refine(v=>v.startsWith("https://"))).max(8),category:z.string().max(500),introduction:z.string().max(6000),synthesized:z.boolean(),phone:z.string().max(500).optional(),website:website.optional(),openingHours:z.string().max(1000).optional(),rating:z.number().finite().gt(0).max(5).optional()});
export type MapPlaceDetails=z.infer<typeof placeDetailsSchema>;
const legSchema=z.object({fromPlaceId:id,toPlaceId:id,distanceMeters:integer,durationSeconds:integer,geometry:z.array(coordinateSchema).min(2).max(2000)});
export const mapDataSchema=z.object({schemaVersion:z.literal("map/1"),mapId:id,surfaceId:id,revision:integer.refine(n=>n>0),title:z.string().min(1).max(200),origin:placeSchema,stops:z.array(placeSchema).min(1).max(9),travelMode:travelModeSchema,selectedPlaceId:id,provider,fetchedAt:timestamp,routeStatus:z.literal("ready"),dataStatus:z.literal("fresh"),requestId:id.optional(),route:z.object({revision:integer,coordinateSystem:z.literal("GCJ-02"),provider,computedAt:timestamp,travelMode:travelModeSchema,distanceMeters:integer,durationSeconds:integer,geometry:z.array(coordinateSchema).min(2).max(2000),legs:z.array(legSchema).min(1).max(9)})}).superRefine((data,ctx)=>{
  const places=[data.origin,...data.stops],route=data.route,ids=places.map(p=>p.placeId);
  const valid=route.revision===data.revision&&route.provider===data.provider&&route.travelMode===data.travelMode&&new Set(ids).size===ids.length&&ids.includes(data.selectedPlaceId)&&places.every(p=>p.source===data.provider)&&route.legs.length===places.length-1
    &&route.legs.every((l,i)=>l.fromPlaceId===ids[i]&&l.toPlaceId===ids[i+1])
    &&route.distanceMeters===route.legs.reduce((sum,l)=>sum+l.distanceMeters,0)&&route.durationSeconds===route.legs.reduce((sum,l)=>sum+l.durationSeconds,0)
    &&JSON.stringify(route.geometry)===JSON.stringify(route.legs.flatMap(l=>l.geometry));
  if(!valid)ctx.addIssue({code:"custom",message:"地图版本、地点顺序或分段路线不一致"});
});
export type MapData=z.infer<typeof mapDataSchema>;
export type MapPlace=z.infer<typeof placeSchema>;
export type TravelMode=z.infer<typeof travelModeSchema>;
export type MapScope={sessionId:string;surfaceId:string;nodeId:string};
const cameraSchema=z.object({center:coordinateSchema.optional(),zoom:z.number().min(2).max(20).optional(),pitch:z.number().min(0).max(83).optional(),rotation:z.number().min(-360).max(360).optional()});
export const viewSchema=cameraSchema.extend({selectedPlaceId:id.optional(),theme:z.enum(["light","dark"]).optional(),viewports:z.object({inline:cameraSchema.optional(),expanded:cameraSchema.optional()}).optional()});
export type MapView=z.infer<typeof viewSchema>;
export const mapViewport=(view:MapView,mode:string):MapView=>view.viewports?.[mode==='inline'?'inline':'expanded']??{center:view.center,zoom:view.zoom,pitch:view.pitch,rotation:view.rotation};
export const savedViewSchema=z.object({stateRevision:integer,mapRevision:integer,state:viewSchema});
export type SavedMapView=z.infer<typeof savedViewSchema>;
export const parseMapData=(raw:unknown):MapData=>mapDataSchema.parse(raw);
export const mapPlaces=(data:MapData)=>[data.origin,...data.stops];
export const mapScopeKey=(scope:MapScope)=>JSON.stringify([scope.sessionId,scope.surfaceId,scope.nodeId]);
