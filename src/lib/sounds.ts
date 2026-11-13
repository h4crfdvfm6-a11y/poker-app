/** Tiny Web Audio beeps — no asset files required. */

let ctx: AudioContext | null = null;

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  try {
    ctx ??= new AudioContext();
    return ctx;
  } catch {
    return null;
  }
}

export type SoundKind =
  | "deal"
  | "check"
  | "call"
  | "bet"
  | "fold"
  | "raise"
  | "allin"
  | "win"
  | "turn"
  | "premium"
  | "react";

const MUTE_KEY = "fa_mute_sounds";

export function soundsMuted(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(MUTE_KEY) === "1";
}

export function setSoundsMuted(muted: boolean) {
  if (typeof window === "undefined") return;
  localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
}

function beep(freq: number, dur = 0.08, type: OscillatorType = "sine", gain = 0.04) {
  if (soundsMuted()) return;
  const a = audio();
  if (!a) return;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.value = gain;
  o.connect(g);
  g.connect(a.destination);
  const t = a.currentTime;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.start(t);
  o.stop(t + dur);
}

export function playSound(kind: SoundKind) {
  switch (kind) {
    case "deal":
      beep(520, 0.05, "triangle", 0.03);
      break;
    case "check":
      beep(340, 0.06, "sine", 0.03);
      break;
    case "call":
      beep(400, 0.07, "sine", 0.035);
      break;
    case "bet":
    case "raise":
      beep(280, 0.09, "square", 0.03);
      setTimeout(() => beep(360, 0.06, "square", 0.025), 60);
      break;
    case "fold":
      beep(180, 0.1, "sawtooth", 0.025);
      break;
    case "allin":
      beep(220, 0.12, "square", 0.04);
      setTimeout(() => beep(440, 0.12, "square", 0.035), 90);
      break;
    case "win":
      beep(523, 0.1, "sine", 0.04);
      setTimeout(() => beep(659, 0.12, "sine", 0.04), 100);
      break;
    case "turn":
      beep(600, 0.05, "triangle", 0.035);
      break;
    case "premium":
      beep(660, 0.1, "sine", 0.045);
      setTimeout(() => beep(880, 0.14, "sine", 0.04), 80);
      break;
    case "react":
      beep(740, 0.05, "triangle", 0.03);
      break;
  }
}

export function soundForAction(type: string): SoundKind {
  if (type === "fold") return "fold";
  if (type === "check") return "check";
  if (type === "call") return "call";
  if (type === "bet") return "bet";
  if (type === "raise") return "raise";
  if (type === "allin") return "allin";
  return "check";
}
