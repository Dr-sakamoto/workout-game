// Web Audio API による 8 ビット SE 生成。BGM なし・SE のみ。

// --- 音程定数 (Hz) ---
const A2 = 110.0;
const C4 = 261.63, E4 = 329.63, G4 = 392.0;
const C5 = 523.25, E5 = 659.25;

export type SEType = "click" | "workout" | "levelup" | "bossDefeat" | "damage" | "quest";

class SoundEngine {
  private ctx: AudioContext | null = null;
  private seOut: GainNode | null = null;

  private _seOn: boolean;

  constructor() {
    this._seOn = localStorage.getItem("sound-se") !== "false";
  }

  private bootSync(): AudioContext | null {
    if (!this.ctx) {
      try {
        const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!Ctx) return null;
        this.ctx = new Ctx();
        const master = this.ctx.createGain();
        master.gain.value = 0.35;
        master.connect(this.ctx.destination);

        this.seOut = this.ctx.createGain();
        this.seOut.gain.value = 1.0;
        this.seOut.connect(master);
      } catch {
        return null;
      }
    }
    return this.ctx;
  }

  private withCtx(callback: (ctx: AudioContext) => void): void {
    const ctx = this.bootSync();
    if (!ctx) return;
    if (ctx.state === "running") {
      callback(ctx);
    } else {
      ctx.resume().then(() => callback(ctx)).catch(() => {});
    }
  }

  private tone(
    dest: AudioNode,
    freq: number,
    at: number,
    dur: number,
    type: OscillatorType = "square",
    vol = 0.25,
  ): void {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, at);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(vol, at + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    osc.connect(g);
    g.connect(dest);
    osc.start(at);
    osc.stop(at + dur + 0.01);
  }

  private noise(
    dest: AudioNode,
    at: number,
    dur: number,
    vol = 0.12,
    hpHz = 0,
  ): void {
    const ctx = this.ctx!;
    const len = Math.ceil(ctx.sampleRate * (dur + 0.01));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, at);
    g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    src.connect(g);
    if (hpHz > 0) {
      const f = ctx.createBiquadFilter();
      f.type = "highpass";
      f.frequency.value = hpHz;
      g.connect(f);
      f.connect(dest);
    } else {
      g.connect(dest);
    }
    src.start(at);
    src.stop(at + dur + 0.01);
  }

  play(type: SEType): void {
    if (!this._seOn) return;
    this.withCtx((ctx) => this._playSE(type, ctx));
  }

  private _playSE(type: SEType, ctx: AudioContext): void {
    const se = this.seOut!;
    const t = ctx.currentTime + 0.01;

    switch (type) {
      case "click":
        this.tone(se, 440, t, 0.055, "square", 0.25);
        break;

      case "workout":
        [C4, E4, G4, C5].forEach((f, i) =>
          this.tone(se, f, t + i * 0.09, 0.11, "square", 0.28),
        );
        break;

      case "levelup":
        [C4, E4, G4, C5, E5, 784].forEach((f, i) =>
          this.tone(se, f, t + i * 0.09, i === 5 ? 0.55 : 0.12, "square", 0.3),
        );
        break;

      case "bossDefeat": {
        const seq = [G4, C5, E5, 784, 1046.5];
        seq.forEach((f, i) =>
          this.tone(se, f, t + i * 0.07, 0.15, "square", 0.25),
        );
        const fin = t + seq.length * 0.07;
        [C5, E5, 784].forEach((f) =>
          this.tone(se, f, fin, 0.65, "square", 0.2),
        );
        break;
      }

      case "damage": {
        const dmgOsc = ctx.createOscillator();
        const dmgG = ctx.createGain();
        dmgOsc.type = "square";
        dmgOsc.frequency.setValueAtTime(E4, t);
        dmgOsc.frequency.exponentialRampToValueAtTime(A2, t + 0.28);
        dmgG.gain.setValueAtTime(0.3, t);
        dmgG.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        dmgOsc.connect(dmgG);
        dmgG.connect(se);
        dmgOsc.start(t);
        dmgOsc.stop(t + 0.29);
        this.noise(se, t, 0.09, 0.28);
        break;
      }

      case "quest":
        this.tone(se, G4, t, 0.15, "triangle", 0.3);
        this.tone(se, C5, t + 0.16, 0.38, "triangle", 0.35);
        break;
    }
  }

  warmup(): void {
    const ctx = this.bootSync();
    if (!ctx) return;
    if (ctx.state !== "running") {
      ctx.resume().catch(() => {});
    }
  }

  get seOn() { return this._seOn; }

  setSEOn(v: boolean): void {
    this._seOn = v;
    localStorage.setItem("sound-se", String(v));
  }
}

export const soundEngine = new SoundEngine();
