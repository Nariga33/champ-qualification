import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listUsers,
  createSdrUser,
  deleteUserById,
  resetUserPassword,
  getMyProfile,
  updateUserOperation,
  updateUserExtension,
} from "@/lib/auth.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Plus, Trash2, KeyRound, ArrowLeft, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPage,
  head: () => ({ meta: [{ title: "Admin — Usuários" }] }),
});

function AdminPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const fetchProfile = useServerFn(getMyProfile);
  const fetchUsers = useServerFn(listUsers);
  const createUser = useServerFn(createSdrUser);
  const deleteUser = useServerFn(deleteUserById);
  const resetPw = useServerFn(resetUserPassword);
  const updateOp = useServerFn(updateUserOperation);
  const updateExt = useServerFn(updateUserExtension);

  const { data: me, isLoading: meLoading } = useQuery({ queryKey: ["me"], queryFn: () => fetchProfile() });
  const { data: users, isLoading } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: () => fetchUsers(),
    enabled: !!me?.isAdmin,
  });

  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("O2Inc*");
  const [role, setRole] = useState<"sdr" | "admin">("sdr");
  const [operation, setOperation] = useState<"outbound" | "inbound">("outbound");
  const [extension, setExtension] = useState("");

  const createMut = useMutation({
    mutationFn: () => createUser({ data: { username, fullName, password, role, operation, extension: extension || undefined } }),
    onSuccess: (r) => {
      toast.success(`Usuário ${r.username} criado (senha: ${r.password})`);
      setUsername(""); setFullName(""); setPassword("O2Inc*"); setRole("sdr"); setOperation("outbound"); setExtension("");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao criar"),
  });

  const deleteMut = useMutation({
    mutationFn: (user_id: string) => deleteUser({ data: { user_id } }),
    onSuccess: () => {
      toast.success("Usuário removido");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao remover"),
  });

  const resetMut = useMutation({
    mutationFn: ({ user_id, password }: { user_id: string; password: string }) =>
      resetPw({ data: { user_id, password } }),
    onSuccess: () => toast.success("Senha redefinida"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao redefinir"),
  });

  const opMut = useMutation({
    mutationFn: (vars: { user_id: string; operation: "outbound" | "inbound" }) => updateOp({ data: vars }),
    onSuccess: () => {
      toast.success("Operação atualizada");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar operação"),
  });

  const extMut = useMutation({
    mutationFn: (vars: { user_id: string; extension: string | null }) => updateExt({ data: vars }),
    onSuccess: () => {
      toast.success("Ramal atualizado");
      qc.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar ramal"),
  });

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
      <div className="mx-auto max-w-5xl px-6 py-12">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
              <ShieldCheck className="h-7 w-7 text-primary" /> Administração
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Gerencie BDRs / SDRs da equipe.</p>
          </div>
          <Link to="/"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button></Link>
        </div>

        <Card className="p-6 border-border bg-card">
          <h2 className="text-lg font-semibold">Criar usuário</h2>
          <form
            onSubmit={(e) => { e.preventDefault(); createMut.mutate(); }}
            className="mt-4 grid gap-4 md:grid-cols-2"
          >
            <div className="space-y-2">
              <Label>Nome completo</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="João Silva" required />
            </div>
            <div className="space-y-2">
              <Label>Usuário (login)</Label>
              <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="joao.silva" pattern="[a-zA-Z0-9._-]+" required />
            </div>
            <div className="space-y-2">
              <Label>Senha</Label>
              <Input value={password} onChange={(e) => setPassword(e.target.value)} required minLength={4} />
              <p className="text-xs text-muted-foreground">Padrão: <code>O2Inc*</code></p>
            </div>
            <div className="space-y-2">
              <Label>Papel</Label>
              <Select value={role} onValueChange={(v) => setRole(v as "sdr" | "admin")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sdr">BDR / SDR</SelectItem>
                  <SelectItem value="admin">Administrador</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Operação *</Label>
              <Select value={operation} onValueChange={(v) => setOperation(v as "outbound" | "inbound")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="outbound">Outbound — CHAMP</SelectItem>
                  <SelectItem value="inbound">Inbound — BANT</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Define a metodologia de qualificação usada nas calls desse usuário.</p>
            </div>
            <div className="space-y-2">
              <Label>Ramal API4Com</Label>
              <Input value={extension} onChange={(e) => setExtension(e.target.value)} placeholder="Ex.: 1014" />
              <p className="text-xs text-muted-foreground">Ramal usado para originar as ligações desse SDR (opcional).</p>
            </div>
            <div className="md:col-span-2">
              <Button type="submit" disabled={createMut.isPending}>
                {createMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                Criar usuário
              </Button>
            </div>
          </form>
        </Card>

        <Card className="mt-8 p-6 border-border bg-card">
          <h2 className="text-lg font-semibold">Usuários ({users?.length ?? 0})</h2>
          {isLoading ? (
            <div className="mt-4 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {users?.map((u) => (
                <li key={u.user_id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="font-medium">{u.full_name}</div>
                    <div className="text-xs text-muted-foreground">
                      @{u.username} · {u.roles.join(", ") || "sem papel"} ·{" "}
                      <span className={u.operation === "inbound" ? "text-cyan-400" : "text-emerald-400"}>
                        {u.operation === "inbound" ? "Inbound — BANT" : "Outbound — CHAMP"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      key={`ext-${u.user_id}-${u.api4com_extension ?? ""}`}
                      defaultValue={u.api4com_extension ?? ""}
                      placeholder="Ramal"
                      title="Ramal API4Com"
                      className="h-8 w-[90px]"
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (u.api4com_extension ?? "")) extMut.mutate({ user_id: u.user_id, extension: v || null });
                      }}
                    />
                    <Select
                      value={(u.operation as "outbound" | "inbound") ?? "outbound"}
                      onValueChange={(v) => opMut.mutate({ user_id: u.user_id, operation: v as "outbound" | "inbound" })}
                    >
                      <SelectTrigger className="h-8 w-[160px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="outbound">Outbound — CHAMP</SelectItem>
                        <SelectItem value="inbound">Inbound — BANT</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button
                      variant="outline" size="sm"
                      onClick={() => {
                        const pw = prompt(`Nova senha para @${u.username}:`, "O2Inc*");
                        if (pw && pw.length >= 4) resetMut.mutate({ user_id: u.user_id, password: pw });
                      }}
                    >
                      <KeyRound className="mr-2 h-4 w-4" /> Senha
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        if (confirm(`Remover @${u.username}?`)) deleteMut.mutate(u.user_id);
                      }}
                      disabled={u.user_id === me?.profile?.user_id}
                    >
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