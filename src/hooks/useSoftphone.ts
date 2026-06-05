import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { getMySipCredentials } from "@/lib/auth.functions";
import type { RegistrationState, Softphone } from "@/lib/api4com/softphone";

type CallState = "idle" | "ringing" | "in_call";
export type SoftphoneStatus = RegistrationState | "disabled";

/**
 * Registra o ramal do SDR (softphone WebRTC) ao montar e gerencia a chamada.
 * `getStreams` expõe os MediaStreams da ligação ativa (base para a Fase 3b).
 */
export function useSoftphone() {
  const fetchCreds = useServerFn(getMySipCredentials);
  const [status, setStatus] = useState<SoftphoneStatus>("disabled");
  const [callState, setCallState] = useState<CallState>("idle");
  const [extension, setExtension] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);

  const phoneRef = useRef<Softphone | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const streamsRef = useRef<{ local: MediaStream; remote: MediaStream } | null>(null);

  useEffect(() => {
    let cancelled = false;
    let phone: Softphone | null = null;

    (async () => {
      const creds = await fetchCreds();
      if (cancelled || !creds.configured) return;
      setExtension(creds.extension);

      // Import dinâmico: sip.js só carrega no browser (evita SSR).
      const { Softphone } = await import("@/lib/api4com/softphone");
      phone = new Softphone(creds, {
        onRegistration: (s) => setStatus(s),
        onIncoming: () => setCallState("ringing"),
        onAnswered: (streams) => {
          streamsRef.current = streams;
          setCallState("in_call");
          const audio = audioRef.current ?? new Audio();
          audio.autoplay = true;
          audio.srcObject = streams.remote;
          void audio.play().catch(() => {});
          audioRef.current = audio;
        },
        onEnded: () => {
          setCallState("idle");
          setMuted(false);
          streamsRef.current = null;
        },
      });
      phoneRef.current = phone;
      await phone.start().catch(() => {});
    })();

    return () => {
      cancelled = true;
      void phone?.stop().catch(() => {});
      phoneRef.current = null;
    };
  }, [fetchCreds]);

  const hangup = useCallback(() => phoneRef.current?.hangup(), []);
  const toggleMute = useCallback(() => {
    setMuted((m) => {
      const next = !m;
      phoneRef.current?.setMuted(next);
      return next;
    });
  }, []);

  return {
    status,
    callState,
    extension,
    muted,
    hangup,
    toggleMute,
    getStreams: () => streamsRef.current,
  };
}
