import {expect,it} from 'vitest';
import {recoverableNodes,safeRecoveryValue,recoveryDefaults} from './recoveryPolicy';
it('recovers opted-in numeric parameters and defaults without persisting undeclared or sensitive numbers',()=>{
 const tree={root:{kind:'Card',children:[
  {kind:'NumberInput',nodeId:'amount',props:{value:300,persistState:true}},
  {kind:'NumberInput',nodeId:'tip',props:{value:0,persistState:true}},
  {kind:'NumberInput',nodeId:'draft',props:{value:42}},
  {kind:'NumberInput',nodeId:'private',props:{value:123,persistState:true,sensitive:true}},
  {kind:'NumberInput',nodeId:'credential',props:{value:123,persistState:true}},
  {kind:'Card',props:{sensitive:true},children:[{kind:'NumberInput',nodeId:'nested',props:{value:1,persistState:true}}]}
 ]}};
 expect([...recoverableNodes(tree)].sort()).toEqual(['amount','tip']);
 expect(recoveryDefaults(tree)).toEqual({amount:300,tip:0});
});
it('restores declared filter/sort/selection while excluding sensitive and unrelated form fields',()=>{
 const tree={root:{kind:'Form',children:[{kind:'Select',nodeId:'month',props:{}},{kind:'Input',nodeId:'password',props:{type:'password'}},{kind:'Input',nodeId:'notes',props:{}},{kind:'Table',props:{dataRef:{filters:[{value:{fromNode:'month'}},{value:{fromNode:'password'}}],selectionNodeId:'selection'}}}]}};
 expect([...recoverableNodes(tree)].sort()).toEqual(['month','selection']);expect(safeRecoveryValue({password:'x'})).toBe(false);
 expect(safeRecoveryValue(['row1'])).toBe(true);expect(safeRecoveryValue('x'.repeat(513))).toBe(false);
});
it('restores declared defaults and empty selection when the server omits a previous local field',()=>{
 const tree={root:{kind:'Card',children:[{kind:'Select',nodeId:'month',props:{value:'',options:[]}},{kind:'Table',props:{dataRef:{filters:[{value:{fromNode:'month'}}],selectionNodeId:'selected'}}}]}};
 expect(recoveryDefaults(tree)).toEqual({month:'',selected:[]});
});
