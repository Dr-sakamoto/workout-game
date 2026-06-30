import type { AvatarBuild } from "../domain/build";

// パラメトリックなドット絵ボクサー。
//   体型(girth/soft) × 部位別の発達(parts) × 前後(view) から手続き的に生成する。
//   → 腕を鍛えれば腕が、背中を鍛えれば背中が太くなる。ガリ/デブも体型に出る。
//   固定スプライト5段階では表現できない「細かい部位別の変化」を担うのがこの描画。

const CELL = 6;
const W = 36;
const H = 44;

const E = 0;
const SK = 1, SKS = 2, SKL = 3; // 肌(base/shadow/light)
const HAIR = 4;
const TR = 5, TRS = 6, TRL = 7; // トランクス
const GL = 8, GLS = 9; // グローブ
const BOOT = 10, BOOTS = 11;
const EYE = 12, WB = 13; // 目 / 金のウエストバンド
const OUT = 14;

const COLORS: Record<number, string> = {
  [SK]: "#d99e6c", [SKS]: "#ab7549", [SKL]: "#eebb8c",
  [HAIR]: "#2c2420",
  [TR]: "#cf3b34", [TRS]: "#992619", [TRL]: "#e85f55",
  [GL]: "#d6403f", [GLS]: "#982525",
  [BOOT]: "#3b3b47", [BOOTS]: "#222229",
  [EYE]: "#1d1714", [WB]: "#eccb61",
  [OUT]: "#15100e",
};

const SHADE3: Record<number, [number, number, number]> = {
  [SK]: [SKL, SK, SKS],
  [TR]: [TRL, TR, TRS],
};

interface Grid {
  g: number[];
  set: (x: number, y: number, m: number) => void;
  hline: (x0: number, x1: number, y: number, m: number) => void;
  rect: (x0: number, x1: number, y0: number, y1: number, m: number) => void;
  cx: number;
}

function newGrid(): Grid {
  const g = new Array(W * H).fill(E);
  const cx = Math.floor(W / 2);
  const set = (x: number, y: number, m: number) => {
    if (x >= 0 && x < W && y >= 0 && y < H) g[y * W + x] = m;
  };
  const hline = (x0: number, x1: number, y: number, m: number) => {
    for (let x = x0; x <= x1; x++) set(x, y, m);
  };
  const rect = (x0: number, x1: number, y0: number, y1: number, m: number) => {
    for (let y = y0; y <= y1; y++) hline(x0, x1, y, m);
  };
  return { g, set, hline, rect, cx };
}

// 胴体(肩→腰へテーパー)を共通で描く
function torso(grid: Grid, shoulderHalf: number, waistHalf: number, soft: number) {
  const { cx, rect } = grid;
  const tTop = 12, tBot = 26;
  const tH = tBot - tTop;
  for (let i = 0; i <= tH; i++) {
    const t = i / tH;
    let half = Math.round(shoulderHalf + (waistHalf - shoulderHalf) * t);
    if (soft >= 2 && i >= tH - 4) half += 1; // 下腹のせり出し
    if (i === 0) half = Math.round(shoulderHalf * 0.55) + 1;
    else if (i === 1) half = Math.round(shoulderHalf * 0.85);
    rect(cx - half, cx + half, tTop + i, tTop + i, SK);
  }
  return { tTop, tBot };
}

// 腕＋グローブ(前後共通)
function arms(grid: Grid, shoulderHalf: number, armTier: number, back: boolean) {
  const { cx, rect, set } = grid;
  const armW = 2 + Math.round(armTier * 0.9); // 2..6
  const aTop = 14, aBot = 24;
  const armInner = shoulderHalf - 1;
  for (const side of [-1, 1] as const) {
    const x0 = side < 0 ? cx - armInner - armW : cx + armInner;
    const x1 = x0 + armW - 1;
    rect(x0, x1, aTop, aBot, SK);
    if (armTier >= 2) {
      const bx = side < 0 ? x0 - 1 : x1 + 1; // 力こぶ/三頭の張り
      rect(bx, bx, aTop + 1, aTop + 4, SK);
    }
    // 陰: 前は外側、後ろ(三頭)は内側に筋
    const shadeX = back ? (side < 0 ? x1 : x0) : (side < 0 ? x0 : x1);
    rect(shadeX, shadeX, aTop + 4, aBot, SKS);
    // グローブ
    rect(x0 - 1, x1 + 1, aBot + 1, aBot + 5, GL);
    set(side < 0 ? x0 - 1 : x1 + 1, aBot + 3, GLS);
    grid.hline(x0 - 1, x1 + 1, aBot + 1, WB);
    grid.hline(x0 - 1, x1 + 1, aBot + 5, GLS);
  }
}

// トランクス＋脚＋シューズ(前後共通)
function lowerBody(grid: Grid, waistHalf: number, g: number, legTier: number) {
  const { cx, rect, hline, set } = grid;
  const trTop = 26, trBot = 31;
  rect(cx - waistHalf, cx + waistHalf, trTop, trBot, TR);
  hline(cx - waistHalf, cx + waistHalf, trTop, WB);
  rect(cx, cx, trTop + 1, trBot, TRS);
  hline(cx - waistHalf, cx + waistHalf, trBot, TRS);

  const legW = 3 + Math.round(legTier * 0.7) + (g > 1 ? 1 : 0);
  const gap = 1, lTop = 31, lBot = 40;
  rect(cx - gap - legW, cx - gap - 1, lTop, lBot, SK);
  rect(cx + gap + 1, cx + gap + legW, lTop, lBot, SK);
  rect(cx - gap - 1, cx - gap - 1, lTop, lBot, SKS);
  rect(cx + gap + 1, cx + gap + 1, lTop, lBot, SKS);
  if (legTier >= 2) { // ふくらはぎ/ハム
    set(cx - gap - legW, lTop + 5, SK);
    set(cx + gap + legW, lTop + 5, SK);
    hline(cx - gap - legW, cx - gap - 1, lTop + 6, SKS);
    hline(cx + gap + 1, cx + gap + legW, lTop + 6, SKS);
  }
  rect(cx - gap - legW - 1, cx - gap - 1, lBot + 1, lBot + 2, BOOT);
  rect(cx + gap + 1, cx + gap + legW + 1, lBot + 1, lBot + 2, BOOT);
  hline(cx - gap - legW - 1, cx - gap - 1, lBot + 2, BOOTS);
  hline(cx + gap + 1, cx + gap + legW + 1, lBot + 2, BOOTS);
}

function buildFront(b: AvatarBuild): number[] {
  const grid = newGrid();
  const { cx, set, hline, rect } = grid;
  const { chest, back, shoulders, arms: ar, legs, core } = b.parts;
  const g = b.girth, soft = b.soft;

  const waistHalf = 4 + g;
  const shoulderHalf = Math.min(
    13,
    waistHalf + Math.round(shoulders * 1.1) + Math.round(chest * 0.5) + Math.round(back * 0.3) + 1,
  );

  // 頭
  const hh = 4;
  rect(cx - hh, cx + hh, 3, 10, SK);
  rect(cx - hh, cx + hh, 2, 4, HAIR);
  set(cx - hh - 1, 3, HAIR); set(cx + hh + 1, 3, HAIR);
  set(cx - hh - 1, 7, SK); set(cx + hh + 1, 7, SK); // 耳
  hline(cx - 2, cx + 2, 5, SKS);
  set(cx - 2, 6, EYE); set(cx + 2, 6, EYE);
  set(cx, 7, SKS);
  hline(cx - 2, cx + 1, 9, SKS);

  // 首・僧帽筋
  const neckHalf = shoulders >= 3 ? 2 : 1;
  rect(cx - neckHalf, cx + neckHalf, 10, 12, SK);
  hline(cx - neckHalf, cx + neckHalf, 11, SKS);

  torso(grid, shoulderHalf, waistHalf, soft);

  // 僧帽筋スロープ(肩)
  if (shoulders >= 2) {
    for (let k = 1; k <= shoulders; k++) {
      set(cx - neckHalf - k, 12 + Math.round(k / 2), SK);
      set(cx + neckHalf + k, 12 + Math.round(k / 2), SK);
    }
  }
  // 三角筋
  if (shoulders >= 1) {
    for (const s of [-1, 1]) {
      const ox = s < 0 ? cx - shoulderHalf - shoulders : cx + shoulderHalf;
      rect(ox, ox + shoulders - 1, 12, 13, SK);
      hline(ox, ox + shoulders - 1, 12, s < 0 ? SKL : SKS);
    }
  }
  // 大胸筋
  if (chest >= 1) {
    const pecH = 13 + Math.min(3, chest);
    hline(cx - shoulderHalf + 2, cx + shoulderHalf - 2, pecH, SKS); // 下縁
    rect(cx, cx, 13, pecH, SKS); // 谷
    if (chest >= 3) { set(cx - 2, 14, SKL); set(cx + 2, 14, SKL); }
  }
  // 腹筋
  if (core >= 1) {
    const abW = Math.min(3, waistHalf - 2);
    rect(cx, cx, 17, 24, SKS);
    const rows = Math.min(3, core);
    for (let r = 0; r < rows; r++) hline(cx - abW, cx + abW, 19 + r * 2, SKS);
  }
  // 広背筋(前から見た脇のハリ)
  if (back >= 2) {
    for (const s of [-1, 1]) {
      const x = s < 0 ? cx - waistHalf - 1 : cx + waistHalf + 1;
      rect(x, x, 17, 22, SK);
      grid.set(x, 19, SKS);
    }
  }
  // たるみ(脂肪)
  if (soft >= 2 && core < 2) {
    set(cx, 22, SKS);
    hline(cx - 2, cx + 2, 24, SKS);
  }

  arms(grid, shoulderHalf, ar, false);
  lowerBody(grid, waistHalf, g, legs);
  return grid.g;
}

function buildBack(b: AvatarBuild): number[] {
  const grid = newGrid();
  const { cx, set, hline, rect } = grid;
  const { back, shoulders, arms: ar, legs, core } = b.parts;
  const g = b.girth, soft = b.soft;

  const waistHalf = 4 + g;
  // 背中は広背筋でV字に大きく広がる
  const shoulderHalf = Math.min(
    14,
    waistHalf + Math.round(back * 1.4) + Math.round(shoulders * 0.6) + 1,
  );

  // 頭(後ろ＝顔なし、髪で覆う)
  const hh = 4;
  rect(cx - hh, cx + hh, 3, 10, SK);
  rect(cx - hh, cx + hh, 2, 7, HAIR);
  set(cx - hh - 1, 3, HAIR); set(cx + hh + 1, 3, HAIR);
  set(cx - hh - 1, 7, SK); set(cx + hh + 1, 7, SK);
  hline(cx - hh + 1, cx + hh - 1, 7, HAIR); // 襟足
  // 首・僧帽筋(後ろは盛り上がりが目立つ)
  const neckHalf = shoulders >= 2 ? 2 : 1;
  rect(cx - neckHalf, cx + neckHalf, 8, 12, SK);
  if (shoulders >= 1) {
    for (let k = 1; k <= shoulders + 1; k++) {
      set(cx - neckHalf - k, 9 + Math.round(k / 2), SK);
      set(cx + neckHalf + k, 9 + Math.round(k / 2), SK);
    }
    hline(cx - neckHalf - 1, cx + neckHalf + 1, 11, SKS); // 僧帽の谷
  }

  torso(grid, shoulderHalf, waistHalf, soft);

  // 三角筋(後ろ)
  if (shoulders >= 1) {
    for (const s of [-1, 1]) {
      const ox = s < 0 ? cx - shoulderHalf - shoulders : cx + shoulderHalf;
      rect(ox, ox + shoulders - 1, 12, 13, SK);
    }
  }
  // 背骨
  rect(cx, cx, 13, 25, SKS);
  // 肩甲骨
  if (back >= 1) {
    set(cx - 2, 14, SKS); set(cx + 2, 14, SKS);
    set(cx - 3, 15, SKS); set(cx + 3, 15, SKS);
  }
  // 広背筋スイープ(脇下→腰へ斜めの陰)= 背中の主役
  if (back >= 2) {
    const sweep = Math.min(4, back);
    for (let i = 0; i < sweep + 2; i++) {
      const y = 16 + i;
      const off = shoulderHalf - 1 - i;
      set(cx - off, y, SKS);
      set(cx + off, y, SKS);
    }
  }
  // 腰のくびれ強調(V字)
  if (back >= 3) {
    hline(cx - waistHalf, cx - waistHalf + 1, 24, SKS);
    hline(cx + waistHalf - 1, cx + waistHalf, 24, SKS);
  }
  if (soft >= 2) { hline(cx - 3, cx + 3, 23, SKS); } // 背中のたるみ

  arms(grid, shoulderHalf, ar, true);
  lowerBody(grid, waistHalf, g, legs);
  // 脚の裏(ハム)中心線
  if (legs >= 1) {
    set(cx - 3, 34, SKS); set(cx + 3, 34, SKS);
  }
  void core;
  return grid.g;
}

function postProcess(src: number[]): number[] {
  const at = (x: number, y: number) =>
    x < 0 || x >= W || y < 0 || y >= H ? E : src[y * W + x];
  const shaded = src.slice();
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const tri = SHADE3[src[y * W + x]];
      if (!tri) continue;
      const lit = at(x - 1, y) === E || at(x, y - 1) === E;
      const shade = at(x + 1, y) === E || at(x, y + 1) === E;
      if (lit) shaded[y * W + x] = tri[0];
      else if (shade) shaded[y * W + x] = tri[2];
    }
  }
  const out = shaded.slice();
  const at2 = (x: number, y: number) =>
    x < 0 || x >= W || y < 0 || y >= H ? E : shaded[y * W + x];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (shaded[y * W + x] !== E) continue;
      if (at2(x - 1, y) > E || at2(x + 1, y) > E || at2(x, y - 1) > E || at2(x, y + 1) > E) {
        out[y * W + x] = OUT;
      }
    }
  }
  return out;
}

interface Run { x: number; y: number; w: number; fill: string; }
function toRuns(g: number[]): Run[] {
  const runs: Run[] = [];
  for (let y = 0; y < H; y++) {
    let x = 0;
    while (x < W) {
      const m = g[y * W + x];
      if (m === E) { x++; continue; }
      let w = 1;
      while (x + w < W && g[y * W + x + w] === m) w++;
      runs.push({ x, y, w, fill: COLORS[m] });
      x += w;
    }
  }
  return runs;
}

export function PixelAvatar({
  build,
  size = 200,
  aura,
}: {
  build: AvatarBuild;
  size?: number;
  aura?: string;
}) {
  const grid = build.view === "back" ? buildBack(build) : buildFront(build);
  const runs = toRuns(postProcess(grid));
  const vbW = W * CELL;
  const vbH = H * CELL;
  return (
    <div
      className="pixel-avatar-frame"
      style={aura ? { boxShadow: `0 0 0 3px ${aura}, 0 0 24px ${aura}55` } : undefined}
    >
      <svg
        width={size}
        height={size * (vbH / vbW)}
        viewBox={`0 0 ${vbW} ${vbH}`}
        shapeRendering="crispEdges"
        style={{ imageRendering: "pixelated", display: "block" }}
      >
        {runs.map((r, i) => (
          <rect key={i} x={r.x * CELL} y={r.y * CELL} width={r.w * CELL} height={CELL} fill={r.fill} />
        ))}
      </svg>
    </div>
  );
}
