import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Upload, FileText, CheckCheck } from "lucide-react";
import { toast } from "sonner";
import { listSegments } from "@/lib/knowledge.functions";
import { extractKnowledgeFromText, bulkInsertKnowledgeItems } from "@/lib/knowledge-items.functions";
import { OPERATION_LABEL, type Operation } from "./types";
import { KnowledgeItemCard, type EditableItem } from "./KnowledgeItemCard";

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

export function PdfImportTab() {
  const qc = useQueryClient();
  const fetchSegments = useServerFn(listSegments);
  const extractFn = useServerFn(extractKnowledgeFromText);
  const bulkInsert = useServerFn(bulkInsertKnowledgeItems);

  const { data: segments } = useQuery({ queryKey: ["segments"], queryFn: () => fetchSegments() });

  const [segmentId, setSegmentId] = useState<string>("");
  const [operation, setOperation] = useState<Operation>("outbound");
  const [extracting, setExtracting] = useState(false);
  const [items, setItems] = useState<EditableItem[]>([]);

  const onUpload = async (file: File) => {
    if (!segmentId) { toast.error("Selecione um segmento primeiro"); return; }
    setExtracting(true);
    try {
      toast.message("Extraindo texto do PDF…");
      const text = await extractTextFromPdf(file);
      if (text.trim().length < 30) throw new Error("PDF sem texto extraível (talvez seja escaneado).");
      toast.message("Analisando com IA…");
      const list = await extractFn({ data: { segment_id: segmentId, operation, text } });
      const editable: EditableItem[] = (list as any[]).map((it) => ({
        category: it.category,
        title: it.title,
        description: it.description,
        example: it.example,
        priority: it.priority,
        source: "pdf",
        status: "pending",
      }));
      setItems(editable);
      toast.success(`${editable.length} itens extraídos. Revise e salve.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar PDF");
    } finally {
      setExtracting(false);
    }
  };

  const removeAt = (idx: number) => setItems((arr) => arr.filter((_, i) => i !== idx));
  const updateAt = (idx: number, next: EditableItem) => setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, ...next } : it)));

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!segmentId || items.length === 0) return;
      return bulkInsert({
        data: {
          segment_id: segmentId,
          operation,
          source: "pdf",
          status: "active",
          items: items.map((it) => ({
            category: it.category,
            title: it.title,
            description: it.description ?? "",
            example: it.example ?? "",
            priority: it.priority,
          })),
        } as any,
      });
    },
    onSuccess: (res: any) => {
      toast.success(`${res?.length ?? items.length} itens salvos na base.`);
      setItems([]);
      qc.invalidateQueries({ queryKey: ["knowledge_items"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
  });

  return (
    <div className="space-y-6">
      <Card className="border-border bg-card p-6">
        <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
          <div className="space-y-1.5">
            <Label>Segmento</Label>
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
            <Label>Operação</Label>
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
                {extracting ? "Processando…" : "Subir PDF"}
              </div>
            </label>
          </div>
        </div>
        <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <FileText className="h-3 w-3" /> O PDF é lido no seu navegador; só o texto extraído é enviado à IA para estruturação.
        </p>
      </Card>

      {items.length > 0 && (
        <Card className="border-border bg-card p-6">
          <div className="mb-4 flex items-center justify-between">
            <h3 className="text-lg font-semibold">Revisão ({items.length} itens)</h3>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setItems([])}>Descartar tudo</Button>
              <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCheck className="mr-2 h-4 w-4" />}
                Aprovar e salvar todos
              </Button>
            </div>
          </div>
          <ul className="space-y-3">
            {items.map((it, idx) => (
              <li key={idx}>
                <KnowledgeItemCard
                  item={it}
                  onSave={(next) => updateAt(idx, next)}
                  onDelete={() => removeAt(idx)}
                />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}