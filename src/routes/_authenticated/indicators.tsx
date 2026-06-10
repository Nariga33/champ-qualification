import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getMyProfile } from "@/lib/auth.functions";
import { IndicatorsView } from "@/features/indicators/IndicatorsView";

export const Route = createFileRoute("/_authenticated/indicators")({
  component: IndicatorsPage,
  head: () => ({ meta: [{ title: "Indicadores — Operação Telefônica" }] }),
});

function IndicatorsPage() {
  const fetchProfile = useServerFn(getMyProfile);
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: () => fetchProfile() });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl px-6 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
              <BarChart3 className="h-7 w-7 text-primary" /> Indicadores
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">Dashboard da operação telefônica via API4Com.</p>
          </div>
          <Link to="/"><Button variant="outline"><ArrowLeft className="mr-2 h-4 w-4" /> Voltar</Button></Link>
        </div>
        <IndicatorsView isAdmin={!!me?.isAdmin} />
      </div>
    </div>
  );
}
