/** Include every prop, including session-level projections that update older rounds. */
export function equalDialogueProps<T extends object>(previous:T,next:T):boolean {
  const keys=Object.keys(previous) as Array<keyof T>;
  return keys.length===Object.keys(next).length && keys.every(key=>Object.is(previous[key],next[key]));
}
