import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listSegments, getSegment, upsertSegment, deleteSegment,
} from "@/lib/knowledge.functions";
import { getMyProfile } from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, BookOpen, Plus, Trash2, Loader2, Save, FolderOpen, Library } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import {
  CATEGORY_META_BY_OP, OPERATION_LABEL,
  type KnowledgeBase, type KnowledgeItem, type Operation, type Priority,
  type CategoryItems,
} from "@/features/knowledge-base/types";

export const Route = createFileRoute("/_authenticated/knowledge-base")({
  component: KnowledgeBasePage,
  head: () => ({ meta: [{ title: "Base de Conhecimento" }] }),
});

const PRIORITY_LABEL: Record<Priority, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
const PRIORITY_COLOR: Record<Priority, string> = {
  alta: "bg-red-500/15 text-red-400 border-red-500/30",
  media: "bg-yellow-500/15 text-yellow-400 border-yellow-500/30",
  baixa: "bg-blue-500/15 text-blue-400 border-blue-500/30",
};

function newItem(): KnowledgeItem {
  return { id: crypto.randomUUID(), title: "", description: "", example: "", priority: "media" };
}

function KnowledgeBasePage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const fetchSegments = useServerFn(listSegments);
  const fetchSegment = useServerFn(getSegment);
  const saveSegment = useServerFn(upsertSegment);
  const removeSegment = useServerFn(deleteSegment);

  const { data: me, isLoading: meLoading } = useQuery({ queryKey: ["me"], queryFn: () => fetchProfile() });
  const { data: segments, isLoading } = useQuery({
    queryKey: ["segments"], queryFn: () => fetchSegments(),
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [knowledge, setKnowledge] = useState<KnowledgeBase>({});
  const [operation, setOperation] = useState<Operation>("outbound");

  const loadSegment = async (id: string | null) => {
    if (!id) {
      setSelectedId(null); setName(""); setDescription(""); setKnowledge({});
      return;
    }
    const seg = await fetchSegment({ data: { id } });
    if (!seg) return;
    setSelectedId(seg.id);
    setName(seg.name);
    setDescription(seg.description ?? "");
    const k = (seg.knowledge ?? {}) as any;
    // backward-compat: se vier no formato antigo (sem outbound/inbound), trate como outbound
    if (k && (k.outbound || k.inbound)) {
      setKnowledge(k as KnowledgeBase);
    } else {
      setKnowledge({ outbound: k, inbound: {} });
    }
  };

  const saveMut = useMutation({
    mutationFn: () =>
      saveSegment({
        data: {
          id: selectedId ?? undefined,
          name: name.trim(),
          description: description.trim(),
          knowledge,
        },
      }),
    onSuccess: (row: any) => {
      toast.success("Segmento salvo");
      qc.invalidateQueries({ queryKey: ["segments"] });
      setSelectedId(row.id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao salvar"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => removeSegment({ data: { id } }),
    onSuccess: () => {
      toast.success("Segmento removido");
      qc.invalidateQueries({ queryKey: ["segments"] });
      loadSegment(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao remover"),
  });

  const updateCategory = (op: Operation, cat: string, items: KnowledgeItem[]) => {
    setKnowledge((k) => ({
      ...k,
      [op]: { ...(k[op] ?? {}), [cat]: items },
    }));
  };

  const currentCats: CategoryItems = knowledge[operation] ?? {};

  if (meLoading) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!me?.isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center px-4">
        <Card className="max-w-md p-8 text-center">
          <h1 className="text-xl font-semibold">Acesso restrito</h1>
          <p className="mt-2 text-sm text-muted-foreground">Esta área é apenas para administradores.</p>
          <Button className="mt-6" onClick={() => navigate({ to: "/" })}>Voltar</Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster theme="dark" />
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
              <Library className="h-7 w-7 text-primary" /> Base de Conhecimento
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Cadastre segmentos de mercado e o que esperar de cada conversa.
            </p>
          </div>
          <Link to="/"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button></Link>
        </div>

        <div className="grid gap-6 md:grid-cols-[280px_1fr]">
          <Card className="border-border bg-card p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <FolderOpen className="h-4 w-4 text-primary" /> Segmentos
              </h2>
              <Button size="sm" variant="ghost" onClick={() => loadSegment(null)}>
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            {isLoading ? (
              <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            ) : segments && segments.length > 0 ? (
              <ul className="space-y-1">
                {segments.map((s: any) => (
                  <li key={s.id}>
                    <button
                      onClick={() => loadSegment(s.id)}
                      className={`w-full rounded-md px-3 py-2 text-left text-sm transition ${selectedId === s.id ? "bg-primary/15 text-primary" : "hover:bg-muted"}`}
                    >
                      {s.name}
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="rounded-md border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                <BookOpen className="mx-auto mb-2 h-6 w-6 opacity-50" />
                Nenhum segmento cadastrado.
              </div>
            )}
          </Card>

          <div className="space-y-4">
            <Card className="border-border bg-card p-6">
              <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label>Nome do segmento</Label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Indústria 4.0, Logística, Saúde…" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Descrição</Label>
                    <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Contexto do segmento, perfil de empresa, ICP…" />
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <Button onClick={() => saveMut.mutate()} disabled={!name.trim() || saveMut.isPending}>
                    {saveMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {selectedId ? "Salvar alterações" : "Criar segmento"}
                  </Button>
                  {selectedId && (
                    <Button variant="ghost" className="text-destructive hover:text-destructive"
                      onClick={() => { if (confirm("Excluir este segmento?")) deleteMut.mutate(selectedId); }}>
                      <Trash2 className="mr-2 h-4 w-4" /> Excluir
                    </Button>
                  )}
                </div>
              </div>
            </Card>

            <Card className="border-border bg-card p-6">
              <div className="mb-4 flex items-center gap-2 border-b border-border pb-4">
                <Label className="text-sm">Operação:</Label>
                {(["outbound","inbound"] as Operation[]).map((op) => (
                  <Button
                    key={op}
                    type="button"
                    size="sm"
                    variant={operation === op ? "default" : "outline"}
                    onClick={() => setOperation(op)}
                  >
                    {OPERATION_LABEL[op]}
                  </Button>
                ))}
              </div>
              <Tabs key={operation} defaultValue={CATEGORY_META_BY_OP[operation][0].key}>
                <TabsList className="flex h-auto flex-wrap justify-start gap-1 bg-transparent p-0">
                  {CATEGORY_META_BY_OP[operation].map((c) => (
                    <TabsTrigger key={c.key} value={c.key} className="data-[state=active]:bg-primary/15 data-[state=active]:text-primary">
                      {c.label}
                      {currentCats[c.key]?.length ? (
                        <Badge variant="secondary" className="ml-2">{currentCats[c.key]!.length}</Badge>
                      ) : null}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {CATEGORY_META_BY_OP[operation].map((c) => (
                  <TabsContent key={c.key} value={c.key} className="mt-6">
                    <CategoryEditor
                      hint={c.hint}
                      items={currentCats[c.key] ?? []}
                      onChange={(items) => updateCategory(operation, c.key, items)}
                    />
                  </TabsContent>
                ))}
              </Tabs>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function CategoryEditor({
  hint, items, onChange,
}: {
  hint: string;
  items: KnowledgeItem[];
  onChange: (items: KnowledgeItem[]) => void;
}) {
  const update = (idx: number, patch: Partial<KnowledgeItem>) => {
    const next = items.map((it, i) => (i === idx ? { ...it, ...patch } : it));
    onChange(next);
  };
  const remove = (idx: number) => onChange(items.filter((_, i) => i !== idx));
  const add = () => onChange([...items, newItem()]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{hint}</p>
        <Button size="sm" variant="outline" onClick={add}><Plus className="mr-2 h-4 w-4" /> Adicionar item</Button>
      </div>

      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Nenhum item cadastrado. Clique em "Adicionar item" para começar.
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((it, idx) => (
            <li key={it.id} className="rounded-md border border-border bg-background/40 p-4">
              <div className="grid gap-3 md:grid-cols-[1fr_140px_auto]">
                <Input value={it.title} placeholder="Título"
                  onChange={(e) => update(idx, { title: e.target.value })} />
                <Select value={it.priority} onValueChange={(v) => update(idx, { priority: v as Priority })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(["alta","media","baixa"] as Priority[]).map((p) => (
                      <SelectItem key={p} value={p}>
                        <span className={`mr-2 inline-block rounded-full border px-2 py-0.5 text-xs ${PRIORITY_COLOR[p]}`}>{PRIORITY_LABEL[p]}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive"
                  onClick={() => remove(idx)}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <Textarea className="mt-3" placeholder="Descrição"
                value={it.description ?? ""} onChange={(e) => update(idx, { description: e.target.value })} />
              <Textarea className="mt-3" placeholder="Exemplo de uso (frase pronta para usar na call)"
                value={it.example ?? ""} onChange={(e) => update(idx, { example: e.target.value })} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}