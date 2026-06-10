import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useRef, useEffect } from "react";
import { Mic, Square, Upload, Copy, Loader2, Sparkles, FileAudio, History, Trash2, X, Flame, Snowflake, Thermometer, LogOut, Shield, Library, ListChecks, Mail, Lightbulb, PhoneCall, PhoneOff, MicOff, BarChart3 } from "lucide-react";
import { useSoftphone } from "@/hooks/useSoftphone";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { getMyProfile } from "@/lib/auth.functions";
import { listSegments, saveAnalysis } from "@/lib/knowledge.functions";
import { suggestKnowledgeFromCall } from "@/lib/knowledge-items.functions";
import { InsightsView } from "@/features/knowledge-base/InsightsView";
import type { CallInsights, Operation } from "@/features/knowledge-base/types";
import { MODEL_FOR_OPERATION, OPERATION_LABEL } from "@/features/knowledge-base/types";
import o2Logo from "@/assets/o2-logo.png.asset.json";

export const Route = createFileRoute("/_authenticated/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Qualificador de Cold Calls — Transcrição & Resumo CRM" },
      { name: "description", content: "Transcreva cold calls e gere automaticamente o resumo no padrão CRM pronto para colar." },
    ],
  }),
});

const HISTORY_KEY = "cold-call-history-v1";
type Classification = "Quente" | "Morno" | "Frio";
type HistoryItem = {
  id: string;
  label: string;
  createdAt: number;
  summary: string;
  transcript: string;
  score?: number;
  classification?: Classification;
  scoreReasoning?: string;
};

const classMeta: Record<Classification, { color: string; bg: string; border: string; icon: typeof Flame }> = {
  Quente: { color: "text-orange-400", bg: "bg-orange-500/10", border: "border-orange-500/30", icon: Flame },
  Morno: { color: "text-yellow-400", bg: "bg-yellow-500/10", border: "border-yellow-500/30", icon: Thermometer },
  Frio: { color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/30", icon: Snowflake },
};

function RamalBadge({ status, extension }: { status: string; extension: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    registered: { label: `Ramal ${extension ?? ""} pronto`, cls: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
    connecting: { label: "Conectando ramal…", cls: "border-yellow-500/40 bg-yellow-500/10 text-yellow-300" },
    unregistered: { label: "Ramal offline", cls: "border-ink-500/40 bg-muted text-muted-foreground" },
    failed: { label: "Falha no ramal", cls: "border-red-500/40 bg-red-500/10 text-red-300" },
    disabled: { label: "Ramal não configurado", cls: "border-ink-500/40 bg-muted text-muted-foreground" },
  };
  const meta = map[status] ?? map.disabled;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${meta.cls}`}>
      {meta.label}
    </span>
  );
}

function Index() {
  const navigate = useNavigate();
  const fetchProfile = useServerFn(getMyProfile);
  const fetchSegments = useServerFn(listSegments);
  const saveAnalysisFn = useServerFn(saveAnalysis);
  const suggestFn = useServerFn(suggestKnowledgeFromCall);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchProfile() });
  const { data: segments } = useQuery({ queryKey: ["segments"], queryFn: () => fetchSegments() });
  const operation: Operation = (me?.operation as Operation) ?? "outbound";
  const model = MODEL_FOR_OPERATION[operation];
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [classification, setClassification] = useState<Classification | null>(null);
  const [scoreReasoning, setScoreReasoning] = useState<string>("");
  const [audioInfo, setAudioInfo] = useState<string>("");
  const [segmentId, setSegmentId] = useState<string>("");
  const [company, setCompany] = useState<string>("");
  const [dialPhone, setDialPhone] = useState<string>("");
  const [dialing, setDialing] = useState(false);
  const sip = useSoftphone();
  const [insights, setInsights] = useState<CallInsights | null>(null);
  const [segmentName, setSegmentName] = useState<string>("");
  const [transcript, setTranscript] = useState<string>("");
  const [savedAnalysisId, setSavedAnalysisId] = useState<string | null>(null);
  const [savingAnalysis, setSavingAnalysis] = useState(false);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      if (raw) setHistory(JSON.parse(raw));
    } catch {}
  }, []);

  const persist = (items: HistoryItem[]) => {
    setHistory(items);
    try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items)); } catch {}
  };

  const processBlob = async (blob: Blob, label: string) => {
    setAudioInfo(`${label} • ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
    setLoading(true);
    setSummary("");
    setScore(null);
    setClassification(null);
    setScoreReasoning("");
    setInsights(null);
    setSavedAnalysisId(null);
    try {
      const ext = blob.type.includes("mp3") ? "mp3" : blob.type.includes("wav") ? "wav" : blob.type.includes("mpeg") ? "mp3" : "webm";
      const filename = (blob instanceof File ? blob.name : `audio.${ext}`);
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-call`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "Content-Type": blob.type || "audio/webm",
          "x-filename": filename,
          ...(segmentId ? { "x-segment-id": segmentId } : {}),
          "x-operation": operation,
          ...(company ? { "x-company": encodeURIComponent(company) } : {}),
        },
        body: blob,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao processar áudio");
      setSummary(data.summary);
      setScore(typeof data.score === "number" ? data.score : null);
      setClassification((data.classification as Classification) ?? null);
      setScoreReasoning(data.score_reasoning ?? "");
      setInsights((data.insights as CallInsights) ?? null);
      setSegmentName(data.segment_name ?? "");
      setTranscript(data.transcript ?? "");
      const item: HistoryItem = {
        id: crypto.randomUUID(),
        label,
        createdAt: Date.now(),
        summary: data.summary,
        transcript: data.transcript ?? "",
        score: typeof data.score === "number" ? data.score : undefined,
        classification: (data.classification as Classification) ?? undefined,
        scoreReasoning: data.score_reasoning ?? "",
      };
      persist([item, ...history].slice(0, 50));
      setSelectedId(item.id);
      toast.success("Resumo gerado!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao processar");
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        processBlob(blob, "Gravação");
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {
      toast.error("Não foi possível acessar o microfone");
    }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processBlob(file, file.name);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(summary);
    toast.success("Resumo copiado para a área de transferência");
  };

  const loadItem = (item: HistoryItem) => {
    setSummary(item.summary);
    setScore(item.score ?? null);
    setClassification(item.classification ?? null);
    setScoreReasoning(item.scoreReasoning ?? "");
    setAudioInfo(`${item.label} • ${new Date(item.createdAt).toLocaleString("pt-BR")}`);
    setSelectedId(item.id);
    setInsights(null);
    setSavedAnalysisId(null);
  };

  const deleteItem = (id: string) => {
    const next = history.filter((h) => h.id !== id);
    persist(next);
    if (selectedId === id) {
      setSelectedId(null);
      setSummary("");
      setScore(null);
      setClassification(null);
      setScoreReasoning("");
      setAudioInfo("");
    }
  };

  const dialCall = async () => {
    const phone = dialPhone.trim();
    if (!phone) return;
    setDialing(true);
    try {
      const { data, error } = await supabase.functions.invoke("dial", {
        body: { phone, segmentId: segmentId || undefined, company: company || undefined },
      });
      if (error) {
        let msg = error.message;
        try {
          const ctxBody = await (error as any).context?.json?.();
          if (ctxBody?.error) msg = ctxBody.detail ? `${ctxBody.error}: ${ctxBody.detail}` : ctxBody.error;
        } catch {}
        throw new Error(msg);
      }
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Ligando… a análise aparece no Histórico ao desligar.");
      setDialPhone("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar a ligação");
    } finally {
      setDialing(false);
    }
  };

  const clearHistory = () => {
    persist([]);
    setSelectedId(null);
    setSummary("");
    setScore(null);
    setClassification(null);
    setScoreReasoning("");
    setAudioInfo("");
    toast.success("Histórico limpo");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster theme="dark" />
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-6 flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">
            {me?.profile?.full_name ?? me?.profile?.username ?? ""}
            {me?.profile && (
              <span className={`ml-2 rounded-full border px-2 py-0.5 text-xs font-medium ${operation === "inbound" ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
                Operação: {OPERATION_LABEL[operation]}
              </span>
            )}
          </span>
          <Link to="/history">
            <Button variant="outline" size="sm"><ListChecks className="mr-2 h-4 w-4" /> Histórico</Button>
          </Link>
          <Link to="/emails">
            <Button variant="outline" size="sm"><Mail className="mr-2 h-4 w-4" /> E-mails</Button>
          </Link>
          {me?.isAdmin && (
            <>
              <Link to="/knowledge-base">
                <Button variant="outline" size="sm"><Library className="mr-2 h-4 w-4" /> Base de Conhecimento</Button>
              </Link>
              <Link to="/admin">
                <Button variant="outline" size="sm"><Shield className="mr-2 h-4 w-4" /> Admin</Button>
              </Link>
            </>
          )}
          <Link to="/indicators">
            <Button variant="outline" size="sm"><BarChart3 className="mr-2 h-4 w-4" /> Indicadores</Button>
          </Link>
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              await supabase.auth.signOut();
              navigate({ to: "/auth" });
            }}
          >
            <LogOut className="mr-2 h-4 w-4" /> Sair
          </Button>
        </div>
        <header className="mb-12 text-center">
          <div className="mb-6 flex justify-center">
            <img src={o2Logo.url} alt="O2 Inc" className="h-14 w-auto" />
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Powered by AI
          </div>
          <h1 className="mt-6 text-5xl font-bold tracking-tight md:text-6xl">
            Qualificador de <span className="text-primary">Cold Calls</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Grave ou envie o áudio da chamada e receba o resumo CRM pronto para colar.
          </p>
        </header>

        <Card className="border-border bg-card p-8">
          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium">Segmento de mercado da call</label>
            {segments && segments.length > 0 ? (
              <div className="flex flex-wrap items-center gap-3">
                <Select value={segmentId || "none"} onValueChange={(v) => setSegmentId(v === "none" ? "" : v)}>
                  <SelectTrigger className="max-w-md">
                    <SelectValue placeholder="Selecione um segmento (opcional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Sem segmento (apenas resumo)</SelectItem>
                    {segments.map((s: any) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Os insights da ligação serão cruzados com a base de conhecimento desse segmento ({model}).
                </p>
              </div>
            ) : (
              <div className="rounded-md border border-dashed border-border p-4 text-sm text-muted-foreground">
                Nenhuma base de conhecimento cadastrada ainda.
                {me?.isAdmin && (
                  <>
                    {" "}
                    <Link to="/knowledge-base" className="text-primary underline">Cadastrar agora</Link>.
                  </>
                )}
              </div>
            )}
          </div>
          <div className="mb-6">
            <label className="mb-2 block text-sm font-medium">Empresa do lead (opcional)</label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Ex.: Acme Indústria" className="max-w-md" />
          </div>
          <div className="mb-6">
            <div className="mb-2 flex items-center gap-2">
              <label className="text-sm font-medium">Ligar pelo discador (API4Com)</label>
              <RamalBadge status={sip.status} extension={sip.extension} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Input
                value={dialPhone}
                onChange={(e) => setDialPhone(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !dialing && dialCall()}
                placeholder="Ex.: +5511999998888"
                className="max-w-xs"
                disabled={dialing || loading}
              />
              <Button onClick={dialCall} disabled={dialing || loading || !dialPhone.trim()}>
                {dialing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PhoneCall className="mr-2 h-4 w-4" />}
                {dialing ? "Ligando…" : "Ligar"}
              </Button>
              <p className="text-xs text-muted-foreground">
                {sip.status === "registered"
                  ? "Atende no próprio app; ao desligar, a gravação dos dois lados é transcrita e qualificada."
                  : "A ligação toca no seu ramal; ao desligar, a gravação dos dois lados é transcrita e qualificada."}
              </p>
            </div>

            {sip.callState !== "idle" && (
              <div className="mt-3 flex items-center gap-3 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <span className="text-sm font-medium text-emerald-300">
                  {sip.callState === "ringing" ? "Tocando…" : "Em ligação"}
                </span>
                <div className="ml-auto flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={sip.toggleMute}>
                    {sip.muted ? <MicOff className="mr-2 h-4 w-4" /> : <Mic className="mr-2 h-4 w-4" />}
                    {sip.muted ? "Mudo" : "Mutar"}
                  </Button>
                  <Button variant="destructive" size="sm" onClick={sip.hangup}>
                    <PhoneOff className="mr-2 h-4 w-4" /> Desligar
                  </Button>
                </div>
              </div>
            )}
          </div>

          <div className="mb-4 text-center text-xs uppercase tracking-widest text-muted-foreground">ou grave / envie o áudio</div>

          <div className="grid gap-4 md:grid-cols-2">
            <Button
              size="lg"
              variant={recording ? "destructive" : "default"}
              onClick={recording ? stopRecording : startRecording}
              disabled={loading}
              className="h-24 text-base"
            >
              {recording ? (
                <><Square className="mr-2 h-5 w-5 animate-pulse" /> Parar gravação</>
              ) : (
                <><Mic className="mr-2 h-5 w-5" /> Gravar cold call</>
              )}
            </Button>

            <label className="cursor-pointer">
              <input type="file" accept="audio/*" onChange={onUpload} className="hidden" disabled={loading || recording} />
              <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border bg-secondary text-base font-medium text-secondary-foreground transition hover:border-primary hover:text-primary">
                <Upload className="mr-2 h-5 w-5" /> Enviar arquivo de áudio
              </div>
            </label>
          </div>

          {audioInfo && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <FileAudio className="h-4 w-4" /> {audioInfo}
            </div>
          )}
        </Card>

        {loading && (
          <div className="mt-8 flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Transcrevendo e qualificando…
          </div>
        )}

        {summary && (
          classification && score !== null && (() => {
            const meta = classMeta[classification];
            const Icon = meta.icon;
            return (
              <Card className={`mt-8 border ${meta.border} ${meta.bg} p-6`}>
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    <div className={`flex h-14 w-14 items-center justify-center rounded-full ${meta.bg} ${meta.color}`}>
                      <Icon className="h-7 w-7" />
                    </div>
                    <div>
                      <div className="text-xs uppercase tracking-wider text-muted-foreground">Classificação</div>
                      <div className={`text-2xl font-bold ${meta.color}`}>{classification}</div>
                    </div>
                  </div>
                  <div className="flex flex-col items-start md:items-end">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">Score</div>
                    <div className={`text-4xl font-bold ${meta.color}`}>{score}<span className="text-base text-muted-foreground">/100</span></div>
                  </div>
                </div>
                <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-background">
                  <div
                    className={`h-full rounded-full transition-all ${classification === "Quente" ? "bg-orange-500" : classification === "Morno" ? "bg-yellow-500" : "bg-blue-500"}`}
                    style={{ width: `${score}%` }}
                  />
                </div>
                {scoreReasoning && (
                  <p className="mt-3 text-sm text-muted-foreground">{scoreReasoning}</p>
                )}
              </Card>
            );
          })()
        )}

        {summary && (
          <Card className="mt-8 border-border bg-card p-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Resumo CRM
                <span className={`ml-3 rounded-full border px-2 py-0.5 align-middle text-xs font-medium ${operation === "inbound" ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
                  Operação: {OPERATION_LABEL[operation]}
                </span>
              </h2>
              <Button onClick={copy} variant="default" size="sm">
                <Copy className="mr-2 h-4 w-4" /> Copiar para o CRM
              </Button>
            </div>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="min-h-[480px] resize-y bg-background font-mono text-sm leading-relaxed"
            />
          </Card>
        )}

        {insights && (
          <InsightsView
            insights={insights}
            segmentName={segmentName}
            saving={savingAnalysis}
            saved={!!savedAnalysisId}
            onSave={async () => {
              setSavingAnalysis(true);
              try {
                const row: any = await saveAnalysisFn({
                  data: {
                    segment_id: segmentId || null,
                    label: audioInfo,
                    company: company || undefined,
                    operation,
                    qualification_model: model,
                    transcript,
                    summary,
                    score,
                    classification,
                    score_reasoning: scoreReasoning,
                    insights,
                  },
                });
                setSavedAnalysisId(row?.id ?? "saved");
                toast.success("Análise salva");
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Falha ao salvar");
              } finally {
                setSavingAnalysis(false);
              }
            }}
          />
        )}

        {insights && savedAnalysisId && me?.isAdmin && (
          <Card className="mt-6 border-amber-500/30 bg-amber-500/5 p-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="flex items-start gap-3">
                <Lightbulb className="mt-1 h-5 w-5 text-amber-400" />
                <div>
                  <h3 className="font-semibold">Transformar esta ligação em aprendizado</h3>
                  <p className="text-sm text-muted-foreground">
                    A IA vai sugerir novas objeções, dores, perguntas e quebras observadas. Você revisa antes de adicionar à base.
                  </p>
                </div>
              </div>
              <Button
                onClick={async () => {
                  try {
                    const r: any = await suggestFn({ data: { analysis_id: savedAnalysisId } });
                    toast.success(`${r?.inserted ?? 0} sugestões criadas. Revise em Base de Conhecimento > Sugestões de Calls.`);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Falha ao gerar sugestões");
                  }
                }}
              >
                <Sparkles className="mr-2 h-4 w-4" /> Gerar conhecimento desta ligação
              </Button>
            </div>
          </Card>
        )}

        {history.length > 0 && (
          <Card className="mt-8 border-border bg-card p-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-xl font-semibold">
                <History className="h-5 w-5 text-primary" /> Histórico ({history.length})
              </h2>
              <Button onClick={clearHistory} variant="ghost" size="sm">
                <Trash2 className="mr-2 h-4 w-4" /> Limpar tudo
              </Button>
            </div>
            <ul className="divide-y divide-border">
              {history.map((item) => (
                <li
                  key={item.id}
                  className={`flex items-center justify-between gap-3 py-3 ${selectedId === item.id ? "text-primary" : ""}`}
                >
                  <button
                    onClick={() => loadItem(item)}
                    className="flex-1 truncate text-left text-sm hover:text-primary"
                  >
                    <div className="flex items-center gap-2">
                      {item.classification && (
                        <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${classMeta[item.classification].border} ${classMeta[item.classification].bg} ${classMeta[item.classification].color}`}>
                          {item.classification}
                          {typeof item.score === "number" && <span>· {item.score}</span>}
                        </span>
                      )}
                      <span className="font-medium">{item.label}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(item.createdAt).toLocaleString("pt-BR")}
                    </span>
                  </button>
                  <Button
                    onClick={() => deleteItem(item.id)}
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>
    </div>
  );
}
