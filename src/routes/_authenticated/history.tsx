import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { listAnalyses, getAnalysis, listSegments } from "@/lib/knowledge.functions";
import { listUsers, getMyProfile } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, ListChecks, Loader2, Eye, X } from "lucide-react";
import { OPERATION_LABEL } from "@/features/knowledge-base/types";
import { InsightsView } from "@/features/knowledge-base/InsightsView";

export const Route = createFileRoute("/_authenticated/history")({
  component: HistoryPage,
  head: () => ({ meta: [{ title: "Histórico de Análises" }] }),
});

function HistoryPage() {
  const fetchProfile = useServerFn(getMyProfile);
  const fetchAnalyses = useServerFn(listAnalyses);
  const fetchAnalysis = useServerFn(getAnalysis);
  const fetchSegments = useServerFn(listSegments);
  const fetchUsers = useServerFn(listUsers);

  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchProfile() });
  const { data: segments } = useQuery({ queryKey: ["segments"], queryFn: () => fetchSegments() });
  const { data: users } = useQuery({
    queryKey: ["admin", "users"], queryFn: () => fetchUsers(), enabled: !!me?.isAdmin,
  });

  const [operation, setOperation] = useState<string>("all");
  const [model, setModel] = useState<string>("all");
  const [segmentId, setSegmentId] = useState<string>("all");
  const [userId, setUserId] = useState<string>("all");
  const [company, setCompany] = useState<string>("");
  const [openId, setOpenId] = useState<string | null>(null);

  const filters = useMemo(() => ({
    operation: operation === "all" ? null : (operation as "outbound" | "inbound"),
    qualification_model: model === "all" ? null : (model as "CHAMP" | "BANT"),
    segment_id: segmentId === "all" ? null : segmentId,
    user_id: userId === "all" ? null : userId,
    company: company.trim() || null,
  }), [operation, model, segmentId, userId, company]);

  const { data: rows, isLoading, refetch } = useQuery({
    queryKey: ["analyses", filters],
    queryFn: () => fetchAnalyses({ data: filters }),
  });

  const { data: openRow } = useQuery({
    queryKey: ["analysis", openId],
    queryFn: () => (openId ? fetchAnalysis({ data: { id: openId } }) : null),
    enabled: !!openId,
  });

  const segMap = new Map((segments ?? []).map((s: any) => [s.id, s.name]));
  const userMap = new Map((users ?? []).map((u: any) => [u.user_id, u.full_name ?? u.username]));

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
              <ListChecks className="h-7 w-7 text-primary" /> Histórico de Análises
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Filtre por operação, usuário, segmento, empresa e modelo.</p>
          </div>
          <Link to="/"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button></Link>
        </div>

        <Card className="mb-6 border-border bg-card p-6">
          <div className="grid gap-4 md:grid-cols-5">
            <div className="space-y-1.5">
              <Label>Operação</Label>
              <Select value={operation} onValueChange={setOperation}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas</SelectItem>
                  <SelectItem value="outbound">Outbound</SelectItem>
                  <SelectItem value="inbound">Inbound</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="CHAMP">CHAMP</SelectItem>
                  <SelectItem value="BANT">BANT</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Segmento</Label>
              <Select value={segmentId} onValueChange={setSegmentId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {(segments ?? []).map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {me?.isAdmin && (
              <div className="space-y-1.5">
                <Label>Usuário</Label>
                <Select value={userId} onValueChange={setUserId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {(users ?? []).map((u: any) => (
                      <SelectItem key={u.user_id} value={u.user_id}>{u.full_name ?? u.username}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Empresa</Label>
              <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Buscar empresa…" />
            </div>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => { setOperation("all"); setModel("all"); setSegmentId("all"); setUserId("all"); setCompany(""); }}>
              <X className="mr-2 h-4 w-4" /> Limpar
            </Button>
            <Button onClick={() => refetch()}>Atualizar</Button>
          </div>
        </Card>

        <Card className="border-border bg-card p-6">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !rows || rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma análise encontrada com esses filtros.</p>
          ) : (
            <ul className="divide-y divide-border">
              {rows.map((r: any) => {
                const op = r.operation as "outbound" | "inbound" | null;
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{r.company || r.label || "Sem rótulo"}</span>
                        {op && (
                          <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${op === "inbound" ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
                            Operação: {OPERATION_LABEL[op]}
                          </span>
                        )}
                        {r.classification && (
                          <span className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs">{r.classification} · {r.score ?? "-"}/100</span>
                        )}
                      </div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString("pt-BR")}
                        {r.segment_id && segMap.get(r.segment_id) ? ` · ${segMap.get(r.segment_id)}` : ""}
                        {me?.isAdmin && r.user_id && userMap.get(r.user_id) ? ` · ${userMap.get(r.user_id)}` : ""}
                      </div>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setOpenId(r.id)}>
                      <Eye className="mr-2 h-4 w-4" /> Abrir
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {openId && openRow && (
          <Card className="mt-8 border-border bg-card p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">
                Análise — {(openRow as any).company || (openRow as any).label || "sem rótulo"}
                {(openRow as any).operation && (
                  <span className={`ml-3 rounded-full border px-2 py-0.5 align-middle text-xs font-medium ${(openRow as any).operation === "inbound" ? "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" : "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"}`}>
                    Operação: {OPERATION_LABEL[(openRow as any).operation as "outbound" | "inbound"]}
                  </span>
                )}
              </h2>
              <Button variant="ghost" size="sm" onClick={() => setOpenId(null)}><X className="mr-2 h-4 w-4" /> Fechar</Button>
            </div>
            <Textarea
              value={(openRow as any).summary ?? ""}
              readOnly
              className="min-h-[360px] resize-y bg-background font-mono text-sm leading-relaxed"
            />
            {(openRow as any).insights && (
              <div className="mt-6">
                <InsightsView insights={(openRow as any).insights} segmentName={segMap.get((openRow as any).segment_id) as string ?? ""} />
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}