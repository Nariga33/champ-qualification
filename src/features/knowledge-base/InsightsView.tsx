import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Lightbulb, AlertTriangle, MessageCircleQuestion, Shield, TrendingDown,
  ThumbsUp, ListChecks, Copy, Save, Quote,
} from "lucide-react";
import { toast } from "sonner";
import type { CallInsights } from "./types";

function buildFeedbackText(i: CallInsights, segment?: string) {
  const lines: string[] = [];
  lines.push(`📊 Análise da Call${segment ? ` — ${segment}` : ""}`);
  lines.push(`Nota geral: ${i.nota_geral}/100`);
  lines.push(``, `Resumo: ${i.resumo_geral}`, ``);
  if (i.perguntas_faltantes?.length) {
    lines.push(`❓ Perguntas faltantes:`);
    i.perguntas_faltantes.forEach((p) => lines.push(`- ${p}`));
    lines.push(``);
  }
  if (i.melhorias_perguntas?.length) {
    lines.push(`✏️ Melhorias de perguntas:`);
    i.melhorias_perguntas.forEach((m) => lines.push(`- Feita: "${m.feita}" → Sugestão: ${m.sugestao}`));
    lines.push(``);
  }
  if (i.objecoes_identificadas?.length) {
    lines.push(`🛡️ Objeções e quebras:`);
    i.objecoes_identificadas.forEach((o) => lines.push(`- ${o.objecao} → ${o.quebra_recomendada}`));
    lines.push(``);
  }
  if (i.feedback_por_trecho?.length) {
    lines.push(`💬 Feedback por trecho:`);
    i.feedback_por_trecho.forEach((f) =>
      lines.push(`- Trecho: "${f.trecho}"\n  Problema: ${f.problema}\n  Sugestão: ${f.sugestao}`),
    );
    lines.push(``);
  }
  if (i.plano_de_acao?.length) {
    lines.push(`🎯 Plano de ação:`);
    i.plano_de_acao.forEach((p) => lines.push(`- ${p}`));
  }
  return lines.join("\n");
}

export function InsightsView({
  insights,
  segmentName,
  onSave,
  saving,
  saved,
}: {
  insights: CallInsights;
  segmentName?: string;
  onSave?: () => void;
  saving?: boolean;
  saved?: boolean;
}) {
  const copyAll = async () => {
    await navigator.clipboard.writeText(buildFeedbackText(insights, segmentName));
    toast.success("Feedback copiado");
  };

  const note = insights.nota_geral ?? 0;
  const noteColor = note >= 70 ? "text-emerald-400" : note >= 40 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="mt-8 space-y-6">
      <Card className="border-primary/30 bg-primary/5 p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
              <Lightbulb className="h-4 w-4 text-primary" /> Insights da Ligação
              {segmentName && <Badge variant="secondary">{segmentName}</Badge>}
            </div>
            <h2 className="mt-2 text-2xl font-bold">Resumo dos Insights</h2>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{insights.resumo_geral}</p>
          </div>
          <div className="flex flex-col items-start gap-3 md:items-end">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Nota da condução</div>
            <div className={`text-4xl font-bold ${noteColor}`}>
              {note}<span className="text-base text-muted-foreground">/100</span>
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={copyAll}>
                <Copy className="mr-2 h-4 w-4" /> Copiar Feedback
              </Button>
              {onSave && (
                <Button size="sm" onClick={onSave} disabled={saving || saved}>
                  <Save className="mr-2 h-4 w-4" />
                  {saved ? "Salvo" : saving ? "Salvando…" : "Salvar Análise"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-6 md:grid-cols-2">
        <Section
          title="Perguntas Faltantes"
          icon={MessageCircleQuestion}
          empty="Nenhuma pergunta crítica faltou."
        >
          {insights.perguntas_faltantes?.length ? (
            <ul className="space-y-2">
              {insights.perguntas_faltantes.map((p, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-primary">•</span>
                  <span>{p}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </Section>

        <Section
          title="Melhorias de Perguntas"
          icon={AlertTriangle}
          empty="Perguntas conduzidas com boa qualidade."
        >
          {insights.melhorias_perguntas?.length ? (
            <ul className="space-y-3">
              {insights.melhorias_perguntas.map((m, i) => (
                <li key={i} className="rounded-md border border-border bg-background/50 p-3 text-sm">
                  <div className="text-muted-foreground">Feita:</div>
                  <div className="italic">"{m.feita}"</div>
                  <div className="mt-2 text-muted-foreground">Sugestão:</div>
                  <div>{m.sugestao}</div>
                </li>
              ))}
            </ul>
          ) : null}
        </Section>

        <Section
          title="Objeções e Quebras"
          icon={Shield}
          empty="Nenhuma objeção relevante identificada."
        >
          {insights.objecoes_identificadas?.length ? (
            <ul className="space-y-3">
              {insights.objecoes_identificadas.map((o, i) => (
                <li key={i} className="rounded-md border border-border bg-background/50 p-3 text-sm">
                  <div className="font-medium">{o.objecao}</div>
                  <div className="mt-1 text-muted-foreground">Quebra recomendada:</div>
                  <div>{o.quebra_recomendada}</div>
                </li>
              ))}
            </ul>
          ) : null}
        </Section>

        <Section
          title="Oportunidades Perdidas"
          icon={TrendingDown}
          empty="Sem oportunidades perdidas evidentes."
        >
          {insights.oportunidades_perdidas?.length ? (
            <ul className="space-y-2">
              {insights.oportunidades_perdidas.map((p, i) => (
                <li key={i} className="flex gap-2 text-sm"><span className="text-yellow-400">•</span><span>{p}</span></li>
              ))}
            </ul>
          ) : null}
        </Section>

        <Section
          title="Pontos Positivos"
          icon={ThumbsUp}
          empty="—"
        >
          {insights.pontos_positivos?.length ? (
            <ul className="space-y-2">
              {insights.pontos_positivos.map((p, i) => (
                <li key={i} className="flex gap-2 text-sm"><span className="text-emerald-400">•</span><span>{p}</span></li>
              ))}
            </ul>
          ) : null}
        </Section>

        <Section
          title="Plano de Ação"
          icon={ListChecks}
          empty="—"
        >
          {insights.plano_de_acao?.length ? (
            <ol className="space-y-2 text-sm">
              {insights.plano_de_acao.map((p, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-bold text-primary">{i + 1}.</span>
                  <span>{p}</span>
                </li>
              ))}
            </ol>
          ) : null}
        </Section>
      </div>

      {insights.feedback_por_trecho?.length > 0 && (
        <Card className="border-border bg-card p-6">
          <h3 className="flex items-center gap-2 text-lg font-semibold">
            <Quote className="h-5 w-5 text-primary" /> Feedback por Trecho
          </h3>
          <ul className="mt-4 space-y-4">
            {insights.feedback_por_trecho.map((f, i) => (
              <li key={i} className="border-l-2 border-primary/50 pl-4">
                <div className="text-xs uppercase tracking-wider text-muted-foreground">Trecho da call</div>
                <div className="mt-1 italic text-muted-foreground">"{f.trecho}"</div>
                <div className="mt-2 text-sm"><span className="font-medium text-yellow-400">Problema:</span> {f.problema}</div>
                <div className="mt-1 text-sm"><span className="font-medium text-primary">Sugestão:</span> {f.sugestao}</div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Section({
  title, icon: Icon, empty, children,
}: {
  title: string;
  icon: typeof Lightbulb;
  empty: string;
  children: React.ReactNode;
}) {
  const hasContent = !!children && (Array.isArray(children) ? children.length > 0 : true);
  return (
    <Card className="border-border bg-card p-5">
      <h3 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </h3>
      {hasContent ? children : <p className="text-sm text-muted-foreground">{empty}</p>}
    </Card>
  );
}