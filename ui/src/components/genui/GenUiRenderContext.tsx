import { createContext, useContext, type ReactNode } from "react";
import type { GenUiActionContext } from "./genUiActionBus";

export type SurfaceSyncNotice={message:string;busy:boolean;retry:()=>void};
export type GenUiRenderContextValue = GenUiActionContext & {surfaceSync?:SurfaceSyncNotice};
export function genUiIdentity(value:GenUiRenderContextValue){
  return value.sessionId&&value.surfaceId?{sessionId:value.sessionId,surfaceId:value.surfaceId}:undefined;
}

const GenUiRenderContext = createContext<GenUiRenderContextValue>({});

export function GenUiRenderProvider({
  value,
  children,
}: {
  value: GenUiRenderContextValue;
  children: ReactNode;
}) {
  return (
    <GenUiRenderContext.Provider value={value}>
      {children}
    </GenUiRenderContext.Provider>
  );
}

export function useGenUiRenderContext(): GenUiRenderContextValue {
  return useContext(GenUiRenderContext);
}
