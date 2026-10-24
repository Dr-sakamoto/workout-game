// 効果音はファイルを持たず WebAudio で合成する
let ctx: AudioContext | undefined;

function ac(): AudioContext | undefined {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return undefined;
  }
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, slideTo?: number) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur);
}

function noise(dur: number, gain: number, lowpass: number) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = lowpass;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

const buzz = (ms: number) => navigator.vibrate?.(ms);

export const sound = {
  /** ハンドルのカチッ */
  tick() {
    tone(1800, 0.03, "square", 0.05);
    noise(0.02, 0.15, 4000);
    buzz(6);
  },
  /** カプセルがゴトンと落ちる */
  drop() {
    tone(160, 0.25, "sine", 0.4, 60);
    noise(0.12, 0.3, 900);
    buzz(30);
  },
  /** カプセルがパカッと開く */
  pop() {
    tone(500, 0.12, "triangle", 0.25, 1400);
    setTimeout(() => tone(1200, 0.25, "sine", 0.12, 2400), 80);
  },
  /** ハンコをポンと押す */
  stamp() {
    tone(120, 0.18, "sine", 0.5, 50);
    noise(0.08, 0.35, 1200);
    buzz(25);
  },
  /** 上納 */
  chime() {
    [660, 880, 1320].forEach((f, i) => setTimeout(() => tone(f, 0.35, "sine", 0.12), i * 110));
  },
};
