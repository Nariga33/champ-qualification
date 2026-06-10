export type OperationFilter = "all" | "outbound" | "inbound";
export type ScopeFilter = "me" | "all";

export interface IndicatorMetrics {
  total: number;
  answered: number;
  notAnswered: number;
  hitRate: number; // 0..1
  talkedSec: number;
  tma: number; // seconds
  costCents: number;
  totalExtensions: number;
  emptyTariffs: number;
  goodTariffs: number;
  firstTs: string | null;
  lastTs: string | null;
  perExtension: Array<{ extension: string; total: number; answered: number; talkedSec: number }>;
}

export interface IndicatorMeta {
  pages: number;
  rawCount: number;
  pageLimit: number;
  sawFullPage: boolean;
  period: { from: string; to: string };
  opFilter: OperationFilter;
  scope: string;
  extensionFilter: string | null;
  isAdmin: boolean;
}

export interface IndicatorResponse {
  metrics: IndicatorMetrics;
  meta: IndicatorMeta;
}

export interface IndicatorFilters {
  from: string; // ISO
  to: string; // ISO
  operation: OperationFilter;
  scope: ScopeFilter;
  extension?: string | null;
}

export type PeriodPreset = "today" | "yesterday" | "last7" | "last30" | "month" | "custom";

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  last7: "Últimos 7 dias",
  last30: "Últimos 30 dias",
  month: "Mês atual",
  custom: "Personalizado",
};

export function presetRange(p: PeriodPreset): { from: Date; to: Date } {
  const now = new Date();
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  const startOf = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  switch (p) {
    case "today": return { from: startOf(now), to: end };
    case "yesterday": {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      const s = startOf(y); const e = new Date(y); e.setHours(23, 59, 59, 999);
      return { from: s, to: e };
    }
    case "last7": {
      const s = new Date(now); s.setDate(s.getDate() - 6); return { from: startOf(s), to: end };
    }
    case "last30": {
      const s = new Date(now); s.setDate(s.getDate() - 29); return { from: startOf(s), to: end };
    }
    case "month": {
      const s = new Date(now.getFullYear(), now.getMonth(), 1); return { from: startOf(s), to: end };
    }
    default: return { from: startOf(now), to: end };
  }
}

export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "00:00:00";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

export function formatPct(v: number): string {
  return `${(v * 100).toFixed(1).replace(".", ",")}%`;
}

export function formatBRL(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
