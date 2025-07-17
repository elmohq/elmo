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
  desktop: number | null;
  mobile: number | null;
}

export function filterAndCompleteChartData(
  chartData: ChartDataPoint[],
  lookback: LookbackPeriod
): ChartDataPoint[] {
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
      desktop: null,
      mobile: null
    };
  });
} 