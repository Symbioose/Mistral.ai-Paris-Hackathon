declare module "@met4citizen/talkinghead" {
  type Anim = Record<string, unknown>;
  export class TalkingHead {
    constructor(node: HTMLElement, options: Record<string, unknown>);
    audioCtx: AudioContext;
    audioSpeechGainNode: GainNode;
    mtAvatar: Record<string, { newvalue: number; needsUpdate: boolean }>;
    isSpeaking: boolean;
    stateName: string;
    opt: { update?: (dt: number) => void };
    scene: { traverse(callback: (node: object) => void): void };
    animEmojis: Record<string, Anim>;
    animQueue: Anim[];
    animFactory(template: Anim, loop?: boolean): Anim;
    showAvatar(
      avatar: Record<string, unknown>,
      progress?: (event: ProgressEvent) => void,
    ): Promise<void>;
    makeEyeContact(ms: number): void;
    lookAhead(ms: number): void;
    speakWithHands(delay?: number, probability?: number): void;
    dispose(): void;
    setMood(mood: string): void;
  }
}
