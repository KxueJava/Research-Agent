export const artifactFrameKey = (doc: { surfaceId: string; revision: number }, run: number) => `${doc.surfaceId}:${doc.revision}:${run}`;
export function artifactRevisionOptions(latest: number, selected?: number) {
  const values = new Set([1, latest]);
  if (selected && selected >= 1 && selected <= latest) values.add(selected);
  for (let n = latest; n >= Math.max(1, latest - 49); n--) values.add(n);
  return [...values].sort((a, b) => b - a);
}
export const acceptArtifactResponse = (sequence: number, current: number, incoming: number, minimum: number) => sequence === current && incoming >= minimum;
