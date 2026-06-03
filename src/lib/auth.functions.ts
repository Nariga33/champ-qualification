import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const EMAIL_DOMAIN = "oxy.app";
const ADMIN_USERNAME = "matheus.reis";
const ADMIN_PASSWORD = "Mjunhy123!";
const ADMIN_FULL_NAME = "Matheus Reis";

const usernameToEmail = (u: string) =>
  `${u.toLowerCase().trim().replace(/[^a-z0-9._-]/g, "")}@${EMAIL_DOMAIN}`;

/** Idempotent: creates the seed admin if no admin exists yet. Safe to call anonymously. */
export const ensureAdmin = createServerFn({ method: "POST" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  const { count, error: countErr } = await supabaseAdmin
    .from("user_roles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");
  if (countErr) throw new Error(countErr.message);
  if ((count ?? 0) > 0) return { created: false };

  const email = usernameToEmail(ADMIN_USERNAME);
  const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: ADMIN_PASSWORD,
    email_confirm: true,
    user_metadata: {
      username: ADMIN_USERNAME,
      full_name: ADMIN_FULL_NAME,
      role: "admin",
    },
  });
  if (createErr) throw new Error(createErr.message);

  // Trigger handle_new_user inserts profile+role; ensure admin role just in case.
  if (created.user) {
    await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: created.user.id, role: "admin" }, { onConflict: "user_id,role" });
  }
  return { created: true };
});

/** Resolve username -> email so the client can sign in via supabase.auth. */
export const resolveLoginEmail = createServerFn({ method: "POST" })
  .inputValidator((d: { username: string }) =>
    z.object({ username: z.string().min(1).max(64) }).parse(d),
  )
  .handler(async ({ data }) => ({ email: usernameToEmail(data.username) }));

/** Current user's profile + roles. */
export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: profile }, { data: roles }] = await Promise.all([
      supabase.from("profiles").select("*").eq("user_id", userId).maybeSingle(),
      supabase.from("user_roles").select("role").eq("user_id", userId),
    ]);
    return {
      profile,
      roles: (roles ?? []).map((r) => r.role),
      isAdmin: (roles ?? []).some((r) => r.role === "admin"),
      operation: (profile?.operation ?? "outbound") as "outbound" | "inbound",
    };
  });

async function assertAdmin(supabase: any, userId: string) {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (!data) throw new Error("Acesso restrito a administradores");
}

export const listUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profiles, error } = await supabaseAdmin
      .from("profiles")
      .select("user_id, username, full_name, operation, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id, role");
    const roleMap = new Map<string, string[]>();
    (roles ?? []).forEach((r) => {
      const arr = roleMap.get(r.user_id) ?? [];
      arr.push(r.role);
      roleMap.set(r.user_id, arr);
    });
    return (profiles ?? []).map((p) => ({ ...p, roles: roleMap.get(p.user_id) ?? [] }));
  });

export const createSdrUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { username: string; fullName: string; password?: string; role?: "admin" | "sdr"; operation: "outbound" | "inbound" }) =>
    z
      .object({
        username: z.string().min(2).max(64).regex(/^[a-zA-Z0-9._-]+$/),
        fullName: z.string().min(1).max(120),
        password: z.string().min(4).max(120).optional(),
        role: z.enum(["admin", "sdr"]).optional(),
        operation: z.enum(["outbound", "inbound"]),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = usernameToEmail(data.username);
    const password = data.password && data.password.length > 0 ? data.password : "O2Inc*";
    const role = data.role ?? "sdr";
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { username: data.username, full_name: data.fullName, role, operation: data.operation },
    });
    if (error) throw new Error(error.message);
    // Garante operação no profile (caso o trigger já tenha rodado com default).
    if (created.user) {
      await supabaseAdmin.from("profiles").update({ operation: data.operation }).eq("user_id", created.user.id);
    }
    return { user_id: created.user?.id, username: data.username, email, password };
  });

export const updateUserOperation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; operation: "outbound" | "inbound" }) =>
    z.object({ user_id: z.string().uuid(), operation: z.enum(["outbound", "inbound"]) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ operation: data.operation })
      .eq("user_id", data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteUserById = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string }) =>
    z.object({ user_id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    if (data.user_id === userId) throw new Error("Você não pode excluir o próprio usuário");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.user_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { user_id: string; password: string }) =>
    z.object({ user_id: z.string().uuid(), password: z.string().min(4).max(120) }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });