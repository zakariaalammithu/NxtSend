"use client";

import * as React from "react";

// ResponsiveContainer
export interface ResponsiveContainerProps {
  width?: string | number;
  height?: string | number;
  aspect?: number;
  children: React.ReactNode;
  className?: string;
}

export const ResponsiveContainer: React.FC<ResponsiveContainerProps> = ({
  width = "100%",
  height = 300,
  children,
  className,
}) => {
  return (
    <div
      className={className}
      style={{
        width: typeof width === "number" ? `${width}px` : width,
        height: typeof height === "number" ? `${height}px` : height,
        position: "relative",
      }}
    >
      {children}
    </div>
  );
};

export type ChartDataPoint = Record<string, string | number>;

// Tooltip
export interface TooltipContentProps {
  active?: boolean;
  payload?: Array<{ name?: string; value?: string | number; color?: string }>;
  label?: string | number;
}

export interface TooltipProps {
  content?: React.ReactNode | ((props: TooltipContentProps) => React.ReactNode);
  cursor?: boolean | object;
}

export const Tooltip: React.FC<TooltipProps> = () => null;

// XAxis & YAxis
export interface AxisProps {
  dataKey?: string;
  stroke?: string;
  fontSize?: number;
  tickLine?: boolean;
  axisLine?: boolean;
  tickFormatter?: (value: string | number) => string;
}

export const XAxis: React.FC<AxisProps> = () => null;
export const YAxis: React.FC<AxisProps> = () => null;

// CartesianGrid
export interface CartesianGridProps {
  strokeDasharray?: string;
  stroke?: string;
  vertical?: boolean;
}

export const CartesianGrid: React.FC<CartesianGridProps> = () => null;

// Legend
export const Legend: React.FC<Record<string, unknown>> = () => null;

// Bar & BarChart
export interface BarProps {
  dataKey: string;
  fill?: string;
  radius?: number | [number, number, number, number];
  name?: string;
}

export const Bar: React.FC<BarProps> = () => null;

export interface BarChartProps {
  data?: ChartDataPoint[];
  margin?: { top?: number; right?: number; bottom?: number; left?: number };
  children?: React.ReactNode;
}

export const BarChart: React.FC<BarChartProps> = ({ data = [], children }) => {
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);

  // Extract Bar configs from children
  const bars: BarProps[] = [];
  let xAxisKey = "name";

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      if (child.type === Bar) {
        bars.push(child.props as BarProps);
      } else if (child.type === XAxis && child.props.dataKey) {
        xAxisKey = child.props.dataKey;
      }
    }
  });

  if (!data || data.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-13 text-black-400">
        No chart data available
      </div>
    );
  }

  // Find max value across all bars
  let maxVal = 1;
  data.forEach((d) => {
    bars.forEach((b) => {
      const val = Number(d[b.dataKey]) || 0;
      if (val > maxVal) maxVal = val;
    });
  });
  maxVal = Math.ceil(maxVal * 1.15) || 10;

  return (
    <div className="relative h-full w-full select-none font-sans">
      {/* Grid Lines */}
      <div className="absolute inset-x-0 top-5 bottom-8 flex flex-col justify-between pointer-events-none opacity-20">
        <div className="border-b border-black-500 w-full" />
        <div className="border-b border-black-500 w-full" />
        <div className="border-b border-black-500 w-full" />
        <div className="border-b border-black-500 w-full" />
      </div>

      {/* Main Bar Chart Container */}
      <div className="flex h-full w-full items-end gap-2 sm:gap-4 px-2 pb-7 pt-4">
        {data.map((item, idx) => {
          const isHovered = hoveredIdx === idx;
          const label = item[xAxisKey] ?? `Item ${idx + 1}`;

          return (
            <div
              key={idx}
              className="group relative flex flex-1 flex-col items-center h-full justify-end"
              onMouseEnter={() => setHoveredIdx(idx)}
              onMouseLeave={() => setHoveredIdx(null)}
            >
              {/* Tooltip on hover */}
              {isHovered && (
                <div className="absolute -top-12 z-30 flex flex-col items-center rounded-lg bg-black-800 border border-black-600 px-3 py-1.5 shadow-xl text-12 whitespace-nowrap pointer-events-none">
                  <span className="font-semibold text-white">{label}</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    {bars.map((b, bIdx) => (
                      <span key={bIdx} style={{ color: b.fill || "#642cff" }}>
                        {b.name || b.dataKey}: <strong>{item[b.dataKey] ?? 0}</strong>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Bar Group */}
              <div className="flex items-end gap-1 w-full justify-center h-[170px]">
                {bars.map((bar, bIdx) => {
                  const val = Number(item[bar.dataKey]) || 0;
                  const barHeightPct = Math.max(
                    (val / maxVal) * 100,
                    val > 0 ? 4 : 0
                  );
                  return (
                    <div
                      key={bIdx}
                      style={{
                        height: `${barHeightPct}%`,
                        backgroundColor: bar.fill || (bIdx === 0 ? "#642cff" : "#ff4d00"),
                      }}
                      className="w-full max-w-[20px] rounded-t-md transition-all duration-300 hover:brightness-125"
                    />
                  );
                })}
              </div>

              {/* X Axis Label */}
              <span className="absolute -bottom-6 text-11 font-medium text-black-400 group-hover:text-white truncate max-w-full">
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Line & LineChart
export interface LineProps {
  type?: "monotone" | "linear";
  dataKey: string;
  stroke?: string;
  strokeWidth?: number;
  dot?: boolean | object;
  name?: string;
}

export const Line: React.FC<LineProps> = () => null;

export interface LineChartProps {
  data?: ChartDataPoint[];
  children?: React.ReactNode;
}

export const LineChart: React.FC<LineChartProps> = ({ data = [], children }) => {
  const [hoveredIdx, setHoveredIdx] = React.useState<number | null>(null);

  const lines: LineProps[] = [];
  let xAxisKey = "name";

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child)) {
      if (child.type === Line) {
        lines.push(child.props as LineProps);
      } else if (child.type === XAxis && child.props.dataKey) {
        xAxisKey = child.props.dataKey;
      }
    }
  });

  if (!data || data.length === 0) {
    return (
      <div className="flex h-full w-full items-center justify-center text-13 text-black-400">
        No chart data available
      </div>
    );
  }

  let maxVal = 1;
  data.forEach((d) => {
    lines.forEach((l) => {
      const val = Number(d[l.dataKey]) || 0;
      if (val > maxVal) maxVal = val;
    });
  });
  maxVal = Math.ceil(maxVal * 1.15) || 10;

  const width = 600;
  const height = 200;
  const paddingX = 40;
  const paddingY = 20;
  const chartW = width - paddingX * 2;
  const chartH = height - paddingY * 2;

  const pointsForLine = (dataKey: string) => {
    return data.map((d, i) => {
      const x = paddingX + (i / Math.max(data.length - 1, 1)) * chartW;
      const val = Number(d[dataKey]) || 0;
      const y = height - paddingY - (val / maxVal) * chartH;
      return { x, y, val };
    });
  };

  return (
    <div className="relative h-full w-full select-none">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-full overflow-visible"
        preserveAspectRatio="none"
      >
        {/* Horizontal grid lines */}
        {[0, 0.33, 0.66, 1].map((pct, i) => {
          const y = paddingY + pct * chartH;
          return (
            <line
              key={i}
              x1={paddingX}
              y1={y}
              x2={width - paddingX}
              y2={y}
              stroke="#2a2942"
              strokeDasharray="4 4"
            />
          );
        })}

        {/* Lines */}
        {lines.map((line, lIdx) => {
          const pts = pointsForLine(line.dataKey);
          const pathD = pts.reduce((acc, p, i) => {
            return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
          }, "");

          return (
            <g key={lIdx}>
              <path
                d={pathD}
                fill="none"
                stroke={line.stroke || (lIdx === 0 ? "#642cff" : "#ff4d00")}
                strokeWidth={line.strokeWidth || 2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {pts.map((p, pIdx) => (
                <circle
                  key={pIdx}
                  cx={p.x}
                  cy={p.y}
                  r={hoveredIdx === pIdx ? 5 : 3.5}
                  fill={line.stroke || "#642cff"}
                  stroke="#070614"
                  strokeWidth={2}
                  className="transition-all duration-200 cursor-pointer"
                  onMouseEnter={() => setHoveredIdx(pIdx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                />
              ))}
            </g>
          );
        })}
      </svg>

      {/* Hover Info & X Labels */}
      <div className="flex justify-between px-6 pt-2 text-11 text-black-400">
        {data.map((item, idx) => (
          <span
            key={idx}
            className={`transition-colors ${hoveredIdx === idx ? "text-white font-semibold" : ""}`}
          >
            {item[xAxisKey]}
          </span>
        ))}
      </div>

      {hoveredIdx !== null && data[hoveredIdx] && (
        <div className="absolute top-2 right-4 rounded-lg bg-black-800 border border-black-600 px-3 py-1.5 shadow-xl text-12">
          <div className="font-semibold text-white">{data[hoveredIdx][xAxisKey]}</div>
          {lines.map((l, i) => (
            <div key={i} style={{ color: l.stroke || "#642cff" }}>
              {l.name || l.dataKey}: {data[hoveredIdx][l.dataKey]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// Pie & PieChart & Cell
export interface CellProps {
  fill?: string;
}

export const Cell: React.FC<CellProps> = () => null;

export interface PieProps {
  data: ChartDataPoint[];
  dataKey: string;
  nameKey?: string;
  cx?: string | number;
  cy?: string | number;
  innerRadius?: number;
  outerRadius?: number;
  children?: React.ReactNode;
}

export const Pie: React.FC<PieProps> = () => null;

export interface PieChartProps {
  children?: React.ReactNode;
}

export const PieChart: React.FC<PieChartProps> = ({ children }) => {
  let pieData: ChartDataPoint[] = [];
  let dataKey = "value";
  let nameKey = "name";
  let colors: string[] = ["#642cff", "#ff4d00", "#10b981", "#3b82f6"];

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && child.type === Pie) {
      const pieProps = child.props as PieProps;
      pieData = pieProps.data || [];
      dataKey = pieProps.dataKey || "value";
      nameKey = pieProps.nameKey || "name";

      const cellColors: string[] = [];
      React.Children.forEach(pieProps.children, (c) => {
        if (React.isValidElement(c) && c.type === Cell && c.props.fill) {
          cellColors.push(c.props.fill);
        }
      });
      if (cellColors.length > 0) colors = cellColors;
    }
  });

  const total = pieData.reduce((acc, d) => acc + (Number(d[dataKey]) || 0), 0) || 1;

  // Render SVG Donut Chart
  let currentAngle = 0;
  const radius = 60;
  const strokeWidth = 24;
  const center = 90;

  return (
    <div className="flex flex-col sm:flex-row items-center justify-center gap-6 h-full w-full">
      <div className="relative h-[180px] w-[180px] shrink-0">
        <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90">
          {pieData.map((d, i) => {
            const val = Number(d[dataKey]) || 0;
            const fraction = val / total;
            const circumference = 2 * Math.PI * radius;
            const strokeDasharray = `${fraction * circumference} ${circumference}`;
            const strokeDashoffset = -currentAngle * circumference;
            currentAngle += fraction;
            const color = colors[i % colors.length];

            return (
              <circle
                key={i}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={color}
                strokeWidth={strokeWidth}
                strokeDasharray={strokeDasharray}
                strokeDashoffset={strokeDashoffset}
                className="transition-all duration-300 hover:opacity-80"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-20 font-bold text-white">{total}</span>
          <span className="text-11 text-black-400">Total</span>
        </div>
      </div>

      <div className="flex flex-col gap-2.5">
        {pieData.map((d, i) => {
          const color = colors[i % colors.length];
          const val = Number(d[dataKey]) || 0;
          const pct = Math.round((val / total) * 100);
          return (
            <div key={i} className="flex items-center gap-2.5 text-13">
              <span
                className="h-3 w-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-black-300 font-medium">{d[nameKey]}:</span>
              <span className="font-semibold text-white">
                {val} ({pct}%)
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
