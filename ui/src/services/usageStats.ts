import api from "./index";
import type { AxiosRequestConfig } from "axios";

export type UsageRange = "today" | "7d" | "30d";

export interface UsageTotals {
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  requestCount: number;
}

export interface UsageTrendPoint {
  bucket: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  requestCount?: number;
}

export interface UsageRequest {
  timestamp: string;
  requestId?: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
  status: string;
  source?: string;
}

export interface UsageStatsResponse {
  range: UsageRange | "53w";
  totals: UsageTotals;
  trend: UsageTrendPoint[];
  requests: UsageRequest[];
}

export const usageStatsApi = {
  get: (range: UsageRange | "53w") =>
    api.get<UsageStatsResponse>("/api/agent/usage", { range }, {
      suppressErrorToast: true,
    } as AxiosRequestConfig & { suppressErrorToast: boolean }) as unknown as Promise<UsageStatsResponse>,
};
