"use client";
import { useEffect, useRef, useState } from "react";
import type { TalkingHead as Head } from "@met4citizen/talkinghead";
import { Speaker } from "@/app/lib/conversation/audio";

export type AvatarMood = "idle" | "listening" | "thinking" | "speaking";
export interface AvatarController {
  speaker: Speaker;
  react: (mood: AvatarMood) => void;
}

interface AudioDetector extends AudioWorkletNode {
  loadModel(url: string): Promise<void>;
  update(dt: number): void;
  onvalue: (key: string, value: number) => void;
}

export default function Avatar({
  onReady,
  onError,
}: {
  onReady: (controller: AvatarController) => void;
  onError: (message: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const readyRef = useRef(onReady);
  readyRef.current = onReady;
  const errorRef = useRef(onError);
  errorRef.current = onError;
  const [progress, setProgress] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    let head: Head | undefined;
    let detector: AudioDetector | undefined;
    let speaker: Speaker | undefined;
    const start = async () => {
      try {
        // Loaded natively (not bundled): TalkingHead resolves its modules at runtime.
        const headPath = "/vendor/talkinghead/talkinghead.mjs";
        const { TalkingHead } = (await import(
          /* webpackIgnore: true */ /* turbopackIgnore: true */ headPath
        )) as typeof import("@met4citizen/talkinghead");
        if (cancelled || !container.current) return;
        head = new TalkingHead(container.current, {
          cameraView: "upper",
          cameraY: 0.12,
          cameraDistance: -0.35,
          cameraRotateEnable: false,
          cameraPanEnable: false,
          cameraZoomEnable: false,
          modelFPS: 30,
          modelPixelRatio: Math.min(1, 1.5 / window.devicePixelRatio),
          lipsyncModules: [],
          lightAmbientIntensity: 1.1,
          lightDirectIntensity: 3.5,
          lightDirectColor: 0xffeddb,
          avatarIdleEyeContact: 0.55,
          avatarIdleHeadMove: 0.35,
          avatarSpeakingEyeContact: 0.7,
          avatarSpeakingHeadMove: 0.5,
          avatarListeningEyeContact: 0.9,
        });
        await head.showAvatar(
          {
            url: "/avatar/mpfb.glb",
            body: "F",
            avatarMood: "neutral",
            lipsyncLang: "fr",
          },
          (e) => {
            if (!cancelled && e.total)
              setProgress(Math.round((e.loaded / e.total) * 100));
          },
        );
        if (cancelled) {
          head.dispose();
          return;
        }
        dressForWork(head);
        // HeadAudio derives visemes from the audio itself: lip-sync works with any TTS provider.
        await head.audioCtx.audioWorklet.addModule(
          "/vendor/headaudio/headworklet.mjs",
        );
        const modulePath = "/vendor/headaudio/headaudio.mjs";
        const { HeadAudio } = (await import(
          /* webpackIgnore: true */ /* turbopackIgnore: true */ modulePath
        )) as { HeadAudio: new (context: AudioContext) => AudioDetector };
        detector = new HeadAudio(head.audioCtx);
        await detector.loadModel("/vendor/headaudio/model-en-mixed.bin");
        if (cancelled) {
          detector.disconnect();
          head.dispose();
          return;
        }
        head.audioSpeechGainNode.connect(detector);
        const current = head;
        detector.onvalue = (key, value) => {
          const target = current.mtAvatar[key];
          if (target) {
            target.newvalue = value;
            target.needsUpdate = true;
          }
        };
        current.opt.update = (dt) => detector?.update(dt);
        speaker = new Speaker(current.audioCtx, current.audioSpeechGainNode);
        speaker.onPlaying = (playing) => {
          current.isSpeaking = playing;
          current.stateName = playing ? "speaking" : "idle";
        };
        // Small non-verbal reactions make the wait between speech turns feel alive.
        const react = (mood: AvatarMood) => {
          try {
            if (mood === "listening") current.makeEyeContact(6000);
            else if (mood === "thinking") {
              current.lookAhead(900);
              const emoji = current.animEmojis["🤔"];
              if (emoji) current.animQueue.push(current.animFactory(emoji));
            } else if (mood === "speaking") {
              current.makeEyeContact(3000);
              current.speakWithHands(0, 0.6);
            }
          } catch {
            /* purely cosmetic */
          }
        };
        setLoaded(true);
        readyRef.current({ speaker, react });
      } catch (error) {
        if (!cancelled) {
          setFailed(true);
          errorRef.current(
            "L’avatar n’a pas pu se charger. L’entretien reste possible, rechargez la page pour réessayer.",
          );
          console.error("[avatar]", error);
        }
      }
    };
    void start();
    return () => {
      cancelled = true;
      speaker?.interrupt();
      detector?.disconnect();
      head?.dispose();
    };
  }, []);
  return (
    <div className="yg-avatar-wrap">
      <div
        ref={container}
        className="yg-avatar"
        aria-label="Votre interlocuteur virtuel"
      />
      {!loaded && (
        <div className="yg-avatar-loading" role="status">
          <span>{failed ? "Image indisponible · l’entretien reste possible" : "La salle se prépare"}</span>
          {!failed && (
            <span className="yg-avatar-progress" aria-hidden="true">
              <i style={{ width: `${Math.max(4, progress)}%` }} />
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// The CC0 MPFB model ships with a casual printed T-shirt: swap it for a plain dark jacket
// fabric (the normal map keeps the folds) so the persona reads as a professional.
function dressForWork(head: Head) {
  head.scene.traverse((node) => {
    const mesh = node as unknown as {
      isMesh?: boolean;
      material?: {
        name?: string;
        map: unknown;
        color: { set(hex: number): void };
        roughness: number;
        needsUpdate: boolean;
      };
    };
    if (!mesh.isMesh || !mesh.material?.name?.includes("casualsuit")) return;
    mesh.material.map = null;
    mesh.material.color.set(0x2f3a45);
    mesh.material.roughness = 0.85;
    mesh.material.needsUpdate = true;
  });
}
