"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  LabelList,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_TICK, CURSOR_FILL, VizTooltip } from "./Tooltip";

/** Magnitude across the stages of one phase. The stages have a natural order,
 *  so the axis keeps pipeline order rather than sorting by size - and a single
 *  hue is used throughout (a value-ramp here would double-encode bar length). */
export function StatusBars({
  data,
  seriesLabel,
}: {
  data: { status: string; count: number }[];
  seriesLabel: string;
}) {
  const height = data.length * 30 + 30;
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 34, bottom: 0, left: 0 }}>
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
            dataKey="status"
            width={104}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip cursor={{ fill: CURSOR_FILL }} content={VizTooltip} />
          <Bar
            dataKey="count"
            name={seriesLabel}
            fill="var(--series-1)"
            barSize={16}
            radius={[0, 4, 4, 0]}
            isAnimationActive={false}
          >
            <LabelList
              dataKey="count"
              position="right"
              offset={6}
              style={{ fill: "var(--ink-secondary)", fontSize: 11 }}
            />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
