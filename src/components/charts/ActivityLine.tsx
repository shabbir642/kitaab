"use client";

import {
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMonth } from "@/lib/utils";
import { AXIS_TICK, makeVizTooltip } from "./Tooltip";

/** Labels only the final point of a series - a number on every point is noise.
 *  The rest of the values live in the tooltip and the card's table view. */
function endLabel(text: string, lastIndex: number) {
  return function EndLabel(props: {
    x?: number | string;
    y?: number | string;
    index?: number;
  }) {
    if (props.index !== lastIndex) return null;
    return (
      <text
        x={Number(props.x) - 4}
        y={Number(props.y) - 8}
        textAnchor="end"
        style={{ fill: "var(--ink-secondary)", fontSize: 11 }}
      >
        {text}
      </text>
    );
  };
}

/** Two series over time -> categorical slots 1 and 2, on ONE axis (both are
 *  record counts, so no second scale is needed or honest). Linear segments:
 *  these are discrete monthly counts, and a spline would invent motion between
 *  them. */
export function ActivityLine({
  data,
}: {
  data: { month: string; surveys: number; completions: number }[];
}) {
  const last = data.length - 1;
  return (
    <div style={{ height: 260 }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="var(--grid)" vertical={false} />
          <XAxis
            dataKey="month"
            tickFormatter={formatMonth}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: "var(--baseline)" }}
            minTickGap={12}
          />
          <YAxis
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            allowDecimals={false}
            width={44}
          />
          <Tooltip
            cursor={{ stroke: "var(--baseline)", strokeWidth: 1 }}
            content={makeVizTooltip(formatMonth)}
          />
          <Legend
            verticalAlign="top"
            align="left"
            height={26}
            iconType="plainline"
            iconSize={12}
            wrapperStyle={{ fontSize: 11, color: "var(--ink-secondary)", paddingLeft: 44 }}
          />
          <Line
            type="linear"
            dataKey="surveys"
            name="Surveys"
            stroke="var(--series-1)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
            isAnimationActive={false}
          >
            <LabelList content={endLabel("Surveys", last)} />
          </Line>
          <Line
            type="linear"
            dataKey="completions"
            name="Completions"
            stroke="var(--series-2)"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, strokeWidth: 2, stroke: "var(--surface)" }}
            isAnimationActive={false}
          >
            <LabelList content={endLabel("Completions", last)} />
          </Line>
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
