import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Check, X, Edit2, Save, Trash2, FileText, Sparkles, Hand } from "lucide-react";
import { labelForCategory } from "./categoryLabels";

type Priority = "alta" | "media" | "baixa";
type Source = "manual" | "pdf" | "call";
type Status = "pending" | "active" | "inactive" | "rejected";

export type EditableItem = {
  id?: string;
  category: string;
  title: string;
  description?: string | null;
  example?: string | null;
  priority: Priority;
  source?: Source;
  status?: Status;
  created_at?: string;
};

const SOURCE_META: Record<Source, { label: string; icon: typeof FileText; cls: string }> = {
  manual: { label: "Manual", icon: Hand, cls: "border-slate-500/30 bg-slate-500/10 text-slate-300" },
  pdf: { label: "PDF", icon: FileText, cls: "border-purple-500/30 bg-purple-500/10 text-purple-300" },
  call: { label: "Ligação", icon: Sparkles, cls: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
};
const PRIORITY_CLS: Record<Priority, string> = {
  alta: "border-red-500/30 bg-red-500/10 text-red-300",
  media: "border-yellow-500/30 bg-yellow-500/10 text-yellow-300",
  baixa: "border-blue-500/30 bg-blue-500/10 text-blue-300",
};

export function KnowledgeItemCard({
  item, onSave, onApprove, onReject, onDelete, onToggleActive, showApproveActions = false,
}: {
  item: EditableItem;
  onSave?: (next: EditableItem) => void;
  onApprove?: () => void;
  onReject?: () => void;
  onDelete?: () => void;
  onToggleActive?: (next: boolean) => void;
  showApproveActions?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditableItem>(item);
  const src = (item.source ?? "manual") as Source;
  const SrcIcon = SOURCE_META[src].icon;

  return (
    <div className="rounded-md border border-border bg-background/40 p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Badge variant="outline" className={SOURCE_META[src].cls}>
          <SrcIcon className="mr-1 h-3 w-3" /> {SOURCE_META[src].label}
        </Badge>
        <Badge variant="outline" className={PRIORITY_CLS[item.priority]}>
          {item.priority === "alta" ? "Alta" : item.priority === "media" ? "Média" : "Baixa"}
        </Badge>
        <Badge variant="secondary">{labelForCategory(item.category)}</Badge>
        {item.status && item.status !== "active" && (
          <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/10 text-yellow-300">
            {item.status === "pending" ? "Pendente" : item.status === "inactive" ? "Inativo" : "Rejeitado"}
          </Badge>
        )}
      </div>

      {editing ? (
        <div className="space-y-2">
          <Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="Título" />
          <Textarea value={draft.description ?? ""} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Descrição" />
          <Textarea value={draft.example ?? ""} onChange={(e) => setDraft({ ...draft, example: e.target.value })} placeholder="Exemplo / frase pronta" />
          <div className="flex gap-2">
            <Select value={draft.priority} onValueChange={(v) => setDraft({ ...draft, priority: v as Priority })}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alta">Alta</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="baixa">Baixa</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" onClick={() => { onSave?.(draft); setEditing(false); }}>
              <Save className="mr-2 h-4 w-4" /> Salvar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => { setDraft(item); setEditing(false); }}>Cancelar</Button>
          </div>
        </div>
      ) : (
        <div>
          <h4 className="text-sm font-semibold">{item.title}</h4>
          {item.description && <p className="mt-1 text-sm text-muted-foreground">{item.description}</p>}
          {item.example && <p className="mt-2 rounded bg-muted/40 p-2 text-xs italic text-foreground/80">"{item.example}"</p>}
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {!editing && (
          <Button size="sm" variant="outline" onClick={() => { setDraft(item); setEditing(true); }}>
            <Edit2 className="mr-2 h-3 w-3" /> Editar
          </Button>
        )}
        {showApproveActions && (
          <>
            <Button size="sm" onClick={onApprove}>
              <Check className="mr-2 h-3 w-3" /> Aprovar
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive" onClick={onReject}>
              <X className="mr-2 h-3 w-3" /> Rejeitar
            </Button>
          </>
        )}
        {onToggleActive && (
          <Button size="sm" variant="ghost" onClick={() => onToggleActive(item.status !== "active")}>
            {item.status === "active" ? "Desativar" : "Ativar"}
          </Button>
        )}
        {onDelete && (
          <Button size="sm" variant="ghost" className="text-destructive ml-auto" onClick={onDelete}>
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>
    </div>
  );
}