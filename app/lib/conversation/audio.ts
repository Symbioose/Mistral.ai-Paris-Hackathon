import { api } from "./types";

// Speech chain: microphone → STT → server persona → TTS → speakers + HeadAudio.
// Gradium is the production provider. Without GRADIUM_API_KEY the server hands out a
// Deepgram key only when the development fallback is explicitly enabled.
// Both paths produce PCM16 mono 24 kHz, so playback and lip-sync never change.

type Provider = "gradium" | "fallback" | "unavailable";
type Token =
  | { provider: "gradium"; token: string; host: string; voiceId: string }
  | { provider: "fallback"; token: string };
export interface VoiceStyle {
  gradiumVoiceId?: string | null;
  fallbackVoice?: string;
  style?: string;
}
interface WireMessage {
  type: string;
  text?: string;
  audio?: string;
  error?: string;
  message?: string;
  vad?: { inactivity_prob: number }[];
  flush_id?: number;
}

const PCM_RATE = 24000;
const toBase64 = (buffer: ArrayBuffer) => {
  let s = "";
  for (const b of new Uint8Array(buffer)) s += String.fromCharCode(b);
  return btoa(s);
};
const fromBase64 = (text: string) =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const token = () => api<Token>("/api/simulation/voice/token", {});

let providerRequest: Promise<Provider> | null = null;
/** Which provider the server is configured for. Cached per page. */
export function voiceProvider(): Promise<Provider> {
  providerRequest ??= fetch("/api/simulation/voice/token", {
    cache: "no-store",
  })
    .then((r) => r.json())
    .then((d: { provider?: Provider }) => d.provider || "unavailable")
    .catch(() => {
      providerRequest = null;
      return "unavailable" as const;
    });
  return providerRequest;
}

async function gradiumSocket(
  t: Extract<Token, { provider: "gradium" }>,
  kind: "asr" | "tts",
  setup: Record<string, unknown>,
  onMessage: (m: WireMessage) => void,
  onError: (message: string) => void,
) {
  const ws = new WebSocket(
    `wss://${t.host}/api/speech/${kind}?token=${encodeURIComponent(t.token)}`,
  );
  await new Promise<void>((resolve, reject) => {
    let ready = false;
    const timeout = setTimeout(() => {
      reject(new Error("La connexion vocale prend trop de temps."));
      ws.close();
    }, 12000);
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          type: "setup",
          model_name: "default",
          ...(kind === "tts" ? { voice_id: t.voiceId } : {}),
          ...setup,
        }),
      );
    ws.onmessage = (e) => {
      try {
        const message = JSON.parse(e.data) as WireMessage;
        if (message.type === "ready") {
          ready = true;
          clearTimeout(timeout);
          resolve();
        } else if (message.type === "error") {
          const error =
            message.message ||
            message.error ||
            "Le service vocal est momentanément indisponible.";
          clearTimeout(timeout);
          if (!ready) reject(new Error(error));
          else onError(error);
          ws.close();
        } else onMessage(message);
      } catch {
        onError("Réponse vocale illisible.");
      }
    };
    ws.onerror = () => {
      clearTimeout(timeout);
      if (!ready) reject(new Error("Connexion vocale impossible."));
      else onError("Connexion vocale interrompue.");
    };
    ws.onclose = (e) => {
      clearTimeout(timeout);
      if (!ready) reject(new Error("Connexion vocale fermée."));
      else if (e.code !== 1000)
        onError("Connexion vocale interrompue. Réactivez le micro.");
    };
  });
  return ws;
}

/** Plays the persona's streamed voice. Audio starts before the text response is complete. */
export class Speaker {
  readonly context: AudioContext;
  readonly gain: GainNode;
  private next = 0;
  private sources = new Set<AudioBufferSourceNode>();
  private generation = 0;
  private buffer = "";
  private outputStarted = false;
  private voice: VoiceStyle = {};
  private provider: Provider = "fallback";
  // Gradium: one socket per utterance. Fallback: one HTTP stream per sentence, played in order.
  private tts: WebSocket | null = null;
  private queue: Promise<void> = Promise.resolve();
  private aborts = new Set<AbortController>();
  onPlaying: (playing: boolean) => void = () => {};
  onError: (error: string) => void = () => {};
  constructor(context: AudioContext, gain: GainNode) {
    this.context = context;
    this.gain = gain;
  }
  get playing() {
    return this.sources.size > 0;
  }

  async begin(voice: VoiceStyle = {}) {
    this.interrupt();
    const generation = this.generation;
    this.voice = voice;
    await this.context.resume();
    this.provider = await voiceProvider();
    if (this.provider === "unavailable")
      throw new Error(
        "La voix est en cours de configuration. Continuez par écrit.",
      );
    if (this.provider !== "gradium" || generation !== this.generation) return;
    const t = await token();
    if (t.provider !== "gradium") {
      this.provider = "fallback";
      return;
    }
    const connection = await gradiumSocket(
      t,
      "tts",
      {
        output_format: `pcm_${PCM_RATE}`,
        ...(voice.gradiumVoiceId ? { voice_id: voice.gradiumVoiceId } : {}),
      },
      (m) => {
        if (generation !== this.generation) return;
        if (m.type === "audio" && m.audio) this.play(fromBase64(m.audio));
        if (m.type === "end_of_stream") {
          connection.close(1000);
          if (this.tts === connection) this.tts = null;
        }
      },
      this.onError,
    );
    if (generation !== this.generation) {
      connection.close(1000);
      return;
    }
    this.tts = connection;
  }

  /** Feeds streamed text; complete sentences are voiced immediately. */
  push(text: string) {
    this.buffer += text;
    for (;;) {
      const boundary = this.buffer.search(/[.!?…;:](\s|$)|\n/);
      if (boundary >= 0 && boundary < this.buffer.length - 1) {
        this.speak(this.buffer.slice(0, boundary + 1));
        this.buffer = this.buffer.slice(boundary + 1);
        continue;
      }
      // Long clause without punctuation: cut at a comma/space to keep latency low.
      const limit = this.provider === "gradium" ? 85 : 160;
      if (this.buffer.length > limit) {
        const comma = this.buffer.lastIndexOf(", ");
        const end = comma > 40 ? comma + 1 : this.buffer.lastIndexOf(" ");
        if (end > 0) {
          this.speak(this.buffer.slice(0, end), false);
          this.buffer = this.buffer.slice(end);
          continue;
        }
      }
      break;
    }
  }

  finish() {
    if (this.buffer.trim()) this.speak(this.buffer);
    this.buffer = "";
    if (this.tts?.readyState === WebSocket.OPEN)
      this.tts.send(JSON.stringify({ type: "end_of_stream" }));
  }

  interrupt() {
    this.generation++;
    this.tts?.close(1000);
    this.tts = null;
    for (const a of this.aborts) a.abort();
    this.aborts.clear();
    this.queue = Promise.resolve();
    this.buffer = "";
    for (const s of this.sources) {
      s.onended = null;
      try {
        s.stop();
      } catch {}
      s.disconnect();
    }
    this.sources.clear();
    this.next = 0;
    if (this.outputStarted) {
      this.outputStarted = false;
      this.onPlaying(false);
    }
  }

  private speak(text: string, sentenceEnd = true) {
    const clean = text
      .replace(/[*_#`]/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!clean) return;
    if (this.provider === "gradium") {
      if (this.tts?.readyState === WebSocket.OPEN)
        this.tts.send(
          JSON.stringify({
            type: "text",
            text: sentenceEnd ? `${clean} <flush>` : `${clean} `,
          }),
        );
      return;
    }
    // Every sentence request starts now (prefetch); playback stays in order.
    const generation = this.generation;
    const abort = new AbortController();
    this.aborts.add(abort);
    const response = fetch("/api/simulation/voice/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: clean,
        voice: this.voice.fallbackVoice,
        style: this.voice.style,
      }),
      signal: abort.signal,
    }).then(
      (res) => ({ res }),
      (error) => ({ error }),
    );
    this.queue = this.queue.then(async () => {
      try {
        const outcome = await response;
        if ("error" in outcome) throw outcome.error;
        const res = outcome.res;
        if (!res.ok || !res.body) throw new Error("voice");
        const reader = res.body.getReader();
        let carry: Uint8Array | null = null;
        for (;;) {
          const { value, done } = await reader.read();
          if (done || generation !== this.generation) break;
          let bytes = value;
          if (carry) {
            const merged = new Uint8Array(carry.length + bytes.length);
            merged.set(carry);
            merged.set(bytes, carry.length);
            bytes = merged;
            carry = null;
          }
          if (bytes.length % 2) {
            carry = bytes.slice(-1);
            bytes = bytes.subarray(0, bytes.length - 1);
          }
          this.play(bytes);
        }
      } catch (e) {
        if (
          generation === this.generation &&
          !(e instanceof DOMException && e.name === "AbortError")
        )
          this.onError(
            "La voix a décroché un instant. Le texte reste affiché.",
          );
      } finally {
        this.aborts.delete(abort);
      }
    });
  }

  private play(bytes: Uint8Array) {
    const count = Math.floor(bytes.length / 2);
    if (!count) return;
    const pcm = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const audio = this.context.createBuffer(1, count, PCM_RATE);
    const channel = audio.getChannelData(0);
    for (let i = 0; i < count; i++)
      channel[i] = pcm.getInt16(i * 2, true) / 32768;
    const source = this.context.createBufferSource();
    source.buffer = audio;
    source.connect(this.gain);
    this.next = Math.max(this.next, this.context.currentTime + 0.03);
    source.start(this.next);
    this.next += audio.duration;
    this.sources.add(source);
    if (!this.outputStarted) {
      this.outputStarted = true;
      this.onPlaying(true);
    }
    source.onended = () => {
      source.disconnect();
      this.sources.delete(source);
      if (!this.sources.size) {
        this.outputStarted = false;
        this.onPlaying(false);
      }
    };
  }
}

/** Streams the microphone to STT and detects the end of the learner's turn. */
export class Listener {
  private context: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private node: AudioWorkletNode | null = null;
  private analyser: AnalyserNode | null = null;
  private silentGain: GainNode | null = null;
  private ws: WebSocket | null = null;
  private provider: Provider = "fallback";
  private words: string[] = [];
  private interim = "";
  private silence = 0;
  private flushing = false;
  private flushId = 0;
  private closed = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  onText: (text: string) => void = () => {};
  onTurn: (text: string) => void = () => {};
  onError: (message: string) => void = () => {};

  /** Current microphone loudness 0–1, for the live level meter. */
  level() {
    if (!this.analyser) return 0;
    const samples = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const s of samples) sum += s * s;
    return Math.min(1, Math.sqrt(sum / samples.length) * 6);
  }

  async start() {
    this.closed = false;
    // Permission request and context creation both originate in the click handler.
    const streamPromise = navigator.mediaDevices
      .getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      .then((stream) => {
        if (this.closed) stream.getTracks().forEach((track) => track.stop());
        else this.stream = stream;
        return stream;
      });
    try {
      this.context = new AudioContext({ sampleRate: 48000 });
      // Attach handlers immediately even when resume or token acquisition fails first.
      const resume = this.context.resume();
      const tokenRequest = token();
      const [stream, t] = await Promise.all([
        streamPromise,
        tokenRequest,
        resume,
      ]);
      this.stream = stream;
      if (this.closed) {
        this.dispose();
        return;
      }
      await this.context.audioWorklet.addModule("/audio/capture.js");
      const rate = this.context.sampleRate;
      this.provider = t.provider;
      const connection =
        t.provider === "gradium"
          ? await gradiumSocket(
              t,
              "asr",
              {
                input_format: `pcm_${rate}`,
                json_config: { language: "fr", delay_in_frames: 8 },
              },
              (m) => this.gradiumMessage(m),
              (e) => {
                this.onError(e);
                this.dispose();
              },
            )
          : await this.deepgramSocket(t.token, rate);
      if (this.closed) {
        connection.close(1000);
        return;
      }
      this.ws = connection;
      this.source = this.context.createMediaStreamSource(this.stream);
      this.analyser = this.context.createAnalyser();
      this.analyser.fftSize = 512;
      this.source.connect(this.analyser);
      this.node = new AudioWorkletNode(this.context, "yougotit-capture");
      this.node.port.onmessage = (e) => {
        if (this.ws?.readyState !== WebSocket.OPEN) return;
        this.ws.send(
          this.provider === "gradium"
            ? JSON.stringify({ type: "audio", audio: toBase64(e.data) })
            : e.data,
        );
      };
      this.silentGain = this.context.createGain();
      this.silentGain.gain.value = 0;
      this.source.connect(this.node);
      this.node.connect(this.silentGain);
      this.silentGain.connect(this.context.destination);
    } catch (e) {
      this.dispose();
      throw e;
    }
  }

  private deepgramSocket(key: string, rate: number) {
    // Endpointing tuned for people who pause while thinking: 600 ms of silence, then a short grace period.
    const params = new URLSearchParams({
      model: "nova-3",
      language: "fr",
      encoding: "linear16",
      sample_rate: String(rate),
      channels: "1",
      interim_results: "true",
      endpointing: "600",
      utterance_end_ms: "1200",
      smart_format: "true",
      vad_events: "true",
    });
    const ws = new WebSocket(`wss://api.deepgram.com/v1/listen?${params}`, [
      "token",
      key,
    ]);
    ws.binaryType = "arraybuffer";
    return new Promise<WebSocket>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error("La connexion vocale prend trop de temps."));
        ws.close();
      }, 12000);
      ws.onopen = () => {
        clearTimeout(timeout);
        resolve(ws);
      };
      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error("Connexion vocale impossible."));
      };
      ws.onclose = (e) => {
        clearTimeout(timeout);
        if (!this.closed && e.code !== 1000) {
          this.onError("Connexion vocale interrompue. Réactivez le micro.");
          this.dispose();
        }
      };
      ws.onmessage = (e) => {
        try {
          const m = JSON.parse(e.data as string) as {
            type: string;
            is_final?: boolean;
            speech_final?: boolean;
            from_finalize?: boolean;
            channel?: { alternatives: { transcript: string }[] };
          };
          if (m.type === "UtteranceEnd") {
            if (!this.flushing && this.words.length) this.emit();
            return;
          }
          if (m.type !== "Results") return;
          const text = m.channel?.alternatives[0]?.transcript.trim() || "";
          if (text && this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
          }
          if (m.is_final) {
            if (text) this.words.push(text);
            this.interim = "";
          } else this.interim = text;
          this.onText([...this.words, this.interim].filter(Boolean).join(" "));
          if (this.flushing) {
            if (m.from_finalize) {
              this.flushing = false;
              this.emit();
            }
            return;
          }
          if (m.speech_final && this.words.length) {
            // A finished question ends the turn fast; a trailing clause gets more time.
            const complete = /[?.!]$/.test(this.words.at(-1)!);
            this.timer = setTimeout(() => this.emit(), complete ? 250 : 900);
          }
        } catch {
          /* ignore malformed frames */
        }
      };
    });
  }

  private gradiumMessage(m: WireMessage) {
    if (this.closed) return;
    if (m.type === "text" && m.text) {
      this.words.push(m.text);
      this.onText(this.words.join(" "));
      this.silence = 0;
    }
    if (m.type === "step" && this.words.length && !this.flushing) {
      const p = m.vad?.at(-1)?.inactivity_prob || 0;
      this.silence = p > 0.8 ? this.silence + 1 : 0;
      if (this.silence >= 5) this.flush();
    }
    if (m.type === "flushed" && m.flush_id === this.flushId) {
      this.flushing = false;
      this.silence = 0;
      this.emit();
    }
  }

  private emit() {
    if (this.closed) return;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const text = [...this.words, this.interim].filter(Boolean).join(" ").trim();
    this.words = [];
    this.interim = "";
    this.onText("");
    if (text) this.onTurn(text);
  }

  /** The learner says they are done: end the turn now. */
  flush() {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    if (this.flushing) return;
    if (this.timer) clearTimeout(this.timer);
    this.flushing = true;
    this.flushId++;
    this.ws.send(
      JSON.stringify(
        this.provider === "fallback"
          ? { type: "Finalize" }
          : { type: "flush", flush_id: this.flushId },
      ),
    );
    this.timer = setTimeout(() => {
      this.flushing = false;
      this.onError(
        "La transcription n’a pas été confirmée. Votre texte reste affiché : vous pouvez le reprendre par écrit.",
      );
    }, 8000);
  }

  dispose() {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.ws?.readyState === WebSocket.OPEN && this.provider === "fallback")
      this.ws.send(JSON.stringify({ type: "CloseStream" }));
    this.ws?.close(1000);
    this.ws = null;
    this.node?.disconnect();
    this.silentGain?.disconnect();
    this.analyser?.disconnect();
    this.source?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    if (this.context && this.context.state !== "closed")
      void this.context.close();
    this.node = null;
    this.source = null;
    this.analyser = null;
  }
}
