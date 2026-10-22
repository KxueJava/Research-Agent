import { beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { clearResourceSession, getResource, putResource, resourceSnapshot } from "./resourceStore";
import { parseCsvResource } from "./csvResource";
import { aggregateRows, selectRows, splitMoney, toCents, formatCents } from "./selectors";
const scope={sessionId:"test-s",surfaceId:"a"};
const csv=readFileSync(new URL("../../../../../docs/intelligent-ui/stage-0/fixtures/sales.csv",import.meta.url),"utf8");
const expected=JSON.parse(readFileSync(new URL("../../../../../docs/intelligent-ui/stage-0/fixtures/sales-expected.json",import.meta.url),"utf8"));
const input=()=>({id:"sales",version:1,source:{type:"upload" as const,name:"sales.csv",resourceKey:"stored-key"},collectedAt:"2026-10-19T00:00:00Z",...parseCsvResource(csv,["quantity","unit_price","revenue"]).value!});
beforeEach(()=>clearResourceSession("test-s"));
describe("versioned Surface resources",()=>{
  it('hydrates a pinned historical version even after the latest is cached',()=>{
    expect(putResource(scope,{...input(),version:3},true).ok).toBe(true);
    expect(putResource(scope,{...input(),version:2},true).ok).toBe(true);
    expect(getResource(scope,'sales',2)?.version).toBe(2);expect(getResource(scope,'sales')?.version).toBe(3);
  });
  it("restores authoritative latest versions with a bounded ten-version cache",()=>{
    for(let version=1;version<=10;version++)expect(putResource(scope,{...input(),version}).ok).toBe(true);
    expect(putResource(scope,{...input(),version:11}).ok).toBe(false);
    expect(putResource(scope,{...input(),version:11},true).ok).toBe(true);
    expect(getResource(scope,"sales")?.version).toBe(11);
    expect(getResource(scope,"sales",1)).toBeUndefined();
    expect(getResource(scope,"sales",2)?.version).toBe(2);
  });
  it("isolates sessions/surfaces and does not accept rollback or conflicting same version",()=>{
    const a=putResource(scope,input());expect(a.ok).toBe(true);
    expect(getResource({...scope,surfaceId:"b"},"sales")).toBeUndefined();
    expect(getResource({...scope,sessionId:"other"},"sales")).toBeUndefined();
    expect(putResource(scope,input()).value).toBe(a.value);
    expect(putResource(scope,{...input(),rows:[]})).toMatchObject({ok:false,error:{code:"VERSION_CONFLICT"}});
    expect(putResource(scope,{...input(),version:2}).ok).toBe(true);
    expect(putResource(scope,input())).toMatchObject({ok:false,error:{code:"STALE_VERSION"}});
    expect(getResource(scope,"sales",1)?.version).toBe(1);
    expect(Object.isFrozen(getResource(scope,"sales")!.rows[0])).toBe(true);
  });
  it("rejects unsafe/non-scalar rows and clears only requested session",()=>{
    expect(putResource(scope,{...input(),rows:[{__proto__:null,revenue:NaN}]}).ok).toBe(false);
    putResource(scope,input());putResource({...scope,sessionId:"other"},input());
    const revision=resourceSnapshot();clearResourceSession(scope.sessionId);
    expect(resourceSnapshot()).toBeGreaterThan(revision);expect(getResource(scope,"sales")).toBeUndefined();
    expect(getResource({...scope,sessionId:"other"},"sales")).toBeDefined();clearResourceSession("other");
  });
});
describe("CSV and declared selectors",()=>{
  it("does not hide empty records or lose decimal cents during conversion and summation",()=>{
    expect(parseCsvResource("name,amount\nx,1\n,\ny,2\n",["amount"]).ok).toBe(false);
    expect(parseCsvResource("amount\n90071992547409.91",["amount"]).ok).toBe(false);
    expect(aggregateRows([{v:"90071992547409.91"},{v:"0.02"},{v:"-90071992547409.91"}],"v","sum",true).value).toBe(0.02);
  });
  it("derives sales expectations from original CSV, sharing filtered rows across views",()=>{
    const resource=putResource(scope,input()).value!;
    const actualTotal=aggregateRows(resource.rows,"revenue","sum",true).value!;
    expect(actualTotal).toBe(expected.totalRevenue);
    for(const [product,total] of Object.entries(expected.productRevenue)){
      const productRows=selectRows(resource,{filters:[{column:"product",op:"eq",value:product}]}).value!.rows;
      expect(aggregateRows(productRows,"revenue","sum",true).value).toBe(total);
      const [numerator,denominator]=expected.productShare[product].split("/").map(Number);
      expect(aggregateRows(productRows,"revenue","sum",true).value!/actualTotal).toBeCloseTo(numerator/denominator);
    }
    const actualMonths:Record<string,number>={};
    for(const [month,total] of Object.entries(expected.monthlyRevenue)){
      const selected=selectRows(resource,{filters:[{column:"month",op:"eq",value:month}],sort:{column:"revenue",direction:"desc"}}).value!;
      expect(aggregateRows(selected.rows,"revenue","sum",true).value).toBe(total);
      actualMonths[month]=aggregateRows(selected.rows,"revenue","sum",true).value!;
      expect(Number(selected.rows[0].revenue)).toBeGreaterThanOrEqual(Number(selected.rows[1].revenue));
    }
    expect(actualTotal/Object.keys(actualMonths).length).toBe(expected.averageMonthlyRevenue);
    const months=Object.entries(actualMonths);
    for(let i=1;i<months.length;i++)expect((months[i][1]-months[i-1][1])/months[i-1][1]).toBeCloseTo(expected.monthOverMonth[months[i][0]]);
    expect(selectRows(resource,{filters:[{column:"month",op:"execute",value:"x"}]} as any).ok).toBe(false);
    expect(selectRows(resource,{sort:{column:"missing",direction:"asc"}}).ok).toBe(false);
    const empty=selectRows(resource,{filters:[{column:"month",op:"eq",value:"missing"}]}).value!;
    expect(empty.rows).toEqual([]);expect(aggregateRows(empty.rows,"revenue","sum",true).value).toBe(0);
    expect(aggregateRows(empty.rows,"revenue","avg")).toMatchObject({ok:false,error:{code:"EMPTY"}});
    expect(aggregateRows([{revenue:"bad"}],"revenue","sum").ok).toBe(false);
    expect(aggregateRows([{revenue:-100},{revenue:40}],"revenue","sum",true).value).toBe(-60);
  });
  it("handles quoted CSV, BOM, CRLF, duplicate headers and malformed numeric cells",()=>{
    expect(parseCsvResource('\uFEFFlabel,value\r\n"a,b",1.25\r\n"line\nnext",2\r\n',["value"]).value?.rows[0]).toEqual({label:"a,b",value:1.25});
    for(const bad of ['a,a\n1,2','a,b\n1','a\n"unclosed','__proto__\nx','a\n"x"tail'])expect(parseCsvResource(bad).ok).toBe(false);
    for(const bad of ["n\nNaN","n\nInfinity","n\n ","n\nbad"])expect(parseCsvResource(bad,["n"]).ok).toBe(false);
  });
  it("rounds decimal money in cents, distributes remainder and rejects invalid split inputs",()=>{
    expect(toCents("1.005").value).toBe(101);expect(toCents("-1.005").value).toBe(-101);
    expect(toCents(0.1+0.2).value).toBe(30);
    const split=splitMoney("100.00",3).value!;expect(split.sharesCents).toEqual([3334,3333,3333]);
    expect(split.sharesCents.reduce((a,b)=>a+b,0)).toBe(split.totalCents);
    for(const [amount,people] of [[1,0],[-1,3],[NaN,3],[1,1.5],[1,""],["",3]])expect(splitMoney(amount,people).ok).toBe(false);
    expect(toCents("999999999999999999999").ok).toBe(false);
    expect(formatCents(9007199254740991)).toBe("90071992547409.91");
  });
  it("includes percentage tips with integer-cent rounding and rejects invalid rates",()=>{
    const bill=splitMoney(300,4,10).value!;expect(bill.tipCents).toBe(3000);expect(bill.totalCents).toBe(33000);expect(bill.sharesCents).toEqual([8250,8250,8250,8250]);
    expect(splitMoney('0.05',3,10).value?.sharesCents).toEqual([2,2,2]);expect(splitMoney(0,3,100).value?.totalCents).toBe(0);
    for(const tip of [-1,101,'',NaN,'0.0000001'])expect(splitMoney(300,3,tip).ok).toBe(false);
  });
});
