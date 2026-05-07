import { createFileRoute } from "@tanstack/react-router";
import { useState, useRef } from "react";
import { Mic, Square, Upload, Copy, Loader2, Sparkles, FileAudio } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Qualificador de Cold Calls — Transcrição & Resumo CRM" },
      { name: "description", content: "Transcreva cold calls e gere automaticamente o resumo no padrão CRM pronto para colar." },
    ],
  }),
});

function Index() {
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [audioInfo, setAudioInfo] = useState<string>("");
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const processBlob = async (blob: Blob, label: string) => {
    setAudioInfo(`${label} • ${(blob.size / 1024 / 1024).toFixed(2)} MB`);
    setLoading(true);
    setSummary("");
    try {
      const ext = blob.type.includes("mp3") ? "mp3" : blob.type.includes("wav") ? "wav" : blob.type.includes("mpeg") ? "mp3" : "webm";
      const filename = (blob instanceof File ? blob.name : `audio.${ext}`);
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-call`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
          "Content-Type": blob.type || "audio/webm",
          "x-filename": filename,
        },
        body: blob,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Falha ao processar áudio");
      setSummary(data.summary);
      toast.success("Resumo gerado!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao processar");
    } finally {
      setLoading(false);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        stream.getTracks().forEach((t) => t.stop());
        processBlob(blob, "Gravação");
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
    } catch {
      toast.error("Não foi possível acessar o microfone");
    }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
  };

  const onUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    processBlob(file, file.name);
  };

  const copy = async () => {
    await navigator.clipboard.writeText(summary);
    toast.success("Resumo copiado para a área de transferência");
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      <Toaster theme="dark" />
      <div className="mx-auto max-w-5xl px-6 py-12">
        <header className="mb-12 text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Powered by AI
          </div>
          <h1 className="mt-6 text-5xl font-bold tracking-tight md:text-6xl">
            Qualificador de <span className="text-primary">Cold Calls</span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">
            Grave ou envie o áudio da chamada e receba o resumo CRM pronto para colar.
          </p>
        </header>

        <Card className="border-border bg-card p-8">
          <div className="grid gap-4 md:grid-cols-2">
            <Button
              size="lg"
              variant={recording ? "destructive" : "default"}
              onClick={recording ? stopRecording : startRecording}
              disabled={loading}
              className="h-24 text-base"
            >
              {recording ? (
                <><Square className="mr-2 h-5 w-5 animate-pulse" /> Parar gravação</>
              ) : (
                <><Mic className="mr-2 h-5 w-5" /> Gravar cold call</>
              )}
            </Button>

            <label className="cursor-pointer">
              <input type="file" accept="audio/*" onChange={onUpload} className="hidden" disabled={loading || recording} />
              <div className="flex h-24 items-center justify-center rounded-md border border-dashed border-border bg-secondary text-base font-medium text-secondary-foreground transition hover:border-primary hover:text-primary">
                <Upload className="mr-2 h-5 w-5" /> Enviar arquivo de áudio
              </div>
            </label>
          </div>

          {audioInfo && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <FileAudio className="h-4 w-4" /> {audioInfo}
            </div>
          )}
        </Card>

        {loading && (
          <div className="mt-8 flex items-center justify-center gap-3 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Transcrevendo e qualificando…
          </div>
        )}

        {summary && (
          <Card className="mt-8 border-border bg-card p-8">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-xl font-semibold">Resumo CRM</h2>
              <Button onClick={copy} variant="default" size="sm">
                <Copy className="mr-2 h-4 w-4" /> Copiar para o CRM
              </Button>
            </div>
            <Textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              className="min-h-[480px] resize-y bg-background font-mono text-sm leading-relaxed"
            />
          </Card>
        )}
      </div>
    </div>
  );
}
