export type LookbackPeriod = "1w" | "1m" | "3m" | "6m" | "1y" | "all";

export function getDaysFromLookback(lookback: LookbackPeriod): number {
  switch (lookback) {
    case "1w": return 7;
    case "1m": return 30;
    case "3m": return 90;
    case "6m": return 180;
    case "1y": return 365;
    case "all": return 365 * 2; // 2 years for "all"
  }
}

export function generateDateRange(startDate: Date, endDate: Date): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

// Function to normalize values from 0-500 range to 0-100% and round down to nearest 20%
export const normalizeToPercentage = (value: number): number => {
  const percentage = (value / 500) * 100;
  const roundedPercentage = Math.floor(percentage / 20) * 20;
  return Math.min(roundedPercentage, 100); // Ensure it never exceeds 100%
};

export function getBadgeVariant(value: number): "default" | "secondary" | "destructive" {
  if (value > 75) return "default";
  if (value > 45) return "secondary";
  return "destructive";
}

export function getBadgeClassName(value: number): string {
  if (value > 75) return 'bg-emerald-600 hover:bg-emerald-600 text-white';
  if (value > 45) return 'bg-amber-500 hover:bg-amber-500 text-white';
  return 'bg-rose-500 hover:bg-rose-500 text-white';
}

export interface ChartDataPoint {
  date: string;
  [key: string]: number | string | null; // Dynamic keys for brand/competitor IDs
}

import type { PromptRun, Brand, Competitor } from "@/lib/db/schema";

/**
 * Calculate visibility percentages for brand vs competitors from prompt runs
 */
export function calculateVisibilityPercentages(
  promptRuns: PromptRun[],
  brand: Brand,
  competitors: Competitor[],
  lookback: LookbackPeriod,
  userTimezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): ChartDataPoint[] {
  let startDate: Date;
  let endDate: Date;
  
  if (lookback === "all" && promptRuns.length > 0) {
    // For "all", use the actual data range from first to last prompt run
    const sortedRuns = [...promptRuns].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    const firstRun = sortedRuns[0];
    const lastRun = sortedRuns[sortedRuns.length - 1];
    
    startDate = new Date(firstRun.createdAt);
    endDate = new Date(lastRun.createdAt);
    
    // Convert to date-only (remove time component) in user's timezone
    const startDateString = startDate.toLocaleDateString('en-CA', { timeZone: userTimezone });
    const endDateString = endDate.toLocaleDateString('en-CA', { timeZone: userTimezone });
    startDate = new Date(startDateString);
    endDate = new Date(endDateString);
  } else {
    // For other lookback periods, use the existing logic
    const daysToSubtract = getDaysFromLookback(lookback);
    const referenceDate = new Date();
    startDate = new Date(referenceDate);
    startDate.setDate(startDate.getDate() - daysToSubtract);
    endDate = referenceDate;
  }
  
  // Generate complete date range for the lookback period
  const dateRange = generateDateRange(startDate, endDate);
  
  // Sort competitors alphabetically by name for consistent color assignment
  const sortedCompetitors = [...competitors].sort((a, b) => a.name.localeCompare(b.name));
  
  // Group prompt runs by date (in user's timezone)
  const runsByDate = promptRuns.reduce((acc, run) => {
    const runDate = new Date(run.createdAt);
    // Convert to user's timezone and get date string
    const dateKey = runDate.toLocaleDateString('en-CA', { timeZone: userTimezone }); // YYYY-MM-DD format
    
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(run);
    return acc;
  }, {} as Record<string, PromptRun[]>);
  
  // Calculate visibility percentages for each date
  return dateRange.map(date => {
    const runsForDate = runsByDate[date] || [];
    const totalRuns = runsForDate.length;
    
    const dataPoint: ChartDataPoint = { date };
    
    if (totalRuns === 0) {
      // Set null values for brand and all competitors
      dataPoint[brand.id] = null;
      sortedCompetitors.forEach(competitor => {
        dataPoint[competitor.id] = null;
      });
      return dataPoint;
    }
    
    // Calculate brand visibility percentage
    const brandMentions = runsForDate.filter(run => run.brandMentioned).length;
    const brandVisibility = Math.round((brandMentions / totalRuns) * 100);
    dataPoint[brand.id] = brandVisibility;
    
    // Calculate competitor visibility percentages
    sortedCompetitors.forEach(competitor => {
      const competitorMentions = runsForDate.filter(run => 
        run.competitorsMentioned && 
        run.competitorsMentioned.includes(competitor.name)
      ).length;
      const competitorVisibility = Math.round((competitorMentions / totalRuns) * 100);
      dataPoint[competitor.id] = competitorVisibility;
    });
    
    return dataPoint;
  });
}

/**
 * Calculate visibility percentages for individual prompts in a group
 */
export function calculateGroupVisibilityData(
  promptRuns: PromptRun[],
  prompts: Array<{ id: string; value: string; groupPrefix: string | null }>,
  brand: Brand,
  competitors: Competitor[],
  lookback: LookbackPeriod,
  userTimezone: string = Intl.DateTimeFormat().resolvedOptions().timeZone
): Array<{
  promptId: string;
  promptTitle: string;
  chartData: ChartDataPoint[];
  lastVisibility: number | null;
}> {
  return prompts.map(prompt => {
    // Filter runs for this specific prompt
    const promptSpecificRuns = promptRuns.filter(run => run.promptId === prompt.id);
    
    // Calculate chart data for this prompt
    const chartData = calculateVisibilityPercentages(
      promptSpecificRuns,
      brand,
      competitors,
      lookback,
      userTimezone
    );
    
    // Get the prompt title (remove group prefix if present)
    const promptTitle = prompt.groupPrefix 
      ? prompt.value.slice(prompt.groupPrefix.length).trim()
      : prompt.value;
    
    // Get last visibility value for the brand
    const lastDataPoint = chartData.filter(point => point[brand.id] !== null).pop();
    const lastVisibility = lastDataPoint?.[brand.id] as number | null ?? null;
    
    return {
      promptId: prompt.id,
      promptTitle,
      chartData,
      lastVisibility
    };
  });
}

/**
 * Get competitor color based on alphabetical position using white label colors
 */
export function getCompetitorColor(competitorName: string, competitors: Competitor[], whitelabelColors: string[]): string {
  const sortedCompetitors = [...competitors].sort((a, b) => a.name.localeCompare(b.name));
  const index = sortedCompetitors.findIndex(c => c.name === competitorName);
  
  // Start from index 1 (skip the first color which is for the brand)
  const colorIndex = (index + 1) % whitelabelColors.length;
  return whitelabelColors[colorIndex] || whitelabelColors[1];
}

/**
 * Get brand color (always first color in white label config)
 */
export function getBrandColor(whitelabelColors: string[]): string {
  return whitelabelColors[0];
}

export function filterAndCompleteChartData(
  chartData: ChartDataPoint[],
  lookback: LookbackPeriod
): ChartDataPoint[] {
  // For "all", return the data as-is since it already contains the correct range
  if (lookback === "all") {
    return chartData;
  }
  
  const daysToSubtract = getDaysFromLookback(lookback);
  const referenceDate = new Date();
  const startDate = new Date(referenceDate);
  startDate.setDate(startDate.getDate() - daysToSubtract);
  
  // Generate complete date range for the lookback period
  const dateRange = generateDateRange(startDate, referenceDate);
  
  // Filter existing data
  const filteredData = chartData.filter((item) => {
    const date = new Date(item.date);
    return date >= startDate && date <= referenceDate;
  });
  
  // Create a complete dataset with null values for missing dates
  return dateRange.map(date => {
    const existingData = filteredData.find(item => item.date === date);
    return existingData || {
      date,
      // Note: We can't set default values here since we don't know the keys
      // The calling code should handle missing data appropriately
    };
  });
} 

/**
 * Create a mapping from prompt IDs to their oldest web query (first alphabetically if multiple from same time)
 */
export function createPromptToWebQueryMapping(promptRuns: PromptRun[]): Record<string, string> {
  const promptToWebQuery: Record<string, string> = {};
  
  // Group prompt runs by prompt ID
  const promptRunsByPromptId = promptRuns.reduce((acc, run) => {
    if (!acc[run.promptId]) {
      acc[run.promptId] = [];
    }
    acc[run.promptId].push(run);
    return acc;
  }, {} as Record<string, PromptRun[]>);
  
  // For each prompt, find the oldest web query
  Object.entries(promptRunsByPromptId).forEach(([promptId, runs]) => {
    // Filter runs that have web queries
    const runsWithWebQueries = runs.filter(run => run.webQueries && run.webQueries.length > 0);
    
    if (runsWithWebQueries.length === 0) return;
    
    // Sort by creation date (oldest first)
    runsWithWebQueries.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    
    // Group by creation date to handle ties
    const oldestDate = runsWithWebQueries[0].createdAt;
    const oldestRuns = runsWithWebQueries.filter(run => 
      new Date(run.createdAt).getTime() === new Date(oldestDate).getTime()
    );
    
    // Get all web queries from the oldest runs and find first alphabetically
    const allWebQueries: string[] = [];
    oldestRuns.forEach(run => {
      if (run.webQueries) {
        allWebQueries.push(...run.webQueries);
      }
    });
    
    if (allWebQueries.length > 0) {
      // Sort alphabetically and take the first
      allWebQueries.sort();
      promptToWebQuery[promptId] = allWebQueries[0];
    }
  });
  
  return promptToWebQuery;
}

/**
 * Generate optimization URL for a prompt
 */
export function generateOptimizationUrl(
  promptValue: string,
  orgId: string,
  webSearchEnabled?: boolean,
  oldestWebQuery?: string
): string {
  const baseUrl = "https://app.whitelabel-client.com/search/create-aeo-funnel";
  
  // Determine which prompt to use
  let promptToEncode: string;
  if (webSearchEnabled && oldestWebQuery) {
    promptToEncode = oldestWebQuery;
  } else {
    promptToEncode = promptValue;
  }
  
  // URL encode the prompt
  const encodedPrompt = encodeURIComponent(promptToEncode);
  const encodedOrgId = encodeURIComponent(orgId);
  
  return `${baseUrl}?prompt=${encodedPrompt}&org_id=${encodedOrgId}`;
} 