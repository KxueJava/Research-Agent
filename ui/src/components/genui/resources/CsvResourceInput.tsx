import { useEffect,useRef,useState } from "react";
import { genUiIdentity,useGenUiRenderContext } from "../GenUiRenderContext";
import { importCsvFile } from "./uploadResource";
export function CsvResourceInput({resourceId,numericColumns,label}:{resourceId:string;numericColumns?:string[];label?:string}){
  const context=useGenUiRenderContext(),scope=genUiIdentity(context);
  const [status,setStatus]=useState("");const [busy,setBusy]=useState(false);const active=useRef(true);
  useEffect(()=>{active.current=true;return()=>{active.current=false;};},[context.sessionId,context.surfaceId]);
  return <label className="block space-y-1 text-sm">
    <span>{label||"导入 CSV"}</span>
    <input type="file" accept=".csv,text/csv" aria-label={label||"导入 CSV"} disabled={!scope||busy}
      className="block w-full text-sm" onChange={async event=>{
        const file=event.currentTarget.files?.[0],input=event.currentTarget;if(!file||!scope)return;
        setBusy(true);setStatus("正在上传并校验数据…");
        const result=await importCsvFile(scope,resourceId,file,numericColumns);
        if(active.current){setBusy(false);setStatus(result.ok?`已导入 ${result.value.rows.length} 行数据`:result.error.message);input.value="";}
      }}/>
    <span role="status" data-upload-status className="block text-xs text-[var(--chat-text-soft)]">{status}</span>
  </label>;
}
