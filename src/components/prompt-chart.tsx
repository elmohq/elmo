"use client"

import { WHITE_LABEL_CONFIG } from "@/lib/white-label";
import { IconExternalLink } from "@tabler/icons-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardFooter, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";
import { Badge } from "./ui/badge";
import { BaseChart } from "./base-chart";
import { 
  LookbackPeriod, 
  normalizeToPercentage, 
  ChartDataPoint,
  getDaysFromLookback,
  getBadgeVariant,
  getBadgeClassName
} from "@/lib/chart-utils";

const chartData: ChartDataPoint[] = [
  { date: "2025-04-30", desktop: normalizeToPercentage(454), mobile: normalizeToPercentage(380) },
  { date: "2025-05-01", desktop: normalizeToPercentage(165), mobile: normalizeToPercentage(220) },
  { date: "2025-05-02", desktop: normalizeToPercentage(293), mobile: normalizeToPercentage(310) },
  { date: "2025-05-03", desktop: normalizeToPercentage(247), mobile: normalizeToPercentage(190) },
  { date: "2025-05-04", desktop: normalizeToPercentage(385), mobile: normalizeToPercentage(420) },
  { date: "2025-05-05", desktop: normalizeToPercentage(481), mobile: normalizeToPercentage(390) },
  { date: "2025-05-06", desktop: normalizeToPercentage(498), mobile: normalizeToPercentage(520) },
  { date: "2025-05-07", desktop: normalizeToPercentage(388), mobile: normalizeToPercentage(300) },
  { date: "2025-05-08", desktop: normalizeToPercentage(149), mobile: normalizeToPercentage(210) },
  { date: "2025-05-09", desktop: normalizeToPercentage(227), mobile: normalizeToPercentage(180) },
  { date: "2025-05-10", desktop: normalizeToPercentage(293), mobile: normalizeToPercentage(330) },
  { date: "2025-05-11", desktop: normalizeToPercentage(335), mobile: normalizeToPercentage(270) },
  { date: "2025-05-12", desktop: normalizeToPercentage(197), mobile: normalizeToPercentage(240) },
  { date: "2025-05-13", desktop: normalizeToPercentage(197), mobile: normalizeToPercentage(160) },
  { date: "2025-05-14", desktop: normalizeToPercentage(448), mobile: normalizeToPercentage(490) },
  { date: "2025-05-15", desktop: normalizeToPercentage(473), mobile: normalizeToPercentage(380) },
  { date: "2025-05-16", desktop: normalizeToPercentage(338), mobile: normalizeToPercentage(400) },
  { date: "2025-05-17", desktop: normalizeToPercentage(499), mobile: normalizeToPercentage(420) },
  { date: "2025-05-18", desktop: normalizeToPercentage(315), mobile: normalizeToPercentage(350) },
  { date: "2025-05-19", desktop: normalizeToPercentage(235), mobile: normalizeToPercentage(180) },
  { date: "2025-05-20", desktop: normalizeToPercentage(177), mobile: normalizeToPercentage(230) },
  { date: "2025-05-21", desktop: normalizeToPercentage(82), mobile: normalizeToPercentage(140) },
  { date: "2025-05-22", desktop: normalizeToPercentage(81), mobile: normalizeToPercentage(120) },
  { date: "2025-05-23", desktop: normalizeToPercentage(252), mobile: normalizeToPercentage(290) },
  { date: "2025-05-24", desktop: normalizeToPercentage(294), mobile: normalizeToPercentage(220) },
  { date: "2025-05-25", desktop: normalizeToPercentage(201), mobile: normalizeToPercentage(250) },
  { date: "2025-05-26", desktop: normalizeToPercentage(213), mobile: normalizeToPercentage(170) },
  { date: "2025-05-27", desktop: normalizeToPercentage(420), mobile: normalizeToPercentage(460) },
  { date: "2025-05-28", desktop: normalizeToPercentage(233), mobile: normalizeToPercentage(190) },
  { date: "2025-05-29", desktop: normalizeToPercentage(78), mobile: normalizeToPercentage(130) },
  { date: "2025-05-30", desktop: normalizeToPercentage(340), mobile: normalizeToPercentage(280) },
  { date: "2025-05-31", desktop: normalizeToPercentage(178), mobile: normalizeToPercentage(230) },
  { date: "2025-06-01", desktop: normalizeToPercentage(178), mobile: normalizeToPercentage(200) },
  { date: "2025-06-02", desktop: normalizeToPercentage(470), mobile: normalizeToPercentage(410) },
]

export function PromptChart({ lookback = "1m", promptName }: { lookback?: LookbackPeriod; promptName?: string }) {
    const daysToSubtract = getDaysFromLookback(lookback);
    const referenceDate = new Date();
    const startDate = new Date(referenceDate);
    startDate.setDate(startDate.getDate() - daysToSubtract);
    
    // Filter data for the lookback period
    const filteredData = chartData.filter((item) => {
      const date = new Date(item.date);
      return date >= startDate && date <= referenceDate;
    });
    
    // Check if there's any actual data (not null values) in the filtered period
    const hasDataInPeriod = filteredData.some(item => item.desktop !== null && item.mobile !== null);
    const lastDesktopValue = hasDataInPeriod ? (filteredData[filteredData.length - 1]?.desktop || 0) : null;

	return (
        <Card className="py-3 gap-3">
            <CardHeader className="flex justify-between items-center px-3">
                <CardTitle className="text-sm">best running shoes</CardTitle>
                <div className="flex items-center gap-2">
                    {lastDesktopValue !== null && (
                        <Badge 
                          variant={getBadgeVariant(lastDesktopValue)} 
                          className={getBadgeClassName(lastDesktopValue)}
                        >
                            {lastDesktopValue}% Visibility
                        </Badge>
                    )}
                    <Button size="sm" className="text-xs cursor-pointer p-0 m-0 h-6">
                        Optimize with {WHITE_LABEL_CONFIG.parent_name}
                        <IconExternalLink size={12} className="size-3 ml-0.5" />
                    </Button>
                </div>
            </CardHeader>
            <Separator className="py-0 my-0" />
            <CardContent className="px-3">
                <BaseChart data={chartData} lookback={lookback} />
            </CardContent>
        </Card>
    );
}
