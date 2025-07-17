"use client"

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
import { Badge } from "./ui/badge"
import { WHITE_LABEL_CONFIG } from "@/lib/white-label"
import { 
  LookbackPeriod, 
  ChartDataPoint, 
  filterAndCompleteChartData,
  getBadgeVariant,
  getBadgeClassName
} from "@/lib/chart-utils"

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

interface BaseChartProps {
  data: ChartDataPoint[];
  lookback: LookbackPeriod;
  title?: string;
  visibility?: number | null;
  showTitle?: boolean;
  showBadge?: boolean;
}

export function BaseChart({ 
  data, 
  lookback, 
  title, 
  visibility, 
  showTitle = false, 
  showBadge = false 
}: BaseChartProps) {
  const completeData = filterAndCompleteChartData(data, lookback);

  return (
    <div className="flex-1 space-y-2">
      {showTitle && (
        <div className="flex items-center justify-center gap-2">
          {title && (
            <h3 className="text-sm font-medium capitalize">
              {title}
            </h3>
          )}
          {showBadge && visibility !== null && (
            <Badge 
              variant={getBadgeVariant(visibility!)} 
              className={`text-xs ${getBadgeClassName(visibility!)}`}
            >
              {visibility}%
            </Badge>
          )}
        </div>
      )}
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
                formatter={(value, name, item, index) => {
                  const indicatorColor = item.payload.fill || item.color;
                  return (
                    <>
                      <div
                        className="shrink-0 rounded-[2px] h-2.5 w-2.5"
                        style={{
                          backgroundColor: indicatorColor,
                        }}
                      />
                      <div className="flex flex-1 justify-between leading-none items-center">
                        <div className="grid gap-1.5">
                          <span className="text-muted-foreground">
                            {chartConfig[name as keyof typeof chartConfig]?.label || name}
                          </span>
                        </div>
                        {value !== null && value !== undefined && (
                          <span className="text-foreground font-mono font-medium tabular-nums">
                            {value}%
                          </span>
                        )}
                      </div>
                    </>
                  )
                }}
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