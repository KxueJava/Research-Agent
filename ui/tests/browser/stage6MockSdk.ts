// Explicit test SDK. It exercises the production AMap adapter and owns no real geographic service.
const probe={created:0,destroyed:0,resizes:0};(window as any).stage6Probe=probe;
class Overlay{owner?:MockMap;position?:number[];content?:HTMLElement;path?:number[][];options:any;handler?:()=>void;
  constructor(options:any){this.options=options;this.position=options.position;this.content=options.content;this.path=options.path;}
  on(_name:string,fn:()=>void){this.handler=fn}off(){this.handler=undefined}setPath(path:number[][]){this.path=path;this.owner?.render()}setOptions(options:any){Object.assign(this.options,options);this.owner?.render()}
}
class MockMap{
  root:HTMLDivElement;events=new Map<string,Set<Function>>();overlays:Overlay[]=[];center=[118,24];zoom=13;pitch=0;rotation=0;bounds=[117,23,119,25];padding=[0,0,0,0];
  constructor(host:HTMLElement){probe.created++;this.root=document.createElement("div");this.root.dataset.mockMapInstance=String(probe.created);this.root.style.cssText="position:absolute;inset:0;overflow:hidden;background:#e3ece6";host.append(this.root);}
  on(name:string,fn:Function){const set=this.events.get(name)??new Set();set.add(fn);this.events.set(name,set)}off(name:string,fn:Function){this.events.get(name)?.delete(fn)}emit(name:string){this.events.get(name)?.forEach(fn=>fn())}
  add(value:Overlay|Overlay[]){for(const o of Array.isArray(value)?value:[value]){o.owner=this;this.overlays.push(o)}this.render()}
  remove(value:Overlay|Overlay[]){const items=Array.isArray(value)?value:[value];this.overlays=this.overlays.filter(o=>!items.includes(o));items.forEach(o=>{o.owner=undefined;o.content?.remove()});this.render()}
  setFitView(_overlays?:unknown,_immediate?:boolean,padding=[0,0,0,0]){this.padding=padding;const points=this.overlays.flatMap(o=>o.path??(o.position?[o.position]:[]));if(!points.length)return;const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),x=Math.max(maxX-minX,.005),y=Math.max(maxY-minY,.005);this.bounds=[minX-x*.3,minY-y*.3,maxX+x*.3,maxY+y*.3];this.center=[(minX+maxX)/2,(minY+maxY)/2];this.render();this.emit("moveend")}
  getCenter(){return {lng:this.center[0],lat:this.center[1]}}getZoom(){return this.zoom}getPitch(){return this.pitch}getRotation(){return this.rotation}
  setCenter(value:number[]){this.center=[...value];this.emit("moveend")}setZoom(value:number){this.zoom=value;this.emit("zoomend")}setPitch(value:number){this.pitch=value;this.root.dataset.pitch=String(value);this.emit("pitchend")}setRotation(value:number){this.rotation=value;this.emit("rotateend")}
  setMapStyle(value:string){this.root.dataset.style=value}resize(){probe.resizes++;this.render()}destroy(){probe.destroyed++;this.events.clear();this.root.remove()}
  render(){const [a,b,c,d]=this.bounds;const [top,right,bottom,left]=this.padding;const w=this.root.clientWidth||800,h=this.root.clientHeight||470;const point=(p:number[])=>[(left+(p[0]-a)/(c-a)*(w-left-right))/w*100,(top+(d-p[1])/(d-b)*(h-top-bottom))/h*100];const ns="http://www.w3.org/2000/svg",svg=document.createElementNS(ns,"svg");svg.setAttribute("viewBox","0 0 100 100");svg.setAttribute("preserveAspectRatio","none");svg.style.cssText="position:absolute;inset:0;width:100%;height:100%;pointer-events:none";
    for(let i=10;i<100;i+=15){const line=document.createElementNS(ns,"path");line.setAttribute("d",`M ${i} 0 L ${i-8} 100 M 0 ${i} L 100 ${i+4}`);line.setAttribute("stroke","#fbfcf6");line.setAttribute("stroke-width","2");svg.append(line)}
    for(const o of this.overlays)if(o.path){const line=document.createElementNS(ns,"polyline");line.setAttribute("points",o.path.map(p=>point(p).join(",")).join(" "));line.setAttribute("fill","none");line.setAttribute("stroke","#238ed2");line.setAttribute("stroke-width","1");if(o.options.strokeStyle==="dashed")line.setAttribute("stroke-dasharray","2 2");svg.append(line)}
    this.root.replaceChildren(svg);for(const o of this.overlays)if(o.position&&o.content){const [x,y]=point(o.position);o.content.style.cssText=`position:absolute;left:${x}%;top:${y}%;transform:translate(-50%,-50%)`;o.content.onclick=()=>o.handler?.();this.root.append(o.content)}
  }
}
export const mockSdk={Map:MockMap,Marker:Overlay,Polyline:Overlay} as any;
