import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Toaster } from "@/components/ui/sonner";
import { ArrowLeft, Mail, Loader2, Copy, RefreshCw, Save, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { getMyProfile } from "@/lib/auth.functions";
import { listSegments, listAnalyses } from "@/lib/knowledge.functions";
import { listKnowledgeItems } from "@/lib/knowledge-items.functions";
import {
  generateEmail, saveEmailTemplate, listEmailTemplates, deleteEmailTemplate,
} from "@/lib/emails.functions";
import { OPERATION_LABEL, type Operation } from "@/features/knowledge-base/types";

export const Route = createFileRoute("/_authenticated/emails")({
  component: EmailsPage,
  head: () => ({ meta: [{ title: "Gerador de E-mails — O2" }] }),
});

type Objective = "prospeccao" | "follow_up" | "retomada" | "quebra_objecao" | "envio_material";
type Tone = "direto" | "consultivo" | "provocativo";
type Stage = "primeiro_contato" | "pos_call" | "negociacao" | "fechamento" | "reativacao";

const OBJECTIVES: { v: Objective; label: string }[] = [
  { v: "prospeccao", label: "Prospecção (1º contato)" },
  { v: "follow_up", label: "Follow-up pós-call" },
  { v: "retomada", label: "Retomada" },
  { v: "quebra_objecao", label: "Quebra de objeção" },
  { v: "envio_material", label: "Envio de material" },
];
const TONES: { v: Tone; label: string }[] = [
  { v: "direto", label: "Direto" },
  { v: "consultivo", label: "Consultivo" },
  { v: "provocativo", label: "Provocativo" },
];
const STAGES: { v: Stage; label: string }[] = [
  { v: "primeiro_contato", label: "Primeiro contato" },
  { v: "pos_call", label: "Pós-call" },
  { v: "negociacao", label: "Negociação" },
  { v: "fechamento", label: "Fechamento" },
  { v: "reativacao", label: "Reativação" },
];

function EmailsPage() {
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const fetchSegments = useServerFn(listSegments);
  const fetchAnalyses = useServerFn(listAnalyses);
  const fetchItems = useServerFn(listKnowledgeItems);
  const gen = useServerFn(generateEmail);
  const save = useServerFn(saveEmailTemplate);
  const fetchTemplates = useServerFn(listEmailTemplates);
  const del = useServerFn(deleteEmailTemplate);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchProfile() });
  const { data: segments } = useQuery({ queryKey: ["segments"], queryFn: () => fetchSegments() });
  const { data: templates } = useQuery({ queryKey: ["email_templates"], queryFn: () => fetchTemplates() });

  const defaultOp: Operation = (me?.operation as Operation) ?? "outbound";
  const [segmentId, setSegmentId] = useState<string>("");
  const [operation, setOperation] = useState<Operation>(defaultOp);
  const [objective, setObjective] = useState<Objective>("prospeccao");
  const [tone, setTone] = useState<Tone>("consultivo");
  const [stage, setStage] = useState<Stage>("primeiro_contato");
  const [pain, setPain] = useState<string>("");
  const [extra, setExtra] = useState<string>("");
  const [analysisId, setAnalysisId] = useState<string>("");

  const { data: analyses } = useQuery({
    queryKey: ["analyses_for_email"],
    queryFn: () => fetchAnalyses({ data: {} }),
    enabled: objective === "follow_up",
  });

  const { data: painItems } = useQuery({
    queryKey: ["knowledge_pains", { segmentId, operation }],
    queryFn: () => fetchItems({ data: { segment_id: segmentId, operation, status: "active" } }),
    enabled: !!segmentId,
  });

  const painChoices = useMemo(() => {
    const list = (painItems ?? []) as any[];
    return list.filter((it) => it.category === "pains" || it.category === "pains_inbound");
  }, [painItems]);

  const [result, setResult] = useState<{ subject: string; preview: string; body: string } | null>(null);

  const genMut = useMutation({
    mutationFn: () =>
      gen({ data: {
        segment_id: segmentId,
        operation,
        objective,
        tone,
        stage,
        pain: pain || undefined,
        extra_context: extra || undefined,
        analysis_id: analysisId || null,
      } }),
    onSuccess: (r) => { setResult(r); toast.success("E-mail gerado"); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao gerar"),
  });

  const saveMut = useMutation({
    mutationFn: () =>
      save({ data: {
        segment_id: segmentId || null,
        operation,
        objective,
        tone,
        stage,
        pain: pain || null,
        subject: result?.subject ?? "",
        preview: result?.preview ?? "",
        body: result?.body ?? "",
      } }),
    onSuccess: () => { toast.success("Template salvo"); qc.invalidateQueries({ queryKey: ["email_templates"] }); },
  });

  const delMut = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); qc.invalidateQueries({ queryKey: ["email_templates"] }); },
  });

  const copyAll = async () => {
    if (!result) return;
    await navigator.clipboard.writeText(`Assunto: ${result.subject}\n\n${result.body}`);
    toast.success("E-mail copiado");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster theme="dark" />
      <div className="mx-auto max-w-6xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <h1 className="flex items-center gap-2 text-3xl font-bold">
            <Mail className="h-7 w-7 text-primary" /> Gerador de E-mails
          </h1>
          <Link to="/"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button></Link>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
          <Card className="border-border bg-card p-6">
            <h2 className="mb-4 text-lg font-semibold">Configuração</h2>
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                <div>
                  <Label>Segmento</Label>
                  <Select value={segmentId} onValueChange={setSegmentId}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {(segments ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Operação</Label>
                  <Select value={operation} onValueChange={(v) => setOperation(v as Operation)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="outbound">{OPERATION_LABEL.outbound}</SelectItem>
                      <SelectItem value="inbound">{OPERATION_LABEL.inbound}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Objetivo</Label>
                  <Select value={objective} onValueChange={(v) => setObjective(v as Objective)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {OBJECTIVES.map((o) => <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Estágio</Label>
                  <Select value={stage} onValueChange={(v) => setStage(v as Stage)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {STAGES.map((s) => <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label>Tom</Label>
                  <div className="flex gap-2">
                    {TONES.map((t) => (
                      <Button key={t.v} size="sm" variant={tone === t.v ? "default" : "outline"} onClick={() => setTone(t.v)}>
                        {t.label}
                      </Button>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-2">
                  <Label>Dor principal</Label>
                  <Select value={pain || "auto"} onValueChange={(v) => setPain(v === "auto" ? "" : v)}>
                    <SelectTrigger><SelectValue placeholder="A IA escolhe" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="auto">— A IA escolhe a mais relevante da base —</SelectItem>
                      {painChoices.map((p) => (
                        <SelectItem key={p.id} value={p.title}>{p.title}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {segmentId && painChoices.length === 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">Nenhuma dor cadastrada na base deste segmento.</p>
                  )}
                </div>
                {objective === "follow_up" && (
                  <div className="md:col-span-2">
                    <Label>Análise da ligação (opcional)</Label>
                    <Select value={analysisId || "none"} onValueChange={(v) => setAnalysisId(v === "none" ? "" : v)}>
                      <SelectTrigger><SelectValue placeholder="Selecione uma análise" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Nenhuma —</SelectItem>
                        {(analyses ?? []).map((a: any) => (
                          <SelectItem key={a.id} value={a.id}>
                            {a.label || a.company || "Sem rótulo"} · {new Date(a.created_at).toLocaleDateString("pt-BR")}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
                <div className="md:col-span-2">
                  <Label>Contexto extra (opcional)</Label>
                  <Textarea value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Algo importante para o e-mail…" />
                </div>
              </div>
              <Button className="w-full" disabled={!segmentId || genMut.isPending} onClick={() => genMut.mutate()}>
                {genMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                {result ? "Gerar nova versão" : "Gerar e-mail"}
              </Button>
            </div>
          </Card>

          <Card className="border-border bg-card p-6">
            <h2 className="mb-4 text-lg font-semibold">Resultado</h2>
            {!result ? (
              <div className="rounded-md border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
                Configure e clique em "Gerar e-mail" para ver o resultado aqui.
              </div>
            ) : (
              <div className="space-y-3">
                <div>
                  <Label className="text-xs">Assunto</Label>
                  <Input value={result.subject} onChange={(e) => setResult({ ...result, subject: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Prévia</Label>
                  <Input value={result.preview} onChange={(e) => setResult({ ...result, preview: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs">Corpo</Label>
                  <Textarea
                    value={result.body}
                    onChange={(e) => setResult({ ...result, body: e.target.value })}
                    className="min-h-[280px] font-mono text-sm"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={copyAll} variant="default" size="sm"><Copy className="mr-2 h-4 w-4" /> Copiar</Button>
                  <Button onClick={() => genMut.mutate()} variant="outline" size="sm" disabled={genMut.isPending}>
                    <RefreshCw className="mr-2 h-4 w-4" /> Nova versão
                  </Button>
                  <Button onClick={() => saveMut.mutate()} variant="outline" size="sm" disabled={saveMut.isPending}>
                    <Save className="mr-2 h-4 w-4" /> Salvar template
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        <Card className="mt-8 border-border bg-card p-6">
          <h2 className="mb-4 text-lg font-semibold">Templates salvos</h2>
          {!templates || templates.length === 0 ? (
            <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Nenhum template salvo ainda.
            </div>
          ) : (
            <ul className="space-y-2">
              {(templates as any[]).map((t) => (
                <li key={t.id} className="flex items-start justify-between gap-3 rounded-md border border-border bg-background/40 p-3">
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{t.objective ?? "—"}</Badge>
                      <Badge variant="outline">{t.tone ?? "—"}</Badge>
                      <Badge variant="outline">{t.operation ?? "—"}</Badge>
                      <span className="text-xs text-muted-foreground">{new Date(t.created_at).toLocaleString("pt-BR")}</span>
                    </div>
                    <p className="truncate font-semibold">{t.subject}</p>
                    <p className="line-clamp-2 text-sm text-muted-foreground">{t.body}</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="ghost" onClick={async () => {
                      await navigator.clipboard.writeText(`Assunto: ${t.subject}\n\n${t.body}`);
                      toast.success("Copiado");
                    }}>
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => delMut.mutate(t.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}