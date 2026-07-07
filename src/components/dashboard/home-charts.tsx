"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import type { DashboardDay } from "@/lib/queries/dashboard";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const revenueConfig = {
  revenue: {
    label: "Revenue",
    color: "var(--chart-1)",
  },
} satisfies ChartConfig;

const creditsConfig = {
  creditsConsumed: {
    label: "Credits consumed",
    color: "var(--chart-2)",
  },
} satisfies ChartConfig;

function shortDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${value}T00:00:00Z`));
}

function ChartCard({
  title,
  total,
  children,
}: {
  title: string;
  total: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-4 rounded-xl border p-5">
      <div className="flex flex-col gap-0.5">
        <span className="text-[13px] font-medium text-muted-foreground">
          {title}
        </span>
        <span className="text-xl font-semibold tracking-tight tabular-nums">
          {total}
        </span>
      </div>
      {children}
    </div>
  );
}

const axisTick = { fontSize: 11 } as const;

export function DashboardCharts({
  data,
  revenueTotal,
  creditsTotal,
}: {
  data: DashboardDay[];
  revenueTotal: string;
  creditsTotal: string;
}) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard title="Revenue" total={revenueTotal}>
        <ChartContainer config={revenueConfig} className="h-52 w-full">
          <AreaChart data={data} margin={{ left: 0, right: 4, top: 4 }}>
            <defs>
              <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-revenue)"
                  stopOpacity={0.18}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-revenue)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
              tick={axisTick}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => `$${value}`}
              width={40}
              tick={axisTick}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => shortDate(String(value))}
                  formatter={(value) => `$${Number(value).toFixed(2)}`}
                />
              }
            />
            <Area
              dataKey="revenue"
              type="monotone"
              fill="url(#fillRevenue)"
              stroke="var(--color-revenue)"
              strokeWidth={1.75}
            />
          </AreaChart>
        </ChartContainer>
      </ChartCard>

      <ChartCard title="Credits consumed" total={creditsTotal}>
        <ChartContainer config={creditsConfig} className="h-52 w-full">
          <AreaChart data={data} margin={{ left: 0, right: 4, top: 4 }}>
            <defs>
              <linearGradient id="fillCredits" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor="var(--color-creditsConsumed)"
                  stopOpacity={0.18}
                />
                <stop
                  offset="100%"
                  stopColor="var(--color-creditsConsumed)"
                  stopOpacity={0.02}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="date"
              tickFormatter={shortDate}
              tickLine={false}
              axisLine={false}
              minTickGap={32}
              tick={axisTick}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={40}
              tick={axisTick}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(value) => shortDate(String(value))}
                />
              }
            />
            <Area
              dataKey="creditsConsumed"
              type="monotone"
              fill="url(#fillCredits)"
              stroke="var(--color-creditsConsumed)"
              strokeWidth={1.75}
            />
          </AreaChart>
        </ChartContainer>
      </ChartCard>
    </div>
  );
}
