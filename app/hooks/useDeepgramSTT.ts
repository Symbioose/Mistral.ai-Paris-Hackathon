"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseDeepgramSTTOptions {
  language?: string;
}

interface UseDeepgramSTTReturn {
  isRecording: boolean;
  transcript: string;
  startRecordingWithStream: (stream: MediaStream) => Promise<void>;
  stopRecording: () => void;
}

const DEEPGRAM_WS_URL = "wss://api.deepgram.com/v1/listen";

/** Detect the best MediaRecorder format supported by this browser. */
function getRecorderConfig(): { mimeType: string; deepgramEncoding: string } {
  const candidates: Array<{ mimeType: string; deepgramEncoding: string }> = [
    { mimeType: "audio/webm;codecs=opus", deepgramEncoding: "opus" },
    { mimeType: "audio/webm",             deepgramEncoding: "opus" },
    { mimeType: "audio/ogg;codecs=opus",  deepgramEncoding: "opus" },
    { mimeType: "audio/mp4",              deepgramEncoding: "aac"  },
  ];

  for (const c of candidates) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c.mimeType)) {
      return c;
    }
  }

  // Last resort: let the browser pick (Safari fallback)
  return { mimeType: "", deepgramEncoding: "aac" };
}

export function useDeepgramSTT(
  options: UseDeepgramSTTOptions = {},
): UseDeepgramSTTReturn {
  const { language = "fr" } = options;

  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");

  const wsRef            = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef        = useRef<MediaStream | null>(null);
  const finalRef         = useRef("");
  const interimRef       = useRef("");
  const closedByUserRef  = useRef(false);
  const connectingRef    = useRef(false);

  const startRecordingWithStream = useCallback(
    async (stream: MediaStream) => {
      connectingRef.current = true;
      finalRef.current    = "";
      interimRef.current  = "";
      closedByUserRef.current = false;
      setTranscript("");
      streamRef.current = stream;

      // Fetch Deepgram API key
      let apiKey: string;
      try {
        const res  = await fetch("/api/deepgram");
        const data = await res.json();
        if (!data.apiKey) throw new Error(data.error ?? "No API key");
        apiKey = data.apiKey;
      } catch (err) {
        console.error("[Deepgram] Failed to fetch API key:", err);
        stream.getTracks().forEach((t) => t.stop());
        return;
      }

      const { mimeType, deepgramEncoding } = getRecorderConfig();

      const params = new URLSearchParams({
        model:           "nova-3",
        language,
        smart_format:    "true",
        interim_results: "true",
        utterance_end_ms:"1500",
        vad_events:      "true",
        punctuate:       "true",
        encoding:        deepgramEncoding,
      });

      const ws = new WebSocket(`${DEEPGRAM_WS_URL}?${params}`, ["token", apiKey]);
      wsRef.current = ws;

      ws.onopen = () => {
        connectingRef.current = false;
        const recorderOptions = mimeType ? { mimeType } : undefined;

        let recorder: MediaRecorder;
        try {
          recorder = recorderOptions
            ? new MediaRecorder(stream, recorderOptions)
            : new MediaRecorder(stream);
        } catch {
          // mimeType rejected at runtime — retry without specifying it
          recorder = new MediaRecorder(stream);
        }
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0 && ws.readyState === WebSocket.OPEN) {
            ws.send(event.data);
          }
        };

        recorder.start(100);
        setIsRecording(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data as string);

          if (data.type === "Results" && data.channel?.alternatives?.[0]) {
            const text: string = data.channel.alternatives[0].transcript ?? "";
            if (!text) return;

            if (data.is_final) {
              finalRef.current   = finalRef.current ? `${finalRef.current} ${text}` : text;
              interimRef.current = "";
            } else {
              interimRef.current = text;
            }

            const combined = finalRef.current
              ? `${finalRef.current} ${interimRef.current}`.trim()
              : interimRef.current;

            setTranscript(combined);
          }
        } catch {
          // Ignore non-JSON pings
        }
      };

      ws.onerror = (err) => {
        console.error("[Deepgram] WebSocket error:", err);
      };

      ws.onclose = () => {
        // Only clean up if the close was unexpected (not user-initiated via stopRecording)
        if (!closedByUserRef.current) {
          console.warn("[Deepgram] WebSocket closed unexpectedly — keeping state for user to release button.");
          // Don't stop the MediaRecorder or reset isRecording here —
          // the user is still holding the button. The transcript captured
          // so far is still valid and will be submitted on release.
        }
      };
    },
    [language],
  );

  const stopRecording = useCallback(() => {
    closedByUserRef.current = true;
    connectingRef.current = false;
    setIsRecording(false);

    if (mediaRecorderRef.current?.state !== "inactive") {
      mediaRecorderRef.current?.stop();
    }
    mediaRecorderRef.current = null;

    if (wsRef.current && wsRef.current.readyState <= WebSocket.OPEN) {
      if (wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "CloseStream" }));
      }
      wsRef.current.close();
    }
    wsRef.current = null;

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // Cleanup on unmount — stop everything if component unmounts while recording
  const stopRecordingRef = useRef(stopRecording);
  stopRecordingRef.current = stopRecording;
  useEffect(() => {
    return () => {
      stopRecordingRef.current();
    };
  }, []);

  return { isRecording, transcript, startRecordingWithStream, stopRecording };
}
