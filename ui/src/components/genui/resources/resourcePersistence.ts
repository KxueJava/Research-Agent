import {scopeKey,type Scope,type Resource} from './types';
const writers=new Map<string,(resource:Resource)=>Promise<Resource>>();
export function registerResourcePersistence(scope:Scope,writer:(resource:Resource)=>Promise<Resource>){const key=scopeKey(scope);writers.set(key,writer);return()=>{if(writers.get(key)===writer)writers.delete(key)}}
export async function persistImportedResource(scope:Scope,resource:Resource){const writer=writers.get(scopeKey(scope));return {resource:writer?await writer(resource):resource,committed:Boolean(writer)}}
