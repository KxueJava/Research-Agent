import {describe,it,expect} from "vitest";
import {renderToStaticMarkup} from "react-dom/server";
import {parseUiFeatures,UiFeaturesContextProvider,useUiFeatures,disabledUiFeatures,uiFeaturesUrl} from "./UiFeatures";
describe("release flags",()=>{
 it("resolves a separately hosted backend instead of assuming the dev proxy",()=>{
  expect(uiFeaturesUrl("https://api.example.invalid/")).toBe("https://api.example.invalid/api/agent/ui-features");
  expect(uiFeaturesUrl("")).toBe("/api/agent/ui-features");
 });
 it("rejects partial or string flags and only returns boolean metadata",()=>{
  expect(()=>parseUiFeatures({maps:false})).toThrow();expect(()=>parseUiFeatures({maps:"false",actions:true,streaming:true,planner:true})).toThrow();
  expect(parseUiFeatures({...disabledUiFeatures,secret:"not forwarded"})).toEqual(disabledUiFeatures);
 });
 it("applies independent flags without discarding historical content",()=>{
  function Probe(){const flags=useUiFeatures();return <p>{String(flags.streaming)} / {String(flags.maps)} 历史会话</p>}
  const html=renderToStaticMarkup(<UiFeaturesContextProvider value={{...disabledUiFeatures,streaming:true}}><Probe/></UiFeaturesContextProvider>);
  expect(html).toContain("true / false");expect(html).toContain("历史会话");
 });
});
