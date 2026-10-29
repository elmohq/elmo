import { bindReader } from "@/lib/analytics/bind-reader";
import { pgReader } from "@/lib/analytics/pg-reader";
import * as resolution from "@/lib/analytics/prompt-resolution";

export type { ResolvedPrompt } from "@/lib/analytics/prompt-resolution";
export { parseTagFilter } from "@/lib/analytics/prompt-resolution";

export const resolveFilteredPrompts = bindReader(pgReader, resolution.resolveFilteredPrompts);
