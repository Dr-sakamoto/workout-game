// Web Audio API による 8 ビット SE・BGM 生成。
// ファイル不要・ライセンスフリー・ピクセルアートに合うレトロサウンド。

// --- 音程定数 (Hz) ---
const E2 = 82.41, G2 = 98.0, A2 = 110.0;
const A3 = 220.0;
const C4 = 261.63, E4 = 329.63, G4 = 392.0, A4 = 440.0;
const C5 = 523.25, D5 = 587.33, E5 = 659.25;

const BPM = 145;
const BEAT = 60 / BPM;       // 1拍 ≈ 0.414s
const S16 = BEAT / 4;         // 16分音符 ≈ 0.103s
const S8 = BEAT / 2;          // 8分音符
const LOOP_DUR = BEAT * 8;    // 8拍ループ ≈ 3.31s
const LOOKAHEAD = 2.0;        // 何秒先までスケジュールするか

export type SEType = "click" | "workout" | "levelup" | "bossDefeat" | "damage" | "quest";

class SoundEngine {
  private ctx: AudioContext | null = null;
  private seOut: GainNode | null = null;
  private bgmOut: GainNode | null = null;

  private bgmPlaying = false;
  private bgmScheduledUntil = 0;
  private bgmTimer: ReturnType<typeof setTimeout> | null = null;

  private _seOn: boolean;
  private _bgmOn: boolean;

  constructor() {
    this._seOn = localStorage.getItem("sound-se") !== "false";
    this._bgmOn = localStorage.getItem("sound-bgm") !== "false";
  }

  // --- AudioContext の初期化 (ユーザー操作後に呼ぶ) ---
  private boot(): AudioContext | null {
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

        this.bgmOut = this.ctx.createGain();
        this.bgmOut.gain.value = 0.55;
        this.bgmOut.connect(master);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === "suspended") this.ctx.resume().catch(() => {});
    return this.ctx;
  }

  // --- 基本波形 ---
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

  // --- ノイズバースト (ドラム・ダメージ) ---
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

  // --- SE ---
  play(type: SEType): void {
    if (!this._seOn) return;
    const ctx = this.boot();
    if (!ctx) return;
    const se = this.seOut!;
    const t = ctx.currentTime + 0.01;

    switch (type) {
      case "click":
        this.tone(se, 440, t, 0.055, "square", 0.25);
        break;

      case "workout":
        // 上昇アルペジオ C4→E4→G4→C5
        [C4, E4, G4, C5].forEach((f, i) =>
          this.tone(se, f, t + i * 0.09, 0.11, "square", 0.28),
        );
        break;

      case "levelup":
        // ファンファーレ C4→E4→G4→C5→E5→G5(ホールド)
        [C4, E4, G4, C5, E5, 784].forEach((f, i) =>
          this.tone(se, f, t + i * 0.09, i === 5 ? 0.55 : 0.12, "square", 0.3),
        );
        break;

      case "bossDefeat": {
        // ビクトリー: 上昇→コード
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
        // 落下スイープ E4→A2
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = "square";
        osc.frequency.setValueAtTime(E4, t);
        osc.frequency.exponentialRampToValueAtTime(A2, t + 0.28);
        g.gain.setValueAtTime(0.3, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + 0.28);
        osc.connect(g);
        g.connect(se);
        osc.start(t);
        osc.stop(t + 0.29);
        this.noise(se, t, 0.09, 0.28);
        break;
      }

      case "quest":
        // チャイム G4→C5
        this.tone(se, G4, t, 0.15, "triangle", 0.3);
        this.tone(se, C5, t + 0.16, 0.38, "triangle", 0.35);
        break;
    }
  }

  // --- BGM ---
  startBGM(): void {
    if (this.bgmPlaying || !this._bgmOn) return;
    const ctx = this.boot();
    if (!ctx) return;
    this.bgmPlaying = true;
    this.bgmScheduledUntil = ctx.currentTime;
    this.pump();
  }

  stopBGM(): void {
    this.bgmPlaying = false;
    if (this.bgmTimer !== null) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  private pump(): void {
    if (!this.bgmPlaying || !this.ctx) return;
    const now = this.ctx.currentTime;
    while (this.bgmScheduledUntil < now + LOOKAHEAD) {
      const loopAt = Math.max(this.bgmScheduledUntil, now + 0.05);
      this.renderLoop(loopAt);
      this.bgmScheduledUntil = loopAt + LOOP_DUR;
    }
    this.bgmTimer = setTimeout(() => this.pump(), 500);
  }

  private renderLoop(at: number): void {
    const b = this.bgmOut!;

    // ── メロディ (16分音符) ──
    // Aマイナーペンタトニック: A C D E G
    const mel: [number, number][] = [
      [E5, 0],  [C5, 2],  [A4, 4],  [G4, 5],  [A4, 6],
      [C5, 8],  [E5, 10], [D5, 11], [C5, 12], [A4, 13],
      [E4, 16], [G4, 17], [A4, 18],
      [C5, 20], [A4, 21], [G4, 22],
      [E4, 24], [A4, 26], [C5, 27], [D5, 28], [E5, 29],
    ];
    mel.forEach(([f, i]) =>
      this.tone(b, f, at + i * S16, S16 * 0.72, "square", 0.16),
    );

    // ── ベース (4分音符) ──
    const bass: [number, number][] = [
      [A2, 0], [A2, 1], [E2, 2], [E2, 3],
      [A2, 4], [A2, 5], [G2, 6], [E2, 7],
    ];
    bass.forEach(([f, i]) =>
      this.tone(b, f, at + i * BEAT, BEAT * 0.68, "triangle", 0.28),
    );

    // ── ハイハット (8分音符) ──
    for (let i = 0; i < 16; i++)
      this.noise(b, at + i * S8, S8 * 0.28, 0.05, 5000);

    // ── キック (拍1,3,5,7) ──
    [0, 2, 4, 6].forEach((i) =>
      this.noise(b, at + i * BEAT, BEAT * 0.22, 0.14),
    );

    // ── スネア (拍2,4,6,8) ──
    [1, 3, 5, 7].forEach((i) =>
      this.noise(b, at + i * BEAT, S8 * 0.32, 0.09, 1800),
    );

    // ── アルペジオ補助 (8分音符、Aマイナーコード) ──
    const arp: [number, number][] = [
      [A3, 1], [C4, 3], [E4, 5], [A3, 7],
      [A3, 9], [C4, 11], [G4, 13], [A3, 15],
    ];
    arp.forEach(([f, i]) =>
      this.tone(b, f, at + i * S8, S8 * 0.5, "triangle", 0.1),
    );
  }

  // --- 設定 ---
  get seOn() { return this._seOn; }
  get bgmOn() { return this._bgmOn; }

  setSEOn(v: boolean): void {
    this._seOn = v;
    localStorage.setItem("sound-se", String(v));
  }

  setBGMOn(v: boolean): void {
    this._bgmOn = v;
    localStorage.setItem("sound-bgm", String(v));
    if (v) this.startBGM();
    else this.stopBGM();
  }
}

export const soundEngine = new SoundEngine();
