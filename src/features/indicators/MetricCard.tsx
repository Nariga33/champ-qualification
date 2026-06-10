import { Card } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";

interface Props {
  label: string;
  value: string;
  secondary?: string;
  icon: LucideIcon;
  accent?: "primary" | "emerald" | "amber" | "rose" | "cyan" | "violet";
}

const ACCENT: Record<NonNullable<Props["accent"]>, string> = {
  primary: "bg-primary",
  emerald: "bg-emerald-500",
  amber: "bg-amber-500",
  rose: "bg-rose-500",
  cyan: "bg-cyan-500",
  violet: "bg-violet-500",
};

export function MetricCard({ label, value, secondary, icon: Icon, accent = "primary" }: Props) {
  return (
    <Card className="relative overflow-hidden border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight tabular-nums">{value}</p>
          {secondary && <p className="mt-1 text-xs text-muted-foreground">{secondary}</p>}
        </div>
        <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
      </div>
      <div className={`absolute inset-x-0 bottom-0 h-1 ${ACCENT[accent]}`} />
    </Card>
  );
}
