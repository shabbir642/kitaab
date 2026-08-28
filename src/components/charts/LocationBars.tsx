"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_TICK, CURSOR_FILL, VizTooltip } from "./Tooltip";

/** Part-to-whole per location -> stacked horizontal bar (long category names).
 *  The 2px surface-coloured stroke is the gap between the two fills. */
export function LocationBars({
  data,
}: {
  data: { location: string; completed: number; open: number }[];
}) {
  const height = data.length * 30 + 56;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 12, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="var(--grid)" horizontal={false} />
          <XAxis
            type="number"
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={{ stroke: "var(--baseline)" }}
            allowDecimals={false}
          />
          <YAxis
            type="category"
            dataKey="location"
            width={112}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip cursor={{ fill: CURSOR_FILL }} content={VizTooltip} />
          <Legend
            verticalAlign="top"
            align="right"
            height={26}
            iconType="square"
            iconSize={10}
            wrapperStyle={{ fontSize: 11, color: "var(--ink-secondary)" }}
          />
          <Bar
            dataKey="completed"
            name="Completed"
            stackId="a"
            fill="var(--series-1)"
            stroke="var(--surface)"
            strokeWidth={2}
            barSize={18}
            isAnimationActive={false}
          />
          <Bar
            dataKey="open"
            name="Not completed"
            stackId="a"
            fill="var(--series-2)"
            stroke="var(--surface)"
            strokeWidth={2}
            barSize={18}
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
