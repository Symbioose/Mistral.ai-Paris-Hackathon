import test from "node:test";
import assert from "node:assert/strict";
import { Listener } from "../app/lib/conversation/audio";

test("microphone granted after a token failure is stopped immediately", async () => {
  const originalNavigator = Object.getOwnPropertyDescriptor(
    globalThis,
    "navigator",
  );
  const originalContext = Object.getOwnPropertyDescriptor(
    globalThis,
    "AudioContext",
  );
  const originalFetch = globalThis.fetch;
  let release!: (stream: MediaStream) => void;
  let stopped = 0;
  let closed = 0;
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: {
      mediaDevices: {
        getUserMedia: () =>
          new Promise<MediaStream>((resolve) => {
            release = resolve;
          }),
      },
    },
  });
  Object.defineProperty(globalThis, "AudioContext", {
    configurable: true,
    value: class {
      resume() {
        return Promise.resolve();
      }
      close() {
        closed++;
        return Promise.resolve();
      }
    },
  });
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: "Voix indisponible" }), {
      status: 503,
    });
  try {
    const listener = new Listener();
    await assert.rejects(listener.start(), /Voix indisponible/);
    release({
      getTracks: () => [{ stop: () => stopped++ }],
    } as unknown as MediaStream);
    await Promise.resolve();
    assert.equal(
      stopped,
      1,
      "permission arriving after failure must never leave the mic recording",
    );
    assert.equal(closed, 1);
    listener.dispose();
    assert.equal(stopped, 1);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalNavigator)
      Object.defineProperty(globalThis, "navigator", originalNavigator);
    else Reflect.deleteProperty(globalThis, "navigator");
    if (originalContext)
      Object.defineProperty(globalThis, "AudioContext", originalContext);
    else Reflect.deleteProperty(globalThis, "AudioContext");
  }
});
