import { expect,it } from "vitest";
import { resolveResourceBinding } from "./binding";
import { computeBoundValue } from "../bindProps";
import { putResource,clearResourceSession } from "./resourceStore";
const scope={sessionId:"bind-s",surfaceId:"a"};
it("binds chart/table/metric to the same filtered version and local selection",()=>{
  clearResourceSession(scope.sessionId);
  putResource(scope,{id:"sales",version:1,source:{type:"inline",name:"test"},collectedAt:new Date().toISOString(),columns:["month","revenue"],rows:[{month:"Jan",revenue:12},{month:"Feb",revenue:20}]});
  const ref={id:"sales",column:"revenue",groupBy:"month",filters:[{column:"month",op:"eq",value:{fromNode:"filter"}}]};
  const table=resolveResourceBinding(scope,{dataRef:ref},"Table",()=>"Feb").value!;
  const chart=resolveResourceBinding(scope,{dataRef:ref},"Chart",()=>"Feb").value!;
  expect(table.resource.version).toBe(chart.resource.version);expect(table.rows).toEqual(chart.rows);
  expect(chart.props.series[0].values).toEqual([20]);expect(chart.props.categories).toEqual(["Feb"]);
  const metric=resolveResourceBinding(scope,{dataRef:ref},"Stat",()=>"Feb").value!;expect(metric.props.value).toBe(20);
  expect(resolveResourceBinding(scope,{dataRef:{...ref,version:2}},"Table",()=>"Feb").ok).toBe(false);
  expect(resolveResourceBinding(scope,{dataRef:{id:"sales",column:"revenue",filters:[{column:"missing",op:"execute",value:{fromNode:"unset"}}]}},"Stat",()=>undefined)).toMatchObject({ok:false,error:{code:"FILTER"}});
  const selected=resolveResourceBinding(scope,{dataRef:{id:"sales",selectionNodeId:"selected",selectedOnly:true}},"Table",()=>["sales@1:1"]).value!;
  expect(selected.rows).toEqual([{month:"Feb",revenue:20}]);
  expect(resolveResourceBinding({...scope,surfaceId:"other"},{dataRef:ref},"Table",()=>"Feb").ok).toBe(false);
  clearResourceSession(scope.sessionId);
});
it("reuses safe math and strict split calculations without eval or silent invalid values",()=>{
  const values:Record<string,unknown>={amount:"100",people:3,a:12,b:4};
  expect(computeBoundValue({op:"split",amount:{fromNode:"amount"},people:{fromNode:"people"}},id=>values[id]).value).toBe("33.34 / 33.33 / 33.33");
  expect(computeBoundValue({op:"expression",expression:"a / b",inputs:{a:{fromNode:"a"},b:{fromNode:"b"}}},id=>values[id]).value).toBe(3);
  for(const expression of ["window.alert(1)","1 / 0","constructor()"])
    expect(computeBoundValue({op:"expression",expression,inputs:{}},()=>undefined).ok).toBe(false);
  expect(computeBoundValue({op:"split",amount:100,people:0},()=>undefined).ok).toBe(false);
});
