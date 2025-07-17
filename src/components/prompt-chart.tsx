"use client"

import { WHITE_LABEL_CONFIG } from "@/lib/white-label";
import { IconExternalLink } from "@tabler/icons-react";
import { Button } from "./ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "./ui/card";
import { Separator } from "./ui/separator";
import { Badge } from "./ui/badge";
import { Skeleton } from "./ui/skeleton";
import { BaseChart } from "./base-chart";
import { useCompetitors, useBrand } from "@/hooks/use-brands";
import { usePromptRuns } from "@/hooks/use-prompt-runs";
import { 
  LookbackPeriod, 
  getBadgeVariant,
  getBadgeClassName,
  calculateVisibilityPercentages
} from "@/lib/chart-utils";

interface PromptChartProps {
  lookback: LookbackPeriod;
  promptName: string;
  promptId: string;
  brandId?: string;
}

export function PromptChart({ 
  lookback = "1m", 
  promptName, 
  promptId, 
  brandId 
}: PromptChartProps) {
  const { competitors, isLoading: competitorsLoading } = useCompetitors(brandId);
  const { brand, isLoading: brandLoading } = useBrand(brandId);
  const { promptRuns, isLoading: runsLoading } = usePromptRuns(brandId, { lookback });
  
  const isLoading = competitorsLoading || runsLoading || brandLoading;
  
  // Filter prompt runs for this specific prompt
  const promptSpecificRuns = promptRuns?.filter(run => run.promptId === promptId) || [];
  
  // Check if we have no prompt runs after loading is complete
  const hasNoRuns = !isLoading && promptSpecificRuns.length === 0;
  
  // Calculate chart data from real prompt runs
  const chartData = (isLoading || !brand) ? [] : calculateVisibilityPercentages(
    promptSpecificRuns,
    brand,
    competitors,
    lookback
  );
  
  // Get the last visibility value for the badge (brand visibility)
  const lastDataPoint = chartData.filter(point => brand && point[brand.id] !== null).pop();
  const lastBrandVisibility = (lastDataPoint && brand) ? lastDataPoint[brand.id] as number : null;

  if (isLoading || !brand) {
    return (
      <Card className="py-3 gap-3">
        <CardHeader className="flex justify-between items-center px-3">
          <CardTitle className="text-sm">{promptName}</CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              Loading...
            </Badge>
          </div>
        </CardHeader>
        <Separator className="py-0 my-0" />
        <CardContent className="pl-0 pr-6">
          <div className="h-[250px] flex items-center justify-center text-muted-foreground">
            Loading chart data...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (hasNoRuns) {
    return (
      <Card className="py-3 gap-3">
        <CardHeader className="flex justify-between items-center px-3">
          <CardTitle className="text-sm">{promptName}</CardTitle>
        </CardHeader>
        <Separator className="py-0 my-0" />
        <CardContent className="px-3">
          <div className="relative">
            <Skeleton className="h-[250px] w-full" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-sm text-muted-foreground">Evaluating prompt for the first time...</span>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="py-3 gap-3">
      <CardHeader className="flex justify-between items-center px-3">
        <CardTitle className="text-sm">{promptName}</CardTitle>
        <div className="flex items-center gap-2">
          {lastBrandVisibility !== null && (
            <Badge 
              variant={getBadgeVariant(lastBrandVisibility)} 
              className={getBadgeClassName(lastBrandVisibility)}
            >
              {lastBrandVisibility}% Visibility
            </Badge>
          )}
          <Button size="sm" className="text-xs cursor-pointer p-0 m-0 h-6">
            Optimize with {WHITE_LABEL_CONFIG.parent_name}
            <IconExternalLink size={12} className="size-3 ml-0.5" />
          </Button>
        </div>
      </CardHeader>
      <Separator className="py-0 my-0" />
      <CardContent className="pl-0 pr-6">
        <BaseChart 
          data={chartData} 
          lookback={lookback}
          brand={brand}
          competitors={competitors}
          isAnimationActive={false}
        />
      </CardContent>
    </Card>
  );
}
