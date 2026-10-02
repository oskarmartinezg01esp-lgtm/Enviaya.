"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const axis = { stroke: "#94A3B8", fontSize: 11, tickLine: false, axisLine: false } as const;
const tooltipStyle = { contentStyle: { background: "#0B111C", border: "1px solid rgba(148,163,184,.2)", borderRadius: 12, fontSize: 12 }, labelStyle: { color: "#94A3B8" } };
const eur = (v: number) => `${v.toLocaleString("es-ES", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €`;

export function SalesChart({ data }: { data: { date: string; ventas: number; pedidos: number }[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ left: -10, right: 8, top: 8 }}>
          <defs>
            <linearGradient id="sales" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#00AFFF" stopOpacity={0.45} />
              <stop offset="1" stopColor="#00AFFF" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(148,163,184,.08)" vertical={false} />
          <XAxis dataKey="date" {...axis} />
          <YAxis {...axis} tickFormatter={eur} width={60} />
          <Tooltip {...tooltipStyle} formatter={(v) => [eur(Number(v)), "Ventas"]} />
          <Area type="monotone" dataKey="ventas" stroke="#00E5FF" strokeWidth={2} fill="url(#sales)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function BarsChart({ data, x, y, color = "#00AFFF", label, horizontal = false, format }: { data: object[]; x: string; y: string; color?: string; label: string; horizontal?: boolean; format?: "eur" }) {
  const fmt = (v: number) => (format === "eur" ? eur(v) : String(v));
  return (
    <div className={horizontal ? "h-80" : "h-64"}>
      <ResponsiveContainer>
        {horizontal ? (
          <BarChart data={data} layout="vertical" margin={{ left: 10, right: 16 }}>
            <CartesianGrid stroke="rgba(148,163,184,.08)" horizontal={false} />
            <XAxis type="number" {...axis} />
            <YAxis type="category" dataKey={x} {...axis} width={150} />
            <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(255,255,255,.03)" }} formatter={(v) => [fmt(Number(v)), label]} />
            <Bar dataKey={y} fill={color} radius={[0, 6, 6, 0]} barSize={16} />
          </BarChart>
        ) : (
          <BarChart data={data} margin={{ left: -10, right: 8, top: 8 }}>
            <CartesianGrid stroke="rgba(148,163,184,.08)" vertical={false} />
            <XAxis dataKey={x} {...axis} />
            <YAxis {...axis} tickFormatter={fmt} width={format === "eur" ? 60 : 40} />
            <Tooltip {...tooltipStyle} cursor={{ fill: "rgba(255,255,255,.03)" }} formatter={(v) => [fmt(Number(v)), label]} />
            <Bar dataKey={y} fill={color} radius={[6, 6, 0, 0]} />
          </BarChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

const PIE = ["#00E5FF", "#7C3AED", "#0066FF", "#22D3A6"];
const SOURCE: Record<string, string> = { voice: "Voz", text: "Texto", ui: "Interfaz", repeat: "Repetidos" };

export function SourcePie({ data }: { data: { name: string; value: number }[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data.map((d) => ({ ...d, name: SOURCE[d.name] ?? d.name }))} dataKey="value" nameKey="name" innerRadius={60} outerRadius={90} paddingAngle={3} stroke="none">
            {data.map((_, i) => (
              <Cell key={i} fill={PIE[i % PIE.length]} />
            ))}
          </Pie>
          <Tooltip {...tooltipStyle} />
        </PieChart>
      </ResponsiveContainer>
      <div className="-mt-4 flex justify-center gap-4 text-xs text-muted">
        {data.map((d, i) => (
          <span key={d.name} className="flex items-center gap-1.5">
            <span className="size-2 rounded-full" style={{ background: PIE[i % PIE.length] }} /> {SOURCE[d.name] ?? d.name}: {d.value}
          </span>
        ))}
      </div>
    </div>
  );
}
