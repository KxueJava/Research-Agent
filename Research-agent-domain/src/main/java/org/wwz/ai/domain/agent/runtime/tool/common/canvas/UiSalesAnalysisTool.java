package org.wwz.ai.domain.agent.runtime.tool.common.canvas;
import org.wwz.ai.domain.agent.adapter.port.FileArtifactPort;
import org.wwz.ai.domain.agent.runtime.dto.FileRequest;
import java.math.*;
import java.util.*;
import java.net.URI;

/** Fixed read-only sales capability. Paths, target and tool are resolved from the stored component. */
public final class UiSalesAnalysisTool implements UiActionService.Tool {
  private final FileArtifactPort files;private final String serviceBase;
  public UiSalesAnalysisTool(FileArtifactPort files,String serviceBase){this.files=files;this.serviceBase=serviceBase;}
  @SuppressWarnings("unchecked") public UiActionService.Output execute(UiActionExecution execution)throws Exception {
    var binding=(Map<String,Object>)execution.data().get("binding");var input=(Map<String,Object>)execution.data().get("payload");
    if(input.keySet().stream().anyMatch(k->!"month".equals(k)))throw new IllegalArgumentException("Only the registered month input is allowed");
    Object rawMonth=input.getOrDefault("month","");if(!(rawMonth instanceof String month)||!month.isEmpty()&&!month.matches("\\d{4}-(0[1-9]|1[0-2])"))throw new IllegalArgumentException("Invalid month");
    String file=Objects.toString(binding.get("sourceFile"),"");
    if(!file.matches("[A-Za-z0-9][A-Za-z0-9_. -]{0,120}\\.csv")||file.contains(".."))throw new IllegalArgumentException("Registered CSV file name invalid");
    var response=files.get(serviceBase,FileRequest.builder().requestId(execution.sessionId()).fileName(file).build());
    if(response==null||response.getDomainUrl()==null)throw new IllegalStateException("CSV unavailable");
    URI url=URI.create(response.getDomainUrl()),base=URI.create(serviceBase);
    if(!Objects.equals(url.getScheme(),base.getScheme())||!Objects.equals(url.getHost(),base.getHost())||url.getPort()!=base.getPort())throw new SecurityException("File service origin mismatch");
    if(response.getFileSize()!=null&&response.getFileSize()>2_097_152)throw new IllegalArgumentException("CSV too large");
    return analyze(execution,files.readText(url.toString(),30L));
  }
  @SuppressWarnings("unchecked") public static UiActionService.Output analyze(UiActionExecution execution,String csv){
    var binding=(Map<String,Object>)execution.data().get("binding");var input=(Map<String,Object>)execution.data().get("payload");
    String month=Objects.toString(input.get("month"),"");var parsed=parse(csv);var columns=parsed.removeFirst();
    if(!columns.containsAll(List.of("month","product","revenue")))throw new IllegalArgumentException("CSV requires month/product/revenue");
    List<Map<String,Object>> rows=new ArrayList<>();BigDecimal total=BigDecimal.ZERO;
    for(var cells:parsed){if(cells.size()!=columns.size())throw new IllegalArgumentException("CSV column count mismatch");
      var row=new LinkedHashMap<String,Object>();for(int i=0;i<columns.size();i++)row.put(columns.get(i),cells.get(i));
      BigDecimal revenue;try{revenue=new BigDecimal(Objects.toString(row.get("revenue"),"")).setScale(2,RoundingMode.HALF_UP);}catch(Exception error){throw new IllegalArgumentException("Invalid revenue");}
      if(revenue.movePointRight(2).abs().compareTo(BigDecimal.valueOf(9_007_199_254_740_991L))>0)throw new IllegalArgumentException("Revenue exceeds safe cents");
      row.put("revenue",revenue.toPlainString());
      if(month.isEmpty()||month.equals(row.get("month"))){rows.add(row);total=total.add(revenue);}
    }
    if(total.movePointRight(2).abs().compareTo(BigDecimal.valueOf(9_007_199_254_740_991L))>0)throw new IllegalArgumentException("Total exceeds safe cents");
    var resource=new LinkedHashMap<String,Object>();resource.put("id","sales-action");resource.put("version",1);resource.put("source",Map.of("type","upload","name",binding.get("sourceFile"),"resourceKey",execution.sessionId()+":"+binding.get("sourceFile")+":"+UiActionService.digest(csv)));resource.put("collectedAt",java.time.Instant.now().toString());resource.put("columns",columns);resource.put("rows",rows);
    var children=List.of(Map.of("kind","Stat","nodeId","action-total","props",Map.of("label","销售额","value",total.toPlainString())),
      Map.of("kind","Chart","nodeId","action-chart","props",Map.of("chart","bar","dataRef",Map.of("id","sales-action","groupBy","product","column","revenue","money",true))),
      Map.of("kind","Table","nodeId","action-table","props",Map.of("dataRef",Map.of("id","sales-action"))));
    return new UiActionService.Output(List.of(Map.of("op","add","path",Objects.toString(binding.get("targetPath"),""),"value",children)),List.of(resource),"已分析 "+rows.size()+" 行销售数据；销售额 "+total.toPlainString()+"。"+(month.isEmpty()?"":"月份："+month+"。"));
  }
  private static List<List<String>> parse(String text){
    if(text==null||text.length()>2_097_152)throw new IllegalArgumentException("CSV too large");
    text=text.replaceFirst("^\\uFEFF","");List<List<String>> rows=new ArrayList<>();List<String> row=new ArrayList<>();var cell=new StringBuilder();boolean quoted=false,closed=false,explicit=false;
    for(int i=0;i<=text.length();i++){
      char c=i==text.length()?'\n':text.charAt(i);
      if(quoted){if(c=='"'){if(i+1<text.length()&&text.charAt(i+1)=='"'){cell.append('"');i++;}else{quoted=false;closed=true;}}else{if(i==text.length())throw new IllegalArgumentException("Unclosed CSV quote");cell.append(c);}}
      else if(c==','||c=='\n'||c=='\r'){
        boolean meaningful=explicit||closed||!cell.isEmpty();row.add(cell.toString());cell.setLength(0);closed=false;
        if(c==',')explicit=true;else{if(c=='\r'&&i+1<text.length()&&text.charAt(i+1)=='\n')i++;if(meaningful)rows.add(row);row=new ArrayList<>();explicit=false;}
      }else if(c=='"'&&cell.isEmpty()&&!closed){quoted=true;explicit=true;}
      else{if(closed||c=='"')throw new IllegalArgumentException("Invalid CSV quote");cell.append(c);}
      if(cell.length()>65536||row.size()>50||rows.size()>10001)throw new IllegalArgumentException("CSV limits exceeded");
    }
    if(rows.isEmpty()||rows.getFirst().isEmpty())throw new IllegalArgumentException("CSV empty");
    var columns=rows.getFirst();for(int i=0;i<columns.size();i++)columns.set(i,columns.get(i).trim());
    if(new HashSet<>(columns).size()!=columns.size()||columns.stream().anyMatch(c->c.isBlank()||Set.of("__proto__","constructor","prototype").contains(c)))throw new IllegalArgumentException("Invalid CSV header");
    return rows;
  }
}
