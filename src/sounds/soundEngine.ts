// Web Audio API による 8 ビット SE・BGM 生成。
// ファイル不要・ライセンスフリー・ピクセルアートに合うレトロサウンド。

// --- 音程定数 (Hz) ---
const E2 = 82.41, G2 = 98.0, A2 = 110.0;
const C3 = 130.81, D3 = 146.83, E3 = 164.81, G3 = 196.0;
const A3 = 220.0;
const C4 = 261.63, E4 = 329.63, G4 = 392.0, A4 = 440.0;
const C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99;

const BPM = 145;
const BEAT = 60 / BPM;       // 1拍 ≈ 0.414s
const S16 = BEAT / 4;         // 16分音符 ≈ 0.103s
const S8 = BEAT / 2;          // 8分音符
const LOOP_DUR = BEAT * 32;   // 32拍ループ ≈ 13.2s (8小節)
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

  // --- AudioContext の初期化と resume ---
  // iOS Safari (PWA含む) では AudioContext は suspended で生まれる。
  // ユーザー操作イベント内で resume() を await しないと音が出ない。
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

        this.bgmOut = this.ctx.createGain();
        this.bgmOut.gain.value = 0.55;
        this.bgmOut.connect(master);
      } catch {
        return null;
      }
    }
    return this.ctx;
  }

  // resume() を待ってから callback を実行する。
  private withCtx(callback: (ctx: AudioContext) => void): void {
    const ctx = this.bootSync();
    if (!ctx) return;
    if (ctx.state === "running") {
      callback(ctx);
    } else {
      ctx.resume().then(() => callback(ctx)).catch(() => {});
    }
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
        // チャイム G4→C5
        this.tone(se, G4, t, 0.15, "triangle", 0.3);
        this.tone(se, C5, t + 0.16, 0.38, "triangle", 0.35);
        break;
    }
  }

  // --- BGM ---
  startBGM(): void {
    if (this.bgmPlaying || !this._bgmOn) return;
    this.bgmPlaying = true;
    this.withCtx((ctx) => {
      // withCtx が resolve した時点で ctx.state === "running"
      if (!this.bgmPlaying) return;
      this.bgmScheduledUntil = ctx.currentTime;
      this.pump();
    });
  }

  stopBGM(): void {
    this.bgmPlaying = false;
    if (this.bgmTimer !== null) {
      clearTimeout(this.bgmTimer);
      this.bgmTimer = null;
    }
  }

  // バックグラウンドから復帰したとき (iOS PWA で AudioContext が suspend される)
  handleVisibilityChange(): void {
    if (document.visibilityState !== "visible" || !this.ctx) return;
    if (this.ctx.state !== "suspended") return;
    this.ctx.resume().then(() => {
      if (!this.bgmPlaying) return;
      if (this.bgmTimer !== null) {
        clearTimeout(this.bgmTimer);
        this.bgmTimer = null;
      }
      this.bgmScheduledUntil = this.ctx!.currentTime;
      this.pump();
    }).catch(() => {});
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

    // 32拍ループ (8小節 / 4/4拍子) Aマイナーペンタトニック: A C D E G
    // A(0-7): メインテーマ  B(8-15): 疾走感  C(16-23): ブレイク  D(24-31): 回帰

    // ── メロディ ─────────────────────────────────────────────────────────
    // A: オリジナルテーマ
    const melA: [number, number][] = [
      [E5, 0],  [C5, 2],  [A4, 4],  [G4, 5],  [A4, 6],
      [C5, 8],  [E5, 10], [D5, 11], [C5, 12], [A4, 13],
      [E4, 16], [G4, 17], [A4, 18], [C5, 20], [A4, 21], [G4, 22],
      [E4, 24], [A4, 26], [C5, 27], [D5, 28], [E5, 29], [C5, 30],
    ];
    melA.forEach(([f, i]) => this.tone(b, f, at + i * S16, S16 * 0.72, "square", 0.16));

    // B: 上昇ラン・疾走感 (16分音符オフセット 32 = beat 8)
    const melB: [number, number][] = [
      [A4, 32], [C5, 33], [E5, 34], [G5, 36], [E5, 37], [D5, 38],
      [C5, 40], [A4, 41], [G4, 42], [A4, 44], [C5, 46], [E5, 47],
      [D5, 48], [C5, 50], [A4, 52], [G4, 53], [A4, 54],
      [C5, 56], [E5, 58], [G5, 59], [E5, 60], [D5, 61], [C5, 62],
    ];
    melB.forEach(([f, i]) => this.tone(b, f, at + i * S16, S16 * 0.65, "square", 0.15));

    // C: ブレイク・スパース (offset 64 = beat 16) ─ 長めの音符で余白を作る
    const melC: [number, number][] = [
      [E4, 64], [A4, 68], [C5, 70], [A4, 72], [G4, 74],
      [E4, 76], [G4, 78], [A4, 80], [C5, 82], [E5, 84],
      [D5, 86], [C5, 88], [A4, 90], [G4, 92], [A4, 94],
    ];
    melC.forEach(([f, i]) => this.tone(b, f, at + i * S16, S16 * 1.8, "square", 0.13));

    // D: テーマ回帰+装飾 (offset 96 = beat 24)
    const melD: [number, number][] = [
      [E5, 96],  [C5, 98],  [A4, 100], [G4, 101], [A4, 102],
      [C5, 104], [E5, 106], [G5, 107], [E5, 108], [D5, 109], [C5, 110],
      [A4, 112], [C5, 113], [E5, 114], [D5, 116], [C5, 117], [A4, 118],
      [G4, 120], [A4, 122], [C5, 123], [D5, 124], [E5, 125], [C5, 126], [A4, 127],
    ];
    melD.forEach(([f, i]) => this.tone(b, f, at + i * S16, S16 * 0.72, "square", 0.17));

    // D: ハーモニーライン (triangle でソフトに重ねる)
    const harmD: [number, number][] = [
      [C5, 96], [A4, 98], [G4, 100], [E4, 102],
      [A4, 104], [C5, 108], [G4, 112], [A4, 114],
      [E4, 120], [G4, 122], [A4, 124], [C5, 126],
    ];
    harmD.forEach(([f, i]) => this.tone(b, f, at + i * S16, S16 * 0.9, "triangle", 0.07));

    // ── ベース ───────────────────────────────────────────────────────────
    // A: ルート中心
    const bassA: [number, number][] = [
      [A2, 0], [A2, 1], [E2, 2], [E2, 3],
      [A2, 4], [A2, 5], [G2, 6], [E2, 7],
    ];
    bassA.forEach(([f, i]) => this.tone(b, f, at + i * BEAT, BEAT * 0.68, "triangle", 0.28));

    // B: 動くライン (動的コード感)
    const bassB: [number, number][] = [
      [A2, 8], [C3, 9], [E3, 10], [A2, 11],
      [D3, 12], [A2, 13], [E2, 14], [E2, 15],
    ];
    bassB.forEach(([f, i]) => this.tone(b, f, at + i * BEAT, BEAT * 0.60, "triangle", 0.26));

    // C: スパース (根音と5度だけ)
    const bassC: [number, number][] = [
      [A2, 16], [A2, 18], [G2, 19], [E2, 20], [G2, 22],
    ];
    bassC.forEach(([f, i]) => this.tone(b, f, at + i * BEAT, BEAT * 0.75, "triangle", 0.24));

    // D: ウォーキングベース
    const bassD: [number, number][] = [
      [A2, 24], [C3, 25], [E3, 26], [G3, 27],
      [A2, 28], [E3, 29], [C3, 30], [A2, 31],
    ];
    bassD.forEach(([f, i]) => this.tone(b, f, at + i * BEAT, BEAT * 0.70, "triangle", 0.29));

    // ── ハイハット ───────────────────────────────────────────────────────
    // A: 8分音符
    for (let i = 0; i < 16; i++)
      this.noise(b, at + i * S8, S8 * 0.28, 0.05, 5000);
    // B: 16分音符で密度アップ
    for (let i = 0; i < 32; i++)
      this.noise(b, at + 8 * BEAT + i * S16, S16 * 0.2, i % 2 === 0 ? 0.07 : 0.04, 5000);
    // C: スパース (4分音符)
    for (let i = 0; i < 8; i++)
      this.noise(b, at + (16 + i) * BEAT, S8 * 0.18, 0.03, 5000);
    // D: 8分音符+拍頭アクセント
    for (let i = 0; i < 16; i++)
      this.noise(b, at + 24 * BEAT + i * S8, S8 * 0.28, i % 4 === 0 ? 0.08 : 0.05, 5000);

    // ── キック ───────────────────────────────────────────────────────────
    [0, 2, 4, 6].forEach(i => this.noise(b, at + i * BEAT, BEAT * 0.22, 0.14));
    [8, 10, 12, 14].forEach(i => this.noise(b, at + i * BEAT, BEAT * 0.22, 0.14));
    [16, 20].forEach(i => this.noise(b, at + i * BEAT, BEAT * 0.22, 0.11));           // C: スパース
    [24, 26, 28, 30].forEach(i => this.noise(b, at + i * BEAT, BEAT * 0.22, 0.16));

    // ── スネア ───────────────────────────────────────────────────────────
    [1, 3, 5, 7].forEach(i => this.noise(b, at + i * BEAT, S8 * 0.32, 0.09, 1800));
    [9, 11, 13, 15].forEach(i => this.noise(b, at + i * BEAT, S8 * 0.32, 0.10, 1800));
    [17, 21].forEach(i => this.noise(b, at + i * BEAT, S8 * 0.45, 0.08, 1800));       // C: スパース
    [25, 27, 29, 31].forEach(i => this.noise(b, at + i * BEAT, S8 * 0.32, 0.11, 1800));

    // ── アルペジオ ───────────────────────────────────────────────────────
    // A: Amペンタ上昇
    const arpA: [number, number][] = [
      [A3, 1], [C4, 3], [E4, 5], [A3, 7],
      [A3, 9], [C4, 11], [G4, 13], [A3, 15],
    ];
    arpA.forEach(([f, i]) => this.tone(b, f, at + i * S8, S8 * 0.5, "triangle", 0.10));

    // B: より活発・高域寄り
    const arpB: [number, number][] = [
      [E4, 17], [G4, 19], [A4, 21], [E4, 23],
      [G4, 25], [A4, 27], [C5, 29], [E4, 31],
    ];
    arpB.forEach(([f, i]) => this.tone(b, f, at + i * S8, S8 * 0.45, "triangle", 0.09));

    // C: 長音パッド的 (4拍おき)
    const arpC: [number, number][] = [
      [A3, 32], [E4, 36], [A3, 40], [E4, 44],
    ];
    arpC.forEach(([f, i]) => this.tone(b, f, at + i * S8, S8 * 1.8, "triangle", 0.12));

    // D: 駆け上がりアルペジオ (クライマックス)
    const arpD: [number, number][] = [
      [A3, 49], [C4, 51], [E4, 53], [G4, 55],
      [A4, 57], [C5, 59], [E5, 61], [G5, 63],
    ];
    arpD.forEach(([f, i]) => this.tone(b, f, at + i * S8, S8 * 0.42, "triangle", 0.09));

    // ── コードスタブ (セクション境界のアクセント) ─────────────────────────
    // A→B: Am コードヒット
    [A4, C5, E5].forEach((f, k) =>
      this.tone(b, f, at + 8 * BEAT, BEAT * 0.08, "square", 0.07 - k * 0.01));
    // B→C: 解決感
    [E4, A4].forEach((f, k) =>
      this.tone(b, f, at + 16 * BEAT, BEAT * 0.12, "triangle", 0.08 - k * 0.01));
    // C→D: 再起動
    [A3, E4, A4].forEach((f, k) =>
      this.tone(b, f, at + 24 * BEAT, BEAT * 0.10, "square", 0.08 - k * 0.01));
    // ループ末尾 (D→A): 着地
    [A4, E5].forEach((f, k) =>
      this.tone(b, f, at + 32 * BEAT - S16, S16 * 0.6, "triangle", 0.07 - k * 0.01));
  }

  // AudioContext をユーザーのジェスチャー内で起動するために事前に呼ぶ
  warmup(): void {
    const ctx = this.bootSync();
    if (!ctx) return;
    if (ctx.state !== "running") {
      ctx.resume().catch(() => {});
    }
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
