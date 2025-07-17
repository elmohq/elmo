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

import * as React from "react"
import { Area, AreaChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts"
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
  { date: "2024-04-01", desktop: normalizeToPercentage(222), mobile: normalizeToPercentage(150) },
  { date: "2024-04-02", desktop: normalizeToPercentage(97), mobile: normalizeToPercentage(180) },
  { date: "2024-04-03", desktop: normalizeToPercentage(167), mobile: normalizeToPercentage(120) },
  { date: "2024-04-04", desktop: normalizeToPercentage(242), mobile: normalizeToPercentage(260) },
  { date: "2024-04-05", desktop: normalizeToPercentage(373), mobile: normalizeToPercentage(290) },
  { date: "2024-04-06", desktop: normalizeToPercentage(301), mobile: normalizeToPercentage(340) },
  { date: "2024-04-07", desktop: normalizeToPercentage(245), mobile: normalizeToPercentage(180) },
  { date: "2024-04-08", desktop: normalizeToPercentage(409), mobile: normalizeToPercentage(320) },
  { date: "2024-04-09", desktop: normalizeToPercentage(59), mobile: normalizeToPercentage(110) },
  { date: "2024-04-10", desktop: normalizeToPercentage(261), mobile: normalizeToPercentage(190) },
  { date: "2024-04-11", desktop: normalizeToPercentage(327), mobile: normalizeToPercentage(350) },
  { date: "2024-04-12", desktop: normalizeToPercentage(292), mobile: normalizeToPercentage(210) },
  { date: "2024-04-13", desktop: normalizeToPercentage(342), mobile: normalizeToPercentage(380) },
  { date: "2024-04-14", desktop: normalizeToPercentage(137), mobile: normalizeToPercentage(220) },
  { date: "2024-04-15", desktop: normalizeToPercentage(120), mobile: normalizeToPercentage(170) },
  { date: "2024-04-16", desktop: normalizeToPercentage(138), mobile: normalizeToPercentage(190) },
  { date: "2024-04-17", desktop: normalizeToPercentage(446), mobile: normalizeToPercentage(360) },
  { date: "2024-04-18", desktop: normalizeToPercentage(364), mobile: normalizeToPercentage(410) },
  { date: "2024-04-19", desktop: normalizeToPercentage(243), mobile: normalizeToPercentage(180) },
  { date: "2024-04-20", desktop: normalizeToPercentage(89), mobile: normalizeToPercentage(150) },
  { date: "2024-04-21", desktop: normalizeToPercentage(137), mobile: normalizeToPercentage(200) },
  { date: "2024-04-22", desktop: normalizeToPercentage(224), mobile: normalizeToPercentage(170) },
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


export function ChartAreaInteractive({ title, visibility }: { title: string; visibility: number }) {
    const [timeRange, setTimeRange] = React.useState("90d")
    const filteredData = chartData.filter((item) => {
      const date = new Date(item.date)
      const referenceDate = new Date("2024-06-30")
      let daysToSubtract = 90
      if (timeRange === "30d") {
        daysToSubtract = 30
      } else if (timeRange === "7d") {
        daysToSubtract = 7
      }
      const startDate = new Date(referenceDate)
      startDate.setDate(startDate.getDate() - daysToSubtract)
      return date >= startDate
    })

    const getBadgeVariant = (value: number) => {
      if (value > 75) return "default";
      if (value > 45) return "secondary";
      return "destructive";
    };

    return (
        <div className="flex-1 space-y-2">
            <div className="flex items-center justify-center gap-2">
                <h3 className="text-sm font-medium capitalize">
                    {title}
                </h3>
                <Badge 
                  variant={getBadgeVariant(visibility)} 
                  className={`text-xs ${
                    visibility > 75 ? 'bg-emerald-600 hover:bg-emerald-600 text-white' : 
                    visibility > 45 ? 'bg-amber-500 hover:bg-amber-500 text-white' : 
                    'bg-rose-500 hover:bg-rose-500 text-white'
                  }`}
                >
                    {visibility}%
                </Badge>
            </div>
            <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[250px] w-full"
          >
            <LineChart data={filteredData}>
              <defs>
                <linearGradient id="fillDesktop" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-desktop)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-desktop)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
                <linearGradient id="fillMobile" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-mobile)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-mobile)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
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
            />
            <Line
                dataKey="desktop"
                type="bump"
                stroke="var(--color-desktop)"
                strokeWidth={2}
                dot={false}
            />
              <ChartLegend content={<ChartLegendContent payload={[]} />} />
            </LineChart>
          </ChartContainer>
        </div>
    )
  }

export function PromptGroupChart() {
    // Calculate visibility scores for each demographic from latest data point
    const filteredData = chartData.filter((item) => {
      const date = new Date(item.date)
      const referenceDate = new Date("2024-06-30")
      const daysToSubtract = 90
      const startDate = new Date(referenceDate)
      startDate.setDate(startDate.getDate() - daysToSubtract)
      return date >= startDate
    })
    
    const lastDataPoint = filteredData[filteredData.length - 1];
    const menVisibility = lastDataPoint?.desktop || 0; // Desktop represents men
    const womenVisibility = lastDataPoint?.mobile || 0; // Mobile represents women

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
                    <ChartAreaInteractive title="men" visibility={menVisibility} />
                    <ChartAreaInteractive title="women" visibility={womenVisibility} />
                </div>
            </CardContent>
        </Card>
    );
}
