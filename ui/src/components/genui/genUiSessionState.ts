import { clearLocalUiSession } from "./genUiLocalTreeStore";
import { genUiFormsStore } from "./genUiForms";
import { clearResourceSession } from "./resources/resourceStore";
import {clearUiActionSession} from "./uiActionState";
import {clearMapSession} from "./maps/mapStore";
import {clearMapActionSession} from "./maps/mapActions";
import {clearMapDetailsSession} from "./maps/mapDetailsState";
export function clearGenUiSession(sessionId:string){
  clearResourceSession(sessionId);clearLocalUiSession(sessionId);genUiFormsStore.clearSession(sessionId);
  clearUiActionSession(sessionId);
  clearMapSession(sessionId);clearMapActionSession(sessionId);clearMapDetailsSession(sessionId);
}
