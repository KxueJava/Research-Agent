import type { SuggestedQuestion } from "@/utils/constants";
import type { AxiosRequestConfig } from "axios";
import api from "./index";

export async function loadSuggestedPrompts(productType: string, fallback: SuggestedQuestion[]): Promise<SuggestedQuestion[]> {
  if (productType !== "task") return fallback;
  try {
    const batch = await api.get<{ date: string | null; items: SuggestedQuestion[] }>(
      "/web/suggested-prompts", { productType },
      { suppressErrorToast: true } as AxiosRequestConfig,
    ) as unknown as { date: string | null; items: SuggestedQuestion[] };
    if (!Array.isArray(batch?.items) || batch.items.length !== 5) return fallback;
    const items = batch.items.map(item => ({ label: typeof item?.label === "string" ? item.label.trim() : "" }));
    if (items.some(item => !item.label || item.label.length > 120)
      || new Set(items.map(item => item.label)).size !== 5) return fallback;
    return items;
  } catch {
    return fallback;
  }
}
