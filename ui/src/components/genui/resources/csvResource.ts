import { fail, ok, safeKey, type Cell, type Result, type Row } from "./types";
/** RFC-style quoted cells, bounded input; malformed input never partially registers. */
export function parseCsvResource(text:string,numericColumns:string[]=[]):Result<{columns:string[];rows:Row[]}>{
  if(text.length>2_097_152)return fail("LIMIT","CSV 超过 2 MiB");
  text=text.replace(/^\uFEFF/,"");
  const matrix:string[][]=[];let row:string[]=[],cell="",quoted=false,closed=false;
  function pushCell(){row.push(cell);cell="";closed=false;}
  function pushRow(){const explicit=row.length>0||closed||cell.length>0;pushCell();if(explicit)matrix.push(row);row=[];}
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(quoted){if(ch==='"'){if(text[i+1]==='"'){cell+='"';i++;}else{quoted=false;closed=true;}}else cell+=ch;}
    else if(ch===",")pushCell();
    else if(ch==="\n"||ch==="\r"){if(ch==="\r"&&text[i+1]==="\n")i++;pushRow();}
    else if(ch==='"'&&!cell&&!closed)quoted=true;
    else if(closed||ch==='"')return fail("CSV_SYNTAX","CSV 引号格式错误");
    else cell+=ch;
    if(cell.length>65536||row.length>50||matrix.length>10001)return fail("LIMIT","CSV 行列或单元格超过限制");
  }
  if(quoted)return fail("CSV_SYNTAX","CSV 引号未闭合");
  if(cell||row.length||closed)pushRow();
  const columns=matrix.shift()?.map(c=>c.trim());
  if(!columns?.length||columns.some(c=>!safeKey(c))||new Set(columns).size!==columns.length||numericColumns.some(c=>!columns.includes(c)))return fail("CSV_HEADER","CSV 列名重复、无效或缺少声明的数值列");
  const rows:Row[]=[];
  for(const [index,values] of matrix.entries()){
    if(values.length!==columns.length)return fail("CSV_COLUMNS",`CSV 第 ${index+2} 行列数不一致`);
    const record:Record<string,Cell>=Object.create(null);
    for(let j=0;j<columns.length;j++){
      const value=values[j],column=columns[j];
      if(numericColumns.includes(column)){
        if(!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())||!Number.isFinite(Number(value)))return fail("NOT_NUMBER",`第 ${index+2} 行 ${column} 不是有效数值`);
        const converted=Number(value);
        if(canonicalDecimal(value)!==canonicalDecimal(String(converted)))return fail("PRECISION",`第 ${index+2} 行 ${column} 超出精确数值转换范围`);
        record[column]=converted;
      }else record[column]=value;
    }
    rows.push(record);
  }
  return ok({columns,rows});
}
function canonicalDecimal(value:string){
  const v=value.trim(),negative=v.startsWith("-");const [whole,fraction=""]=v.replace(/^[+-]/,"").split(".");
  const integer=whole.replace(/^0+/,"")||"0",decimal=fraction.replace(/0+$/,"");
  return `${negative&&(integer!=="0"||decimal)?"-":""}${integer}${decimal?`.${decimal}`:""}`;
}
