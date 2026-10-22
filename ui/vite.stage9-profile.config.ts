import {defineConfig,mergeConfig} from 'vite';
import path from 'node:path';
import projectConfig from './vite.config';

// Isolated production-mode acceptance entry; does not overwrite the application's dist.
export default defineConfig(async environment=>{
 const base=typeof projectConfig==='function'?await projectConfig(environment):projectConfig;
 return mergeConfig(base,{
  publicDir:false,
  define:{SERVICE_BASE_URL:JSON.stringify(''),RESEARCH_TOOL_BASE_URL:JSON.stringify('')},
  build:{
   outDir:'node_modules/.cache/stage9-profile',
   emptyOutDir:true,
   rollupOptions:{input:path.resolve(__dirname,'tests/browser/stage9.html')}
  }
 });
});
