export const REASONING_LEVELS = ["low", "medium", "high", "max", "ultra"] as const;
export type ThinkingEffort = (typeof REASONING_LEVELS)[number] | null;

export function supportsModelThinking(modelName?: string, modelId?: string, supported?: number, declaredLevels?: readonly string[]) {
  if (declaredLevels?.length || supported === 1) return true;
  // Legacy model records default to 0 even when capability was never configured.
  // Do not treat that default as conclusive evidence against known reasoning models.
  return /gpt-5|gpt-6|grok|o1|o3|o4|reason|r1/i.test(`${modelName ?? ""} ${modelId ?? ""}`);
}

export function getReasoningLevels(modelName?: string, modelId?: string, declaredLevels?: readonly string[]) {
  if (declaredLevels?.length) {
    // Keep the slider ordered and drop unknown values instead of inventing
    // additional levels that the configured provider did not declare.
    return REASONING_LEVELS.filter((level) => declaredLevels.includes(level));
  }
  const model = `${modelName ?? ""} ${modelId ?? ""}`;
  return /luna/i.test(model)
    ? REASONING_LEVELS.filter((level) => level !== "ultra")
    : REASONING_LEVELS;
}

export function normalizeReasoningEffort(
  effort: ThinkingEffort,
  levels: readonly (typeof REASONING_LEVELS)[number][],
): ThinkingEffort {
  if (effort && levels.includes(effort)) return effort;
  if (!levels.length) return null;
  if (effort) {
    const requestedIndex = REASONING_LEVELS.indexOf(effort);
    const lower = levels.filter((level) => REASONING_LEVELS.indexOf(level) <= requestedIndex);
    return lower[lower.length - 1] ?? levels[0];
  }
  return levels.includes("medium") ? "medium" : levels[levels.length - 1];
}
