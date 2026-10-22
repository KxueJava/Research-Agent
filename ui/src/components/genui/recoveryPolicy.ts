const record=(v:any):Record<string,any>=>v&&typeof v==='object'&&!Array.isArray(v)?v:{};
const secret=(s:string)=>/password|passwd|secret|token|credential|身份证|密码/i.test(s);
export function recoverableNodes(tree:any){
  const refs=new Set<string>(),safe=new Set<string>(),blocked=new Set<string>();
  const reference=(v:any)=>{if(typeof v?.fromNode==='string')refs.add(v.fromNode)};
  const visit=(raw:any,ancestorSensitive=false)=>{const node=record(raw),p=record(node.props),id=node.nodeId;
    const excluded=ancestorSensitive||p.sensitive===true||p.type==='password'||secret(`${id??''} ${p.name??''}`);
    if(excluded)blocked.add(id);
    if(!excluded&&['Select','Input','TextInput','NumberInput','Slider','Switch','Checkbox','MultiSelect','Table','Chart'].includes(node.kind)){
      safe.add(id);if(p.persistState===true&&!['Input','TextInput'].includes(node.kind))refs.add(id);
    }
    if(!excluded){const ref=record(p.dataRef);reference(ref.sort);if(typeof ref.selectionNodeId==='string'&&!secret(ref.selectionNodeId)){refs.add(ref.selectionNodeId);safe.add(ref.selectionNodeId)}
      if(Array.isArray(ref.filters))ref.filters.forEach(f=>reference(f?.value));}
    if(Array.isArray(node.children))node.children.forEach((child:any)=>visit(child,excluded));
  };visit(tree?.root??tree);return new Set([...refs].filter(id=>safe.has(id)&&!blocked.has(id)));
}
export function safeRecoveryValue(v:unknown):boolean{return v===null||typeof v==='boolean'||typeof v==='string'&&v.length<=512||typeof v==='number'&&Number.isFinite(v)||Array.isArray(v)&&v.length<=1000&&v.every(x=>typeof x==='string'&&x.length<=128)}
export function recoveryDefaults(tree:any){
 const allowed=recoverableNodes(tree),out:Record<string,unknown>={};
 const visit=(node:any)=>{const p=record(node?.props),ref=record(p.dataRef);if(allowed.has(ref.selectionNodeId))out[ref.selectionNodeId]=[];
   if(allowed.has(node?.nodeId)){const value=p.value??p.checked;if(safeRecoveryValue(value))out[node.nodeId]=value}
   if(Array.isArray(node?.children))node.children.forEach(visit);
 };visit(tree?.root??tree);return out;
}
