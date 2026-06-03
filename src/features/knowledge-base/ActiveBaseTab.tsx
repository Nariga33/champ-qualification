import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  listKnowledgeItems, setKnowledgeItemStatus, upsertKnowledgeItem, deleteKnowledgeItem,
} from "@/lib/knowledge-items.functions";
import { listSegments } from "@/lib/knowledge.functions";
import { KnowledgeItemCard, type EditableItem } from "./KnowledgeItemCard";
import { ALL_CATEGORY_KEYS, labelForCategory } from "./categoryLabels";

type Source = "manual" | "pdf" | "call";
type Priority = "alta" | "media" | "baixa";

export function ActiveBaseTab() {
  const qc = useQueryClient();
  const fetchItems = useServerFn(listKnowledgeItems);
  const fetchSegments = useServerFn(listSegments);
  const setStatus = useServerFn(setKnowledgeItemStatus);
  const upsert = useServerFn(upsertKnowledgeItem);
  const remove = useServerFn(deleteKnowledgeItem);

  const [segmentId, setSegmentId] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [category, setCategory] = useState<string>("all");
  const [priority, setPriority] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("active");

  const { data: segments } = useQuery({ queryKey: ["segments"], queryFn: () => fetchSegments() });

  const filters = {
    segment_id: segmentId === "all" ? null : segmentId,
    source: source === "all" ? null : (source as Source),
    category: category === "all" ? null : category,
    priority: priority === "all" ? null : (priority as Priority),
    status: statusFilter === "all" ? null : (statusFilter as any),
    search: search.trim() || null,
  };

  const { data: items, isLoading } = useQuery({
    queryKey: ["knowledge_items", filters],
    queryFn: () => fetchItems({ data: filters as any }),
  });

  const segName = (id: string | null) => (segments ?? []).find((s: any) => s.id === id)?.name ?? "—";

  const toggle = useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) =>
      setStatus({ data: { id, status: next ? "active" : "inactive" } }),
    onSuccess: () => { toast.success("Atualizado"); qc.invalidateQueries({ queryKey: ["knowledge_items"] }); },
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
        source: it.source ?? "manual",
        status: it.status ?? "active",
      } as any }),
    onSuccess: () => { toast.success("Salvo"); qc.invalidateQueries({ queryKey: ["knowledge_items"] }); },
  });
  const del = useMutation({
    mutationFn: (id: string) => remove({ data: { id } }),
    onSuccess: () => { toast.success("Removido"); qc.invalidateQueries({ queryKey: ["knowledge_items"] }); },
  });

  return (
    <div className="space-y-4">
      <Card className="border-border bg-card p-4">
        <div className="grid gap-3 md:grid-cols-6">
          <div>
            <Label className="text-xs">Segmento</Label>
            <Select value={segmentId} onValueChange={setSegmentId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                {(segments ?? []).map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Origem</Label>
            <Select value={source} onValueChange={setSource}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="pdf">PDF</SelectItem>
                <SelectItem value="call">Ligação</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {ALL_CATEGORY_KEYS.map((k) => <SelectItem key={k} value={k}>{labelForCategory(k)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Prioridade</Label>
            <Select value={priority} onValueChange={setPriority}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="baixa">Baixa</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Status</Label>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
                <SelectItem value="pending">Pendentes</SelectItem>
                <SelectItem value="rejected">Rejeitados</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Buscar</Label>
            <div className="relative">
              <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="título…" className="pl-7" />
            </div>
          </div>
        </div>
      </Card>

      {isLoading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : !items || items.length === 0 ? (
        <Card className="border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Nenhum item encontrado com esses filtros.
        </Card>
      ) : (
        <div className="space-y-3">
          {(items as any[]).map((it) => (
            <div key={it.id}>
              <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                <span>{segName(it.segment_id)}</span>
                <span>·</span>
                <span>{it.operation === "inbound" ? "Inbound" : "Outbound"}</span>
                <span>·</span>
                <span>{new Date(it.created_at).toLocaleDateString("pt-BR")}</span>
              </div>
              <KnowledgeItemCard
                item={it as EditableItem}
                onToggleActive={(next) => toggle.mutate({ id: it.id, next })}
                onDelete={() => del.mutate(it.id)}
                onSave={(next) => saveEdit.mutate({ ...next, id: it.id, segment_id: it.segment_id, operation: it.operation })}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}