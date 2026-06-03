import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Loader2, Inbox } from "lucide-react";
import { toast } from "sonner";
import {
  listKnowledgeItems, setKnowledgeItemStatus, upsertKnowledgeItem, deleteKnowledgeItem,
} from "@/lib/knowledge-items.functions";
import { listSegments } from "@/lib/knowledge.functions";
import { KnowledgeItemCard, type EditableItem } from "./KnowledgeItemCard";

export function CallSuggestionsTab() {
  const qc = useQueryClient();
  const fetchItems = useServerFn(listKnowledgeItems);
  const fetchSegments = useServerFn(listSegments);
  const setStatus = useServerFn(setKnowledgeItemStatus);
  const upsert = useServerFn(upsertKnowledgeItem);
  const remove = useServerFn(deleteKnowledgeItem);

  const { data: segments } = useQuery({ queryKey: ["segments"], queryFn: () => fetchSegments() });
  const { data: items, isLoading } = useQuery({
    queryKey: ["knowledge_items", { source: "call", status: "pending" }],
    queryFn: () => fetchItems({ data: { source: "call", status: "pending" } }),
  });

  const segName = (id: string | null) => (segments ?? []).find((s: any) => s.id === id)?.name ?? "—";

  const approve = useMutation({
    mutationFn: (id: string) => setStatus({ data: { id, status: "active" } }),
    onSuccess: () => { toast.success("Aprovado"); qc.invalidateQueries({ queryKey: ["knowledge_items"] }); },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha"),
  });
  const reject = useMutation({
    mutationFn: (id: string) => setStatus({ data: { id, status: "rejected" } }),
    onSuccess: () => { toast.success("Rejeitado"); qc.invalidateQueries({ queryKey: ["knowledge_items"] }); },
  });
  const saveEdit = useMutation({
    mutationFn: (it: EditableItem & { id: string; segment_id: string; operation: "outbound" | "inbound" }) =>
      upsert({ data: {
        id: it.id,
        segment_id: it.segment_id,
        operation: it.operation,
        category: it.category,
        title: it.title,
        description: it.description ?? "",
        example: it.example ?? "",
        priority: it.priority,
        source: "call",
        status: it.status ?? "pending",
      } as any }),
    onSuccess: () => { toast.success("Atualizado"); qc.invalidateQueries({ queryKey: ["knowledge_items"] }); },
  });
  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); qc.invalidateQueries({ queryKey: ["knowledge_items"] }); },
  });

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>;

  if (!items || items.length === 0) {
    return (
      <Card className="border-dashed border-border bg-card p-12 text-center">
        <Inbox className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Sem sugestões pendentes. Em uma análise de ligação, clique em <strong>"Gerar conhecimento desta ligação"</strong> para criar sugestões.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {(items as any[]).map((it) => (
        <div key={it.id}>
          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>Segmento: <strong className="text-foreground">{segName(it.segment_id)}</strong></span>
            <span>·</span>
            <span>{it.operation === "inbound" ? "Inbound (BANT)" : "Outbound (CHAMP)"}</span>
            <span>·</span>
            <span>{new Date(it.created_at).toLocaleString("pt-BR")}</span>
          </div>
          <KnowledgeItemCard
            item={it as EditableItem}
            showApproveActions
            onApprove={() => approve.mutate(it.id)}
            onReject={() => reject.mutate(it.id)}
            onDelete={() => del.mutate(it.id)}
            onSave={(next) => saveEdit.mutate({ ...next, id: it.id, segment_id: it.segment_id, operation: it.operation })}
          />
        </div>
      ))}
    </div>
  );
}