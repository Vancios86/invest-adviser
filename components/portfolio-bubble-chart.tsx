"use client";

import { useId, useMemo, useState, type CSSProperties } from "react";
import { hierarchy, pack } from "d3-hierarchy";
import { Group } from "@visx/group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  formatCurrency,
  formatPercent,
} from "@/lib/portfolio";
import type { AggregatedBubble } from "@/lib/types";

type PortfolioBubbleChartProps = {
  bubbles: AggregatedBubble[];
  width?: number;
  height?: number;
  onAnalyze?: (symbol: string) => void;
};

type PackedNode = {
  x: number;
  y: number;
  r: number;
  data: {
    symbol?: string;
    value?: number;
    bubble?: AggregatedBubble;
  };
};

type TooltipState = {
  bubble: AggregatedBubble;
  x: number;
  y: number;
} | null;

const CHART_HEIGHT = 560;
const MAX_INTENSITY_PCT = 50;

type BubblePalette = {
  base: string;
  mid: string;
  deep: string;
  glow: string;
  stroke: string;
  highlight: string;
};

type Star = {
  cx: number;
  cy: number;
  r: number;
  opacity: number;
};

function starUnit(seed: number): number {
  const mixed =
    (Math.imul(seed ^ (seed >>> 15), 2246822519) ^
      Math.imul(seed ^ (seed >>> 13), 3266489917)) >>>
    0;
  return mixed / 4294967296;
}

function generateStars(count: number, width: number, height: number): Star[] {
  return Array.from({ length: count }, (_, i) => {
    const cx = starUnit(i * 374761393 + 668265263) * width;
    const cy = starUnit(i * 668265263 + 374761393) * height;
    const sizeRoll = Math.floor(starUnit(i * 1274126177 + 105886331) * 10);
    const r = sizeRoll === 0 ? 1.4 : sizeRoll <= 2 ? 1 : 0.55;
    const opacity = 0.12 + starUnit(i * 1597334677 + 429496729) * 0.5;
    return { cx, cy, r, opacity };
  });
}

function hashSymbol(symbol: string): number {
  let hash = 0;
  for (let i = 0; i < symbol.length; i++) {
    hash = symbol.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

function getFloatStyle(symbol: string): CSSProperties {
  const hash = hashSymbol(symbol);
  const amp = 6 + (hash % 10);
  const duration = 14 + (hash % 16);
  const delay = -(hash % 24);

  return {
    ["--float-x1" as string]: `${((hash % 7) - 3) * amp * 0.25}px`,
    ["--float-y1" as string]: `${(((hash >> 3) % 7) - 3) * amp * 0.25}px`,
    ["--float-x2" as string]: `${(((hash >> 6) % 9) - 4) * amp * 0.35}px`,
    ["--float-y2" as string]: `${(((hash >> 9) % 9) - 4) * amp * 0.35}px`,
    ["--float-x3" as string]: `${(((hash >> 12) % 7) - 3) * amp * 0.3}px`,
    ["--float-y3" as string]: `${(((hash >> 15) % 7) - 3) * amp * 0.3}px`,
    animationDuration: `${duration}s`,
    animationDelay: `${delay}s`,
  };
}

function getBubblePalette(
  gainLossPct: number | null,
  isPositive: boolean | null,
): BubblePalette {
  const absPct =
    gainLossPct !== null ? Math.min(Math.abs(gainLossPct), 100) : 0;
  const intensity = Math.min(absPct / MAX_INTENSITY_PCT, 1);

  if (gainLossPct === null || absPct < 0.5) {
    return {
      base: "rgba(148, 163, 184, 0.22)",
      mid: "rgba(148, 163, 184, 0.38)",
      deep: "rgba(100, 116, 139, 0.55)",
      glow: "rgba(148, 163, 184, 0.35)",
      stroke: "rgba(226, 232, 240, 0.55)",
      highlight: "rgba(255, 255, 255, 0.65)",
    };
  }

  if (isPositive) {
    const sat = 55 + intensity * 40;
    const light = 72 - intensity * 18;
    const deepLight = 48 - intensity * 12;
    return {
      base: `hsla(152, ${sat}%, ${light}%, 0.28)`,
      mid: `hsla(152, ${sat + 5}%, ${light - 8}%, 0.48)`,
      deep: `hsla(148, ${sat + 10}%, ${deepLight}%, 0.72)`,
      glow: `hsla(152, ${sat + 15}%, ${light + 5}%, ${0.25 + intensity * 0.45})`,
      stroke: `hsla(152, ${sat + 20}%, ${light + 12}%, ${0.55 + intensity * 0.35})`,
      highlight: `rgba(255, 255, 255, ${0.45 + intensity * 0.35})`,
    };
  }

  const sat = 75 + intensity * 22;
  const light = 68 - intensity * 16;
  const deepLight = 46 - intensity * 10;
  return {
    base: `hsla(4, ${sat}%, ${light}%, 0.28)`,
    mid: `hsla(4, ${sat + 4}%, ${light - 8}%, 0.48)`,
    deep: `hsla(0, ${sat + 8}%, ${deepLight}%, 0.72)`,
    glow: `hsla(4, ${sat + 12}%, ${light + 4}%, ${0.25 + intensity * 0.45})`,
    stroke: `hsla(4, ${sat + 18}%, ${light + 10}%, ${0.55 + intensity * 0.35})`,
    highlight: `rgba(255, 255, 255, ${0.4 + intensity * 0.3})`,
  };
}

export function PortfolioBubbleChart({
  bubbles,
  width = 800,
  height = CHART_HEIGHT,
  onAnalyze,
}: PortfolioBubbleChartProps) {
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const filterId = useId().replace(/:/g, "");
  const stars = useMemo(
    () => generateStars(110, width, height),
    [width, height],
  );

  const packedNodes = useMemo(() => {
    const pricedBubbles = bubbles.filter(
      (b) => b.currentValue !== null && b.currentValue > 0,
    );

    if (pricedBubbles.length === 0) return [];

    type PackDatum = {
      symbol?: string;
      value?: number;
      bubble?: AggregatedBubble;
      children?: PackDatum[];
    };

    const data: PackDatum = {
      children: pricedBubbles.map((bubble) => ({
        symbol: bubble.symbol,
        value: bubble.currentValue ?? 0,
        bubble,
      })),
    };

    const root = hierarchy<PackDatum>(data)
      .sum((d) => d.value ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    const layout = pack<PackDatum>()
      .size([width - 4, height - 4])
      .padding(6);

    const packed = layout(root);
    return packed.leaves() as PackedNode[];
  }, [bubbles, width, height]);

  if (bubbles.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portfolio allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[360px] items-center justify-center rounded-lg border border-dashed text-muted-foreground">
            Add your first stock to see the bubble chart
          </div>
        </CardContent>
      </Card>
    );
  }

  if (packedNodes.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Portfolio allocation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex h-[360px] items-center justify-center rounded-lg border border-dashed text-muted-foreground">
            Waiting for live prices to render bubbles
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Portfolio allocation</CardTitle>
      </CardHeader>
      <CardContent className="relative overflow-hidden rounded-xl p-0">
        <svg
          width="100%"
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="overflow-visible"
        >
          <defs>
            <radialGradient id={`${filterId}-space-bg`} cx="50%" cy="40%" r="75%">
              <stop offset="0%" stopColor="#1e293b" />
              <stop offset="55%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#020617" />
            </radialGradient>
            <filter
              id={`${filterId}-glass-glow`}
              x="-50%"
              y="-50%"
              width="200%"
              height="200%"
            >
              <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <rect
            x={0}
            y={0}
            width={width}
            height={height}
            rx={12}
            fill={`url(#${filterId}-space-bg)`}
          />

          {stars.map((star, i) => (
            <circle
              key={`star-${i}`}
              cx={star.cx}
              cy={star.cy}
              r={star.r}
              fill="white"
              opacity={star.opacity}
            />
          ))}

          <Group top={2} left={2}>
            {packedNodes.map((node) => {
              const bubble = node.data.bubble;
              if (!bubble) return null;
              const palette = getBubblePalette(
                bubble.gainLossPct,
                bubble.isPositive,
              );
              const gradientId = `${filterId}-grad-${bubble.symbol}`;
              const showSymbol = node.r > 26;
              const showPct = node.r > 20;
              const symbolSize = Math.min(node.r / 2.6, 15);
              const pctSize = Math.min(node.r / 3.2, 12);
              const pctLabel =
                bubble.gainLossPct !== null
                  ? formatPercent(bubble.gainLossPct)
                  : "—";
              const labelFill =
                bubble.gainLossPct !== null && Math.abs(bubble.gainLossPct) >= 0.5
                  ? "rgba(255, 255, 255, 0.95)"
                  : "rgba(226, 232, 240, 0.9)";
              const labelShadow = { textShadow: "0 1px 6px rgba(0,0,0,0.45)" };

              return (
                <g
                  key={bubble.symbol}
                  transform={`translate(${node.x}, ${node.y})`}
                  onMouseEnter={() =>
                    setTooltip({
                      bubble,
                      x: node.x,
                      y: node.y,
                    })
                  }
                  onMouseLeave={() => setTooltip(null)}
                  onClick={() => onAnalyze?.(bubble.symbol)}
                  className="cursor-pointer"
                >
                  <defs>
                    <radialGradient id={gradientId} cx="35%" cy="30%" r="70%">
                      <stop offset="0%" stopColor={palette.highlight} />
                      <stop offset="28%" stopColor={palette.base} />
                      <stop offset="62%" stopColor={palette.mid} />
                      <stop offset="100%" stopColor={palette.deep} />
                    </radialGradient>
                  </defs>

                  <g
                    className="bubble-float"
                    style={getFloatStyle(bubble.symbol)}
                  >
                    <circle
                      r={node.r + 3}
                      fill={palette.glow}
                      opacity={0.55}
                      filter={`url(#${filterId}-glass-glow)`}
                    />
                    <circle
                      r={node.r}
                      fill={`url(#${gradientId})`}
                      stroke={palette.stroke}
                      strokeWidth={1.5}
                    />
                    <circle
                      r={node.r}
                      fill="none"
                      stroke="white"
                      strokeWidth={0.75}
                      opacity={0.12}
                    />
                    {(showSymbol || showPct) && (
                      <text
                        textAnchor="middle"
                        pointerEvents="none"
                        style={labelShadow}
                      >
                        {showSymbol && (
                          <tspan
                            x={0}
                            dy={showPct ? "-0.55em" : "0.35em"}
                            fill={labelFill}
                            fontSize={symbolSize}
                            fontWeight={600}
                          >
                            {bubble.symbol}
                          </tspan>
                        )}
                        {showPct && (
                          <tspan
                            x={0}
                            dy={showSymbol ? "1.15em" : "0.35em"}
                            fill={labelFill}
                            fontSize={pctSize}
                            fontWeight={500}
                            opacity={0.92}
                          >
                            {pctLabel}
                          </tspan>
                        )}
                      </text>
                    )}
                  </g>
                  <title>
                    {`${bubble.symbol}\n` +
                      `Weight: ${bubble.portfolioWeight?.toFixed(1) ?? "—"}%\n` +
                      `Gain/Loss: ${bubble.gainLossPct !== null ? formatPercent(bubble.gainLossPct) : "—"}`}
                  </title>
                </g>
              );
            })}
          </Group>
        </svg>

        {tooltip && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border bg-popover px-3 py-2 text-sm text-popover-foreground shadow-md"
            style={{
              left: `${Math.min((tooltip.x / width) * 100, 75)}%`,
              top: `${Math.min((tooltip.y / height) * 100, 70)}%`,
            }}
          >
            <p className="font-semibold">{tooltip.bubble.symbol}</p>
            <p className="text-muted-foreground">
              {tooltip.bubble.shares} shares
            </p>
            <p>
              Avg cost: {formatCurrency(tooltip.bubble.avgPurchasePrice)}
            </p>
            <p>
              Live:{" "}
              {tooltip.bubble.livePrice !== null
                ? formatCurrency(tooltip.bubble.livePrice)
                : "—"}
            </p>
            <p>
              Value:{" "}
              {tooltip.bubble.currentValue !== null
                ? formatCurrency(tooltip.bubble.currentValue)
                : "—"}
            </p>
            <p>
              Weight:{" "}
              {tooltip.bubble.portfolioWeight !== null
                ? `${tooltip.bubble.portfolioWeight.toFixed(1)}%`
                : "—"}
            </p>
            <p
              className={
                tooltip.bubble.isPositive ? "text-green-500" : "text-red-500"
              }
            >
              {tooltip.bubble.gainLossPct !== null
                ? formatPercent(tooltip.bubble.gainLossPct)
                : "—"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
