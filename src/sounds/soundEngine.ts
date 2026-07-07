// Web Audio API による 8 ビット SE 生成。BGM なし・SE のみ。

// --- 音程定数 (Hz) ---
const A2 = 110.0;
const C4 = 261.63, E4 = 329.63, G4 = 392.0, A4 = 440.0;
const C5 = 523.25, E5 = 659.25, G5 = 783.99, B5 = 987.77;
const E6 = 1318.51;

export type SEType =
  | "click"
  | "select"
  | "workout"
  | "levelup"
  | "bossDefeat"
  | "damage"
  | "quest"
  | "meal"
  | "purchase"
  | "restDone"
  | "sleep"
  | "scan"
  | "delete";

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

      // タブ移動・種目選択などの軽い操作フィードバック(短く控えめに)
      case "select":
        this.tone(se, 660, t, 0.03, "triangle", 0.14);
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

      // 食事を記録: 満足感のある上昇二音＋小さなきらめき
      case "meal":
        this.tone(se, E4, t, 0.08, "triangle", 0.26);
        this.tone(se, A4, t + 0.07, 0.12, "triangle", 0.28);
        this.tone(se, E5, t + 0.15, 0.16, "triangle", 0.18);
        break;

      // ショップ購入: コイン風
      case "purchase":
        this.tone(se, B5, t, 0.06, "square", 0.22);
        this.tone(se, E6, t + 0.06, 0.3, "square", 0.22);
        break;

      // レストタイマー終了: 急かさない穏やかな合図
      case "restDone":
        this.tone(se, C5, t, 0.12, "triangle", 0.3);
        this.tone(se, G5, t + 0.13, 0.28, "triangle", 0.3);
        break;

      // 睡眠を記録: 落ち着いた下降音
      case "sleep":
        this.tone(se, G4, t, 0.12, "triangle", 0.2);
        this.tone(se, E4, t + 0.12, 0.14, "triangle", 0.2);
        this.tone(se, C4, t + 0.26, 0.3, "triangle", 0.18);
        break;

      // バーコード読み取り成功: スキャナのビープ
      case "scan":
        this.tone(se, 1200, t, 0.05, "square", 0.2);
        this.tone(se, 1600, t + 0.07, 0.12, "square", 0.22);
        break;

      // 記録の削除: 短い下降音
      case "delete":
        this.tone(se, A4, t, 0.05, "square", 0.16);
        this.tone(se, E4, t + 0.05, 0.1, "square", 0.16);
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
