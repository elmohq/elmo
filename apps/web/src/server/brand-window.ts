import { bindReader } from "@/lib/analytics/bind-reader";
import * as brandWindow from "@/lib/analytics/brand-window";
import { pgReader } from "@/lib/analytics/pg-reader";

export type { BrandWindow } from "@/lib/analytics/brand-window";

export const resolveBrandWindow = bindReader(pgReader, brandWindow.resolveBrandWindow);
export const resolveBrandLookbackDays = bindReader(pgReader, brandWindow.resolveBrandLookbackDays);
