import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, FileText, CheckCheck, Check, X, Trash2, AlertTriangle, GitMerge } from "lucide-react";
import { toast } from "sonner";
import { listSegments } from "@/lib/knowledge.functions";
import {
  extractKnowledgeFromText,
  bulkInsertKnowledgeItems,
  listKnowledgeItems,
  upsertKnowledgeItem,
} from "@/lib/knowledge-items.functions";
import { CATEGORY_META_BY_OP, OPERATION_LABEL, type Operation, type Priority } from "./types";

async function extractTextFromPdf(file: File): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  // Use worker via dynamic URL
  pdfjs.GlobalWorkerOptions.workerSrc = (await import("pdfjs-dist/legacy/build/pdf.worker.mjs?url")).default;
  const buf = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: buf }).promise;
  let out = "";
  const maxPages = Math.min(pdf.numPages, 80);
  for (let i = 1; i <= maxPages; i++) {
    const page = await pdf.getPage(i);
    const tc = await page.getTextContent();
    out += tc.items.map((it: any) => it.str).join(" ") + "\n\n";
  }
  return out;
}

type ReviewStatus = "pending" | "approved" | "rejected";

type ReviewItem = {
  uid: string;
  segment_id: string;
  operation: Operation;
  category: string;
  title: string;
  description: string;
  example: string;
  priority: Priority;
  status: ReviewStatus;
  ignoreDuplicate?: boolean;
};

const PRIORITY_LABEL: Record<Priority, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };

function norm(s: string): string {
  return (s ?? "").toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "").trim();
}

export function PdfImportTab() {
  const qc = useQueryClient();
  const fetchSegments = useServerFn(listSegments);
  const extractFn = useServerFn(extractKnowledgeFromText);
  const bulkInsert = useServerFn(bulkInsertKnowledgeItems);
  const fetchItems = useServerFn(listKnowledgeItems);
  const upsertItem = useServerFn(upsertKnowledgeItem);

  const { data: segments } = useQuery({ queryKey: ["segments"], queryFn: () => fetchSegments() });

  const [segmentId, setSegmentId] = useState<string>("");
  const [operation, setOperation] = useState<Operation>("outbound");
  const [extracting, setExtracting] = useState(false);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [existing, setExisting] = useState<any[]>([]);

  const onUpload = async (file: File) => {
    if (!segmentId) { toast.error("Selecione um segmento primeiro"); return; }
    setExtracting(true);
    try {
      toast.message("Extraindo texto do PDF…");
      const text = await extractTextFromPdf(file);
      if (text.trim().length < 30) throw new Error("PDF sem texto extraível (talvez seja escaneado).");
      toast.message("Processando playbook com IA…");
      const list = await extractFn({ data: { segment_id: segmentId, operation, text } });
      // load existing items in target segment+operation for duplicate detection
      const exist = await fetchItems({ data: { segment_id: segmentId, operation } as any });
      setExisting(exist as any[]);
      const review: ReviewItem[] = (list as any[]).map((it) => ({
        uid: crypto.randomUUID(),
        segment_id: segmentId,
        operation,
        category: it.category,
        title: it.title ?? "",
        description: it.description ?? "",
        example: it.example ?? "",
        priority: (it.priority as Priority) ?? "media",
        status: "pending" as ReviewStatus,
      }));
      setItems(review);
      toast.success(`${review.length} itens extraídos. Revise antes de publicar.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar PDF");
    } finally {
      setExtracting(false);
    }
  };

  const update = (uid: string, patch: Partial<ReviewItem>) =>
    setItems((arr) => arr.map((it) => (it.uid === uid ? { ...it, ...patch } : it)));
  const removeItem = (uid: string) => setItems((arr) => arr.filter((it) => it.uid !== uid));

  const findDuplicate = (it: ReviewItem) => {
    if (it.ignoreDuplicate) return null;
    const nt = norm(it.title);
    if (!nt) return null;
    return (existing.find((e: any) =>
      e.segment_id === it.segment_id &&
      e.operation === it.operation &&
      e.category === it.category &&
      norm(e.title) === nt,
    ) as any) ?? null;
  };

  const approveAll = useMutation({
    mutationFn: async () => {
      // Group approved items (skip rejected & possible duplicates not explicitly resolved) by segment+operation
      const ready = items.filter(
        (it) => it.status !== "rejected" && it.title.trim() && !findDuplicate(it),
      );
      if (ready.length === 0) throw new Error("Nenhum item pronto para publicar.");
      const groups = new Map<string, ReviewItem[]>();
      for (const it of ready) {
        const key = `${it.segment_id}|${it.operation}`;
        const arr = groups.get(key) ?? [];
        arr.push(it);
        groups.set(key, arr);
      }
      let total = 0;
      for (const [key, group] of groups) {
        const [seg, op] = key.split("|");
        const res = await bulkInsert({
          data: {
            segment_id: seg,
            operation: op as Operation,
            source: "pdf",
            status: "active",
            items: group.map((it) => ({
              category: it.category,
              title: it.title.trim(),
              description: it.description ?? "",
              example: it.example ?? "",
              priority: it.priority,
            })),
          } as any,
        });
        total += (res as any[])?.length ?? group.length;
      }
      // remove approved items from review list
      const approvedUids = new Set(ready.map((r) => r.uid));
      setItems((arr) => arr.filter((it) => !approvedUids.has(it.uid)));
      return total;
    },
    onSuccess: (total: number) => {
      toast.success(`${total} ${total === 1 ? "item publicado" : "itens publicados"} na Base Ativa.`);
      qc.invalidateQueries({ queryKey: ["knowledge_items"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
  });

  const approveOne = useMutation({
    mutationFn: async (it: ReviewItem) => {
      if (!it.title.trim()) throw new Error("Defina um título antes de aprovar");
      const res = await bulkInsert({
        data: {
          segment_id: it.segment_id,
          operation: it.operation,
          source: "pdf",
          status: "active",
          items: [{
            category: it.category,
            title: it.title.trim(),
            description: it.description ?? "",
            example: it.example ?? "",
            priority: it.priority,
          }],
        } as any,
      });
      return { res, uid: it.uid };
    },
    onSuccess: ({ uid }) => {
      toast.success("Item publicado na Base Ativa");
      removeItem(uid);
      qc.invalidateQueries({ queryKey: ["knowledge_items"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao aprovar"),
  });

  const mergeMut = useMutation({
    mutationFn: async ({ it, dup }: { it: ReviewItem; dup: any }) => {
      const mergedDesc = [dup.description, it.description].filter(Boolean).join("\n\n").trim();
      const mergedEx = [dup.example, it.example].filter(Boolean).join("\n\n").trim();
      await upsertItem({
        data: {
          id: dup.id,
          segment_id: dup.segment_id,
          operation: dup.operation,
          category: dup.category,
          title: dup.title,
          description: mergedDesc,
          example: mergedEx,
          priority: dup.priority,
          source: dup.source,
          status: "active",
        } as any,
      });
      return it.uid;
    },
    onSuccess: (uid: string) => {
      toast.success("Mesclado ao item existente");
      removeItem(uid);
      qc.invalidateQueries({ queryKey: ["knowledge_items"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao mesclar"),
  });

  const pendingCount = items.filter((it) => it.status !== "rejected" && !findDuplicate(it)).length;

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card p-6">
        <h3 className="mb-4 text-sm font-semibold text-foreground">Importar playbook</h3>
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1.5">
            <Label className="text-xs">Segmento padrão</Label>
            <Select value={segmentId} onValueChange={setSegmentId}>
              <SelectTrigger><SelectValue placeholder="Selecione um segmento" /></SelectTrigger>
              <SelectContent>
                {(segments ?? []).map((s: any) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Operação padrão</Label>
            <Select value={operation} onValueChange={(v) => setOperation(v as Operation)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="outbound">{OPERATION_LABEL.outbound}</SelectItem>
                <SelectItem value="inbound">{OPERATION_LABEL.inbound}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-end">
            <label className="w-full cursor-pointer">
              <input
                type="file"
                accept="application/pdf"
                className="hidden"
                disabled={extracting || !segmentId}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(f); e.currentTarget.value = ""; }}
              />
              <div className="flex h-10 items-center justify-center rounded-md border border-dashed border-border bg-secondary px-4 text-sm font-medium hover:border-primary hover:text-primary">
                {extracting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                {extracting ? "Processando playbook…" : "Processar playbook"}
              </div>
            </label>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="h-3 w-3" /> O PDF é lido no navegador; só o texto é enviado à IA. Itens aprovados aparecem direto na <strong>Base Ativa</strong>.
        </p>
      </Card>

      {items.length > 0 && (
        <Card className="border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Revisão de itens extraídos</h3>
              <p className="text-xs text-muted-foreground">
                {items.length} {items.length === 1 ? "item" : "itens"} extraídos · {pendingCount} prontos para publicar
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setItems([])}>Descartar tudo</Button>
              <Button onClick={() => approveAll.mutate()} disabled={approveAll.isPending || pendingCount === 0}>
                {approveAll.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4" />}
                Aprovar todos revisados
              </Button>
            </div>
          </div>
          <ul className="space-y-3">
            {items.map((it) => (
              <li key={it.uid}>
                <ReviewCard
                  item={it}
                  segments={(segments ?? []) as any[]}
                  duplicate={findDuplicate(it)}
                  onChange={(patch) => update(it.uid, patch)}
                  onApprove={() => approveOne.mutate(it)}
                  onReject={() => update(it.uid, { status: "rejected" })}
                  onDiscard={() => removeItem(it.uid)}
                  onMerge={(dup) => mergeMut.mutate({ it, dup })}
                  onSaveAnyway={() => update(it.uid, { ignoreDuplicate: true })}
                  busy={approveOne.isPending || mergeMut.isPending}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ReviewCard({
  item, segments, duplicate, onChange, onApprove, onReject, onDiscard, onMerge, onSaveAnyway, busy,
}: {
  item: ReviewItem;
  segments: any[];
  duplicate: any | null;
  onChange: (patch: Partial<ReviewItem>) => void;
  onApprove: () => void;
  onReject: () => void;
  onDiscard: () => void;
  onMerge: (dup: any) => void;
  onSaveAnyway: () => void;
  busy: boolean;
}) {
  const cats = CATEGORY_META_BY_OP[item.operation];
  const rejected = item.status === "rejected";

  return (
    <div className={`rounded-md border bg-background/40 p-4 ${rejected ? "border-destructive/30 opacity-60" : "border-border"}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="border-purple-500/30 bg-purple-500/10 text-purple-300">
          <FileText className="mr-1 h-3 w-3" /> PDF
        </Badge>
        {rejected && (
          <Badge variant="outline" className="border-destructive/40 bg-destructive/10 text-destructive">Rejeitado</Badge>
        )}
        {duplicate && (
          <Badge variant="outline" className="border-yellow-500/40 bg-yellow-500/10 text-yellow-300">
            <AlertTriangle className="mr-1 h-3 w-3" /> Possível duplicado
          </Badge>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Segmento</Label>
          <Select value={item.segment_id} onValueChange={(v) => onChange({ segment_id: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {segments.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Operação</Label>
          <Select
            value={item.operation}
            onValueChange={(v) => {
              const op = v as Operation;
              const validCats = CATEGORY_META_BY_OP[op].map((c) => c.key);
              const nextCat = validCats.includes(item.category) ? item.category : validCats[0];
              onChange({ operation: op, category: nextCat });
            }}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="outbound">{OPERATION_LABEL.outbound}</SelectItem>
              <SelectItem value="inbound">{OPERATION_LABEL.inbound}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Categoria</Label>
          <Select value={item.category} onValueChange={(v) => onChange({ category: v })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {cats.map((c) => <SelectItem key={c.key} value={c.key}>{c.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="mt-3 space-y-2">
        <Input value={item.title} onChange={(e) => onChange({ title: e.target.value })} placeholder="Título" />
        <Textarea value={item.description} onChange={(e) => onChange({ description: e.target.value })} placeholder="Descrição" />
        <Textarea value={item.example} onChange={(e) => onChange({ example: e.target.value })} placeholder="Exemplo / frase pronta" />
        <div className="flex items-center gap-2">
          <Label className="text-xs">Prioridade</Label>
          <Select value={item.priority} onValueChange={(v) => onChange({ priority: v as Priority })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(["alta","media","baixa"] as Priority[]).map((p) => (
                <SelectItem key={p} value={p}>{PRIORITY_LABEL[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {duplicate && (
        <div className="mt-3 rounded-md border border-yellow-500/30 bg-yellow-500/5 p-3 text-xs">
          <p className="text-yellow-200">
            Já existe um item parecido na base: <strong>"{duplicate.title}"</strong>.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => onMerge(duplicate)} disabled={busy}>
              <GitMerge className="mr-2 h-3 w-3" /> Mesclar
            </Button>
            <Button size="sm" variant="outline" onClick={onSaveAnyway}>
              Salvar mesmo assim
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={onDiscard}>
              Descartar
            </Button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={onApprove} disabled={busy || rejected || !!duplicate}>
          <Check className="mr-2 h-3 w-3" /> Aprovar
        </Button>
        {!rejected ? (
          <Button size="sm" variant="ghost" className="text-destructive" onClick={onReject}>
            <X className="mr-2 h-3 w-3" /> Rejeitar
          </Button>
        ) : (
          <Button size="sm" variant="ghost" onClick={() => onChange({ status: "pending" })}>
            Reverter rejeição
          </Button>
        )}
        <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={onDiscard}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
}