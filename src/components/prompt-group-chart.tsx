"use client"

import { WHITE_LABEL_CONFIG } from "@/lib/white-label";
import { IconExternalLink, IconChevronDown } from "@tabler/icons-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardFooter, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";
import { Badge } from "./ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { BaseChart } from "./base-chart";
import { 
  LookbackPeriod, 
  normalizeToPercentage, 
  ChartDataPoint,
  getDaysFromLookback
} from "@/lib/chart-utils";

const chartData: ChartDataPoint[] = [
  { date: "2025-04-01", desktop: normalizeToPercentage(222), mobile: normalizeToPercentage(150) },
  { date: "2025-04-02", desktop: normalizeToPercentage(97), mobile: normalizeToPercentage(180) },
  { date: "2025-04-03", desktop: normalizeToPercentage(167), mobile: normalizeToPercentage(120) },
  { date: "2025-04-04", desktop: normalizeToPercentage(242), mobile: normalizeToPercentage(260) },
  { date: "2025-04-05", desktop: normalizeToPercentage(373), mobile: normalizeToPercentage(290) },
  { date: "2025-04-06", desktop: normalizeToPercentage(301), mobile: normalizeToPercentage(340) },
  { date: "2025-04-07", desktop: normalizeToPercentage(245), mobile: normalizeToPercentage(180) },
  { date: "2025-04-08", desktop: normalizeToPercentage(409), mobile: normalizeToPercentage(320) },
  { date: "2025-04-09", desktop: normalizeToPercentage(59), mobile: normalizeToPercentage(110) },
  { date: "2025-04-10", desktop: normalizeToPercentage(261), mobile: normalizeToPercentage(190) },
  { date: "2025-04-11", desktop: normalizeToPercentage(327), mobile: normalizeToPercentage(350) },
  { date: "2025-04-12", desktop: normalizeToPercentage(292), mobile: normalizeToPercentage(210) },
  { date: "2025-04-13", desktop: normalizeToPercentage(342), mobile: normalizeToPercentage(380) },
  { date: "2025-04-14", desktop: normalizeToPercentage(137), mobile: normalizeToPercentage(220) },
  { date: "2025-04-15", desktop: normalizeToPercentage(120), mobile: normalizeToPercentage(170) },
  { date: "2025-04-16", desktop: normalizeToPercentage(138), mobile: normalizeToPercentage(190) },
  { date: "2025-04-17", desktop: normalizeToPercentage(446), mobile: normalizeToPercentage(360) },
  { date: "2025-04-18", desktop: normalizeToPercentage(364), mobile: normalizeToPercentage(410) },
  { date: "2025-04-19", desktop: normalizeToPercentage(243), mobile: normalizeToPercentage(180) },
  { date: "2025-04-20", desktop: normalizeToPercentage(89), mobile: normalizeToPercentage(150) },
  { date: "2025-04-21", desktop: normalizeToPercentage(137), mobile: normalizeToPercentage(200) },
  { date: "2025-04-22", desktop: normalizeToPercentage(224), mobile: normalizeToPercentage(170) },
]

export function PromptGroupChart({ lookback = "1m", groupName }: { lookback?: LookbackPeriod; groupName?: string }) {
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
    const lastDataPoint = hasDataInPeriod ? filteredData[filteredData.length - 1] : null;
    const menVisibility = lastDataPoint?.desktop || null; // Desktop represents men
    const womenVisibility = lastDataPoint?.mobile || null; // Mobile represents women

	return (
        <Card className="py-3 gap-3">
            <CardHeader className="flex justify-between items-center px-3">
                <CardTitle className="text-sm">best running shoes for <span className="text-muted-foreground">{`<`}demographic{`>`}</span></CardTitle>
                <div className="flex items-center gap-2">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button size="sm" className="text-xs cursor-pointer p-0 m-0 h-6">
                                Optimize with {WHITE_LABEL_CONFIG.parent_name}
                                <IconChevronDown size={12} className="size-3 ml-0.5" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            <DropdownMenuItem className="cursor-pointer">
                                <div className="flex items-center justify-between w-full text-xs">
                                    <span>
                                        optimize <span className="text-muted-foreground">best running shoes for men</span>
                                    </span>
                                    <IconExternalLink size={12} className="size-3 ml-2" />
                                </div>
                            </DropdownMenuItem>
                            <DropdownMenuItem className="cursor-pointer">
                                <div className="flex items-center justify-between w-full text-xs">
                                    <span>
                                        optimize <span className="text-muted-foreground">best running shoes for women</span>
                                    </span>
                                    <IconExternalLink size={12} className="size-3 ml-2" />
                                </div>
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </CardHeader>
            <Separator className="py-0 my-0" />
            <CardContent className="px-3">
                <div className="flex gap-3">
                    <BaseChart 
                        data={chartData} 
                        lookback={lookback} 
                        title="men" 
                        visibility={menVisibility} 
                        showTitle={true} 
                        showBadge={true} 
                    />
                    <BaseChart 
                        data={chartData} 
                        lookback={lookback} 
                        title="women" 
                        visibility={womenVisibility} 
                        showTitle={true} 
                        showBadge={true} 
                    />
                </div>
            </CardContent>
        </Card>
    );
}
