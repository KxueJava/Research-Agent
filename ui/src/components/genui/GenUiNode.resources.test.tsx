import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {expect,it} from "vitest";
import GenUiNode from "./GenUiNode";
it("renders a valid zero metric rather than an empty successful result",()=>{
  const html=renderToStaticMarkup(createElement(GenUiNode,{node:{kind:"Stat",nodeId:"zero",props:{label:"空筛选总额",value:0}}}));
  expect(html).toMatch(/>0<\/div>/);
});
