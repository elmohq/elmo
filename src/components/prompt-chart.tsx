"use client"

import { WHITE_LABEL_CONFIG } from "@/lib/white-label";
import { IconExternalLink } from "@tabler/icons-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardFooter, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";
import { Badge } from "./ui/badge";

import * as React from "react"
import { Line, LineChart, CartesianGrid, XAxis, YAxis } from "recharts"
import {
  ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// Function to normalize values from 0-500 range to 0-100% and round down to nearest 20%
const normalizeToPercentage = (value: number): number => {
  const percentage = (value / 500) * 100;
  const roundedPercentage = Math.floor(percentage / 20) * 20;
  return Math.min(roundedPercentage, 100); // Ensure it never exceeds 100%
};

const chartData = [
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
const chartConfig = {
  visitors: {
    label: "Visitors",
  },
  desktop: {
    label: "Nike",
    color: WHITE_LABEL_CONFIG.chart_colors[0],
  },
  mobile: {
    label: "Asics",
    color: WHITE_LABEL_CONFIG.chart_colors[1],
  },
} satisfies ChartConfig

type LookbackPeriod = "1w" | "1m" | "3m" | "6m" | "1y" | "all";

function getDaysFromLookback(lookback: LookbackPeriod): number {
  switch (lookback) {
    case "1w": return 7;
    case "1m": return 30;
    case "3m": return 90;
    case "6m": return 180;
    case "1y": return 365;
    case "all": return 365 * 2; // 2 years for "all"
  }
}

function generateDateRange(startDate: Date, endDate: Date): string[] {
  const dates: string[] = [];
  const current = new Date(startDate);
  
  while (current <= endDate) {
    dates.push(current.toISOString().split('T')[0]);
    current.setDate(current.getDate() + 1);
  }
  
  return dates;
}

export function ChartAreaInteractive({ lookback }: { lookback: LookbackPeriod }) {
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
    const completeData = dateRange.map(date => {
      const existingData = filteredData.find(item => item.date === date);
      return existingData || {
        date,
        desktop: null,
        mobile: null
      };
    });
    
    return (
        <div className="relative flex-1">
            <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[250px] w-full"
          >
        <LineChart data={completeData}>
          <CartesianGrid vertical={false} />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            minTickGap={32}
            domain={['dataMin', 'dataMax']}
            type="category"
            tickFormatter={(value) => {
              const date = new Date(value)
              return date.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            }}
          />
          <YAxis
            domain={[0, (dataMax: number) => 100]}
            type="number"
            allowDataOverflow={false}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            tickCount={6}
            tickFormatter={(value) => `${value}%`}
          />
          <ChartTooltip
            cursor={false}
            content={
              <ChartTooltipContent
                labelFormatter={(value) => {
                  return new Date(value).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })
                }}
                indicator="dot"
                formatter={(value) => [`${value}%`, ""]}
              />
            }
          />
          <Line
            dataKey="mobile"
            type="bump"
            stroke="var(--color-mobile)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
          <Line
            dataKey="desktop"
            type="bump"
            stroke="var(--color-desktop)"
            strokeWidth={2}
            dot={false}
            connectNulls={false}
          />
          <ChartLegend content={<ChartLegendContent payload={[]} />} />
        </LineChart>
      </ChartContainer>
        </div>
    )
  }

export function PromptChart({ lookback = "1m" }: { lookback?: LookbackPeriod }) {
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
    
    const getBadgeVariant = (value: number) => {
      if (value > 75) return "default";
      if (value > 45) return "secondary";
      return "destructive";
    };

	return (
        <Card className="py-3 gap-3">
            <CardHeader className="flex justify-between items-center px-3">
                <CardTitle className="text-sm">best running shoes</CardTitle>
                <div className="flex items-center gap-2">
                    {lastDesktopValue !== null && (
                        <Badge 
                          variant={getBadgeVariant(lastDesktopValue)} 
                          className={`${
                            lastDesktopValue > 75 ? 'bg-emerald-600 hover:bg-emerald-600 text-white' : 
                            lastDesktopValue > 45 ? 'bg-amber-500 hover:bg-amber-500 text-white' : 
                            'bg-rose-500 hover:bg-rose-500 text-white'
                          }`}
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
                <ChartAreaInteractive lookback={lookback} />
            </CardContent>
        </Card>
    );
}
