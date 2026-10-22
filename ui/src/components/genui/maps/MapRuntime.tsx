import {createContext,useContext,type ReactNode} from "react";
import {loadAmapSdk} from "./amapLoader";
import {getMapConfiguration} from "@/services/maps";
const runtime={loadSdk:loadAmapSdk,configuration:getMapConfiguration};
const Context=createContext(runtime);
/** Provider injection is used by explicit test fixtures; production always uses official AMap. */
export function MapRuntimeProvider({value,children}:{value:typeof runtime;children:ReactNode}){return <Context.Provider value={value}>{children}</Context.Provider>;}
export const useMapRuntime=()=>useContext(Context);
