import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Phone, PhoneIncoming, PhoneMissed, Target, Clock, Timer, Users, BarChart3,
  RefreshCw, AlertTriangle, Inbox,
} from "lucide-react";
import { MetricCard } from "./MetricCard";
import {
  PERIOD_LABELS, presetRange, formatDuration, formatPct, formatBRL,
  type IndicatorResponse, type OperationFilter, type ScopeFilter, type PeriodPreset,
} from "./types";

interface Props { isAdmin: boolean }

const REFRESH_DEBOUNCE_MS = 10_000;

export function IndicatorsView({ isAdmin }: Props) {
  const initial = presetRange("last7");
  const [preset, setPreset] = useState<PeriodPreset>("last7");
  const [from, setFrom] = useState<string>(toLocal(initial.from));
  const [to, setTo] = useState<string>(toLocal(initial.to));
  const [operation, setOperation] = useState<OperationFilter>("all");
  const [scope, setScope] = useState<ScopeFilter>(isAdmin ? "all" : "me");

  const [data, setData] = useState<IndicatorResponse | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);
  const lastRunRef = useRef<number>(0);

  const mutation = useMutation({
    mutationFn: async (vars: { from: string; to: string; operation: OperationFilter; scope: ScopeFilter }) => {
      const { data: res, error } = await supabase.functions.invoke("api4com-indicators", { body: vars });
      if (error) {
        let parsed: any = null;
        try { parsed = await (error as any).context?.json?.(); } catch {}
        const status = (error as any).context?.status ?? parsed?.status;
        const msg = parsed?.message ?? error.message;
        const err: any = new Error(msg || "Falha ao consultar API4Com");
        err.status = status;
        err.code = parsed?.error;
        throw err;
      }
      if ((res as any)?.error) {
        const err: any = new Error((res as any).message ?? (res as any).error);
        err.code = (res as any).error;
        throw err;
      }
      return res as IndicatorResponse;
    },
    onSuccess: (res) => {
      setData(res);
      setLastUpdated(new Date());
      setErrorBanner(null);
    },
    onError: (e: any) => {
      if (e?.status === 429 || e?.code === "rate_limited") {
        setErrorBanner(e.message || "Limite de consultas da API4Com atingido. Aguarde alguns segundos e tente novamente.");
      } else if (e?.code === "missing_extension") {
        setErrorBanner(e.message);
      } else if (e?.code === "api4com_not_configured") {
        setErrorBanner(e.message);
      } else {
        setErrorBanner(e?.message || "Não foi possível atualizar os indicadores.");
      }
    },
  });

  const runFetch = (override?: { from?: string; to?: string; operation?: OperationFilter; scope?: ScopeFilter }) => {
    const now = Date.now();
    if (now - lastRunRef.current < REFRESH_DEBOUNCE_MS && mutation.isSuccess) {
      toast.message("Aguarde alguns segundos antes de atualizar novamente.");
      return;
    }
    lastRunRef.current = now;
    const f = override?.from ?? from;
    const t = override?.to ?? to;
    const op = override?.operation ?? operation;
    const sc = override?.scope ?? scope;
    mutation.mutate({
      from: new Date(f).toISOString(),
      to: new Date(t).toISOString(),
      operation: op,
      scope: sc,
    });
  };

  // Initial load — apenas uma vez ao entrar na tela.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { runFetch(); }, []);

  const applyPreset = (p: PeriodPreset) => {
    setPreset(p);
    if (p === "custom") return;
    const r = presetRange(p);
    const f = toLocal(r.from); const t = toLocal(r.to);
    setFrom(f); setTo(t);
  };

  const apply = () => {
    setData(null); // limpa cache visual
    runFetch();
  };

  const m = data?.metrics;
  const meta = data?.meta;
  const lastUpdatedLabel = lastUpdated
    ? `Última atualização: ${lastUpdated.toLocaleString("pt-BR")}`
    : mutation.isPending ? "Carregando…" : "—";

  const tooFewWarning = useMemo(() => {
    if (!isAdmin || !meta) return null;
    if (meta.sawFullPage && meta.rawCount === meta.pages * meta.pageLimit) return null;
    if (meta.rawCount === 0) return null;
    return null;
  }, [isAdmin, meta]);

  const adminPagedNote = isAdmin && meta && meta.sawFullPage
    ? `A API retornou ${meta.rawCount} registros em ${meta.pages} páginas para este período. Verifique se o relatório API4COM oficial bate com este total.`
    : null;

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Período</Label>
            <div className="flex flex-wrap gap-1.5">
              {(["today","yesterday","last7","last30","month","custom"] as PeriodPreset[]).map((p) => (
                <Button key={p} type="button" size="sm" variant={preset === p ? "default" : "outline"} onClick={() => applyPreset(p)}>
                  {PERIOD_LABELS[p]}
                </Button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">De</Label>
            <Input type="datetime-local" value={from} onChange={(e) => { setFrom(e.target.value); setPreset("custom"); }} className="w-[200px]" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Até</Label>
            <Input type="datetime-local" value={to} onChange={(e) => { setTo(e.target.value); setPreset("custom"); }} className="w-[200px]" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Operação</Label>
            <Select value={operation} onValueChange={(v) => setOperation(v as OperationFilter)}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Ambas</SelectItem>
                <SelectItem value="outbound">Outbound</SelectItem>
                <SelectItem value="inbound">Inbound</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <div className="space-y-1.5">
              <Label className="text-xs">Escopo</Label>
              <Select value={scope} onValueChange={(v) => setScope(v as ScopeFilter)}>
                <SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os ramais</SelectItem>
                  <SelectItem value="me">Meu ramal</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="ml-auto flex items-end gap-2">
            <Button onClick={apply} disabled={mutation.isPending}>Aplicar</Button>
            <Button variant="outline" onClick={() => runFetch()} disabled={mutation.isPending}>
              <RefreshCw className={`mr-2 h-4 w-4 ${mutation.isPending ? "animate-spin" : ""}`} />
              {mutation.isPending ? "Atualizando…" : "Atualizar dados"}
            </Button>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{lastUpdatedLabel}</p>
      </Card>

      {errorBanner && (
        <Card className="border-amber-500/40 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-400" />
            <div className="flex-1">
              <p className="font-medium text-amber-200">{errorBanner}</p>
              {data && <p className="mt-1 text-xs text-amber-300/80">Os números abaixo são da última atualização bem-sucedida.</p>}
            </div>
            <Button size="sm" variant="outline" onClick={() => runFetch()} disabled={mutation.isPending}>Tentar novamente</Button>
          </div>
        </Card>
      )}

      {!data && mutation.isPending && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i} className="h-[120px] animate-pulse border-border bg-card" />
          ))}
        </div>
      )}

      {!data && !mutation.isPending && !errorBanner && (
        <Card className="flex flex-col items-center justify-center gap-2 border-dashed border-border bg-card p-10 text-center">
          <Inbox className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhuma chamada encontrada para este período</p>
        </Card>
      )}

      {m && (
        <>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <MetricCard label="Total Chamadas" value={m.total.toLocaleString("pt-BR")} secondary={`${meta?.rawCount ?? m.total} registros brutos`} icon={Phone} accent="primary" />
            <MetricCard label="Chamadas Atendidas" value={m.answered.toLocaleString("pt-BR")} secondary={`Tarifa ≥ R$ 0,12`} icon={PhoneIncoming} accent="emerald" />
            <MetricCard label="Chamadas Não Atendidas" value={m.notAnswered.toLocaleString("pt-BR")} secondary={`${m.emptyTariffs} sem tarifa`} icon={PhoneMissed} accent="rose" />
            <MetricCard label="HitRate" value={formatPct(m.hitRate)} secondary={`${m.answered}/${m.total}`} icon={Target} accent="violet" />
            <MetricCard label="Tempo Falado" value={formatDuration(m.talkedSec)} secondary={`Atendidas reais`} icon={Clock} accent="cyan" />
            <MetricCard label="TMA" value={formatDuration(m.tma)} secondary={`Tempo médio atendimento`} icon={Timer} accent="amber" />
            <MetricCard label="Total Ramais" value={m.totalExtensions.toLocaleString("pt-BR")} secondary={`Ativos no período`} icon={Users} accent="primary" />
            <MetricCard label="Custo Total" value={formatBRL(m.costCents)} secondary={`Soma das tarifas atendidas`} icon={BarChart3} accent="emerald" />
          </div>

          <Card className="border-border bg-card p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Ligações por Ramal</h2>
              <span className="text-xs text-muted-foreground">{m.perExtension.length} ramais</span>
            </div>
            {m.perExtension.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem dados.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="py-2">Ramal</th>
                      <th className="py-2 text-right">Total</th>
                      <th className="py-2 text-right">Atendidas</th>
                      <th className="py-2 text-right">HitRate</th>
                      <th className="py-2 text-right">Tempo Falado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.perExtension.map((row) => (
                      <tr key={row.extension} className="border-t border-border/50">
                        <td className="py-2 font-medium">{row.extension}</td>
                        <td className="py-2 text-right tabular-nums">{row.total}</td>
                        <td className="py-2 text-right tabular-nums">{row.answered}</td>
                        <td className="py-2 text-right tabular-nums">{row.total > 0 ? formatPct(row.answered / row.total) : "—"}</td>
                        <td className="py-2 text-right tabular-nums">{formatDuration(row.talkedSec)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          {adminPagedNote && (
            <p className="text-xs text-muted-foreground">{adminPagedNote}</p>
          )}
          {tooFewWarning && <p className="text-xs text-amber-300">{tooFewWarning}</p>}
        </>
      )}
    </div>
  );
}

function toLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
