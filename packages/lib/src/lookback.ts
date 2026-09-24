import { z } from "zod";

export const LOOKBACK_PERIODS = ["1w", "1m", "3m", "6m", "1y", "all"] as const;
export const lookbackSchema = z.enum(LOOKBACK_PERIODS);
export type LookbackPeriod = z.infer<typeof lookbackSchema>;
