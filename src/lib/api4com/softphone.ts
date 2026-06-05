// Softphone WebRTC sobre a API4Com (SIP.js).
// O ramal do SDR é registrado dentro do próprio app — assim, quando a Edge
// Function `dial` aciona a API4Com, ela toca neste ramal (INVITE de entrada),
// o softphone atende e a API4Com conecta no lead. O áudio dos dois lados fica
// disponível como MediaStream local/remoto (base para a Fase 3b — tempo real).

import {
  UserAgent,
  Registerer,
  RegistererState,
  SessionState,
  type Invitation,
  type Session,
} from "sip.js";

export interface SipConfig {
  extension: string;
  password: string;
  domain: string;
  wss: string;
}

export type RegistrationState = "connecting" | "registered" | "unregistered" | "failed";

export interface SoftphoneEvents {
  onRegistration?: (state: RegistrationState) => void;
  onIncoming?: () => void;
  onAnswered?: (streams: { local: MediaStream; remote: MediaStream }) => void;
  onEnded?: () => void;
  onError?: (err: unknown) => void;
}

export class Softphone {
  private ua: UserAgent;
  private registerer: Registerer;
  private session?: Session;

  constructor(private cfg: SipConfig, private events: SoftphoneEvents = {}) {
    const uri = UserAgent.makeURI(`sip:${cfg.extension}@${cfg.domain}`);
    if (!uri) throw new Error("URI SIP inválida");

    this.ua = new UserAgent({
      uri,
      transportOptions: { server: cfg.wss },
      authorizationUsername: cfg.extension,
      authorizationPassword: cfg.password,
      // Sem auto-resposta de mídia até atendermos explicitamente.
      delegate: { onInvite: (invitation) => this.handleIncoming(invitation) },
    });

    this.registerer = new Registerer(this.ua);
    this.registerer.stateChange.addListener((s) => {
      if (s === RegistererState.Registered) this.events.onRegistration?.("registered");
      else if (s === RegistererState.Unregistered) this.events.onRegistration?.("unregistered");
    });
  }

  async start(): Promise<void> {
    this.events.onRegistration?.("connecting");
    try {
      await this.ua.start();
      await this.registerer.register();
    } catch (err) {
      this.events.onRegistration?.("failed");
      this.events.onError?.(err);
      throw err;
    }
  }

  async stop(): Promise<void> {
    try {
      await this.registerer.unregister();
    } catch { /* ignore */ }
    await this.ua.stop();
  }

  hangup(): void {
    const s = this.session;
    if (!s) return;
    if (s.state === SessionState.Established) s.bye();
    else if ("reject" in s) (s as Invitation).reject();
  }

  setMuted(muted: boolean): void {
    this.peerConnection()?.getSenders().forEach((sender) => {
      if (sender.track?.kind === "audio") sender.track.enabled = !muted;
    });
  }

  private handleIncoming(invitation: Invitation): void {
    this.session = invitation;
    this.events.onIncoming?.();

    invitation.stateChange.addListener((state) => {
      if (state === SessionState.Established) this.onEstablished();
      if (state === SessionState.Terminated) {
        this.session = undefined;
        this.events.onEnded?.();
      }
    });

    invitation
      .accept({ sessionDescriptionHandlerOptions: { constraints: { audio: true, video: false } } })
      .catch((err) => this.events.onError?.(err));
  }

  private onEstablished(): void {
    const pc = this.peerConnection();
    if (!pc) return;

    const remote = new MediaStream();
    pc.getReceivers().forEach((r) => r.track && remote.addTrack(r.track));
    const local = new MediaStream();
    pc.getSenders().forEach((s) => s.track && local.addTrack(s.track));

    this.events.onAnswered?.({ local, remote });
  }

  private peerConnection(): RTCPeerConnection | undefined {
    const sdh = this.session?.sessionDescriptionHandler as
      | { peerConnection?: RTCPeerConnection }
      | undefined;
    return sdh?.peerConnection;
  }
}
