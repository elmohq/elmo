import { bindReader } from "@/lib/analytics/bind-reader";
import * as core from "@/lib/analytics/core";
import { pgReader } from "@/lib/analytics/pg-reader";

export type * from "@/lib/analytics/core";

export const getBrandVisibility = bindReader(pgReader, core.getBrandVisibility);
export const getBrandShareOfVoice = bindReader(pgReader, core.getBrandShareOfVoice);
export const getBrandCitationUrls = bindReader(pgReader, core.getBrandCitationUrls);
export const getBrandCitationDomains = bindReader(pgReader, core.getBrandCitationDomains);
export const getBrandFanoutQueries = bindReader(pgReader, core.getBrandFanoutQueries);
export const getBrandQueryFanout = bindReader(pgReader, core.getBrandQueryFanout);
export const getBrandPromptPerformance = bindReader(pgReader, core.getBrandPromptPerformance);
export const getBrandMentionQuality = bindReader(pgReader, core.getBrandMentionQuality);
export const getBrandAnalytics = bindReader(pgReader, core.getBrandAnalytics);
export const getCompetitiveLandscape = bindReader(pgReader, core.getCompetitiveLandscape);
export const getBrandSentiment = bindReader(pgReader, core.getBrandSentiment);
