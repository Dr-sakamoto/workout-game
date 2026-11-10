import * as THREE from "three";

// エイジング(使い込まれた質感)のテクスチャを canvas で生成する

type Ctx = CanvasRenderingContext2D;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(size: number, fill: string) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  g.fillStyle = fill;
  g.fillRect(0, 0, size, size);
  return [c, g] as const;
}

function toTexture(c: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

/** 色ムラ: 半透明のぼかした斑点をたくさん重ねる */
function mottle(g: Ctx, size: number, r: () => number, colors: string[], count: number, alpha: number) {
  for (let i = 0; i < count; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = size * (0.03 + r() * 0.14);
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, colors[Math.floor(r() * colors.length)]);
    grad.addColorStop(1, "transparent");
    g.globalAlpha = alpha * (0.4 + r() * 0.6);
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.globalAlpha = 1;
}

/** 上から垂れた汚れと、下のほうに溜まった汚れ */
function grime(g: Ctx, size: number, r: () => number, color: string, alpha: number) {
  for (let i = 0; i < 46; i++) {
    const x = r() * size;
    const w = 1 + r() * 7;
    const h = size * (0.08 + r() * 0.4);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "transparent");
    g.globalAlpha = alpha * r();
    g.fillStyle = grad;
    g.fillRect(x, 0, w, h);
  }
  const bottom = g.createLinearGradient(0, size, 0, size * 0.7);
  bottom.addColorStop(0, color);
  bottom.addColorStop(1, "transparent");
  g.globalAlpha = alpha * 1.3;
  g.fillStyle = bottom;
  g.fillRect(0, size * 0.7, size, size * 0.3);
  g.globalAlpha = 1;
}

// 傷と欠けは、色・粗さ・凹凸の3枚で同じ位置に描くので、先に形だけ作っておく

interface Scratch {
  pts: [number, number][];
  w: number;
  a: number;
}

function genScratches(r: () => number, size: number, count: number, maxLen: number): Scratch[] {
  const out: Scratch[] = [];
  for (let i = 0; i < count; i++) {
    let x = r() * size;
    let y = r() * size;
    const len = size * (0.01 + r() * r() * maxLen);
    let a = r() * Math.PI * 2;
    const pts: [number, number][] = [[x, y]];
    for (let s = 0; s < 5; s++) {
      a += (r() - 0.5) * 0.3;
      x += (Math.cos(a) * len) / 5;
      y += (Math.sin(a) * len) / 5;
      pts.push([x, y]);
    }
    out.push({ pts, w: 0.5 + r() * 0.9, a: 0.3 + r() * 0.7 });
  }
  return out;
}

function drawScratches(g: Ctx, list: Scratch[], color: string, alpha: number, widen = 1) {
  g.strokeStyle = color;
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const s of list) {
    g.globalAlpha = alpha * s.a;
    g.lineWidth = s.w * widen;
    g.beginPath();
    s.pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  }
  g.globalAlpha = 1;
}

interface Chip {
  x: number;
  y: number;
  rad: number;
  /** 輪郭(角度ごとの半径の倍率) */
  shape: number[];
  a: number;
}

/** 欠け。角や縁のほうが欠けやすいので、ほとんどを端に寄せる */
function genChips(r: () => number, size: number, count: number): Chip[] {
  const out: Chip[] = [];
  const near = () => (r() < 0.5 ? r() * r() * 0.07 : 1 - r() * r() * 0.07) * size;
  for (let i = 0; i < count; i++) {
    const edge = r() < 0.9;
    const side = r() < 0.5;
    const x = edge && side ? near() : r() * size;
    const y = edge && !side ? near() : r() * size;
    const n = 7 + Math.floor(r() * 6);
    const shape: number[] = [];
    for (let k = 0; k < n; k++) shape.push(0.45 + r() * 0.75);
    out.push({ x, y, rad: size * (0.0025 + r() * r() * 0.012), shape, a: 0.7 + r() * 0.3 });
  }
  return out;
}

function drawChips(g: Ctx, list: Chip[], color: string, scale = 1, alpha = 1) {
  g.fillStyle = color;
  for (const c of list) {
    g.globalAlpha = alpha * c.a;
    g.beginPath();
    c.shape.forEach((k, i) => {
      const a = (i / c.shape.length) * Math.PI * 2;
      const px = c.x + Math.cos(a) * c.rad * k * scale;
      const py = c.y + Math.sin(a) * c.rad * k * scale;
      if (i) g.lineTo(px, py);
      else g.moveTo(px, py);
    });
    g.closePath();
    g.fill();
  }
  g.globalAlpha = 1;
}

export interface AgedMaps {
  map: THREE.Texture;
  roughnessMap: THREE.Texture;
  bumpMap: THREE.Texture;
}

/** 使い込まれた塗装。欠けは下地→地金の2段、傷と欠けは凹凸にも入れる */
export function agedPaint(base: string, seed = 1, size = 1024): AgedMaps {
  const shapes = rng(seed + 101);
  const fine = genScratches(shapes, size, 260, 0.07);
  const deep = genScratches(shapes, size, 26, 0.16);
  const chips = genChips(shapes, size, 90);

  const [c, g] = canvas(size, base);
  // 上は日焼けで少し明るく、下は暗く
  const fade = g.createLinearGradient(0, 0, 0, size);
  fade.addColorStop(0, "rgba(255,170,150,0.10)");
  fade.addColorStop(0.5, "rgba(0,0,0,0)");
  fade.addColorStop(1, "rgba(20,0,0,0.28)");
  g.fillStyle = fade;
  g.fillRect(0, 0, size, size);
  let r = rng(seed);
  mottle(g, size, r, ["#5a0a0e", "#a8242a", "#6e1a12", "#7c1616"], 200, 0.2);
  grime(g, size, r, "#2a1410", 0.26);
  drawScratches(g, fine, "#e0aa9c", 0.3);
  drawScratches(g, deep, "#b9aaa2", 0.55, 1.5);
  drawChips(g, chips, "#a3554c", 1.5, 0.6); // 塗膜のめくれ
  drawChips(g, chips, "#8d8782", 1.15); // 下地
  drawChips(g, chips, "#3b312c", 0.6); // 地金とサビ

  const [rc, rg] = canvas(size, "#5c5c5c");
  r = rng(seed);
  mottle(rg, size, r, ["#8a8a8a", "#404040"], 200, 0.4);
  grime(rg, size, r, "#b8b8b8", 0.35);
  drawScratches(rg, fine, "#d0d0d0", 0.5);
  drawScratches(rg, deep, "#f0f0f0", 0.8, 1.5);
  drawChips(rg, chips, "#f4f4f4", 1.2);

  const [bc, bg] = canvas(size, "#808080");
  drawScratches(bg, fine, "#606060", 0.5);
  drawScratches(bg, deep, "#303030", 0.9, 1.6);
  drawChips(bg, chips, "#a0a0a0", 1.6, 0.7); // めくれた縁は少し盛り上がる
  drawChips(bg, chips, "#262626", 1.15);

  return { map: toTexture(c, true), roughnessMap: toTexture(rc, false), bumpMap: toTexture(bc, false) };
}

/** ヘアライン仕上げの金属。細かい擦り傷と、うっすらしたくすみ */
export function agedMetal(base: string, seed = 7, size = 512): AgedMaps {
  const shapes = rng(seed + 101);
  const fine = genScratches(shapes, size, 150, 0.1);
  const deep = genScratches(shapes, size, 14, 0.2);

  const hairline = (g: Ctx, light: string, dark: string, alpha: number) => {
    const r = rng(seed + 55);
    for (let y = 0; y < size; y += 1) {
      g.globalAlpha = alpha * (0.3 + r() * 0.7);
      g.fillStyle = r() < 0.5 ? light : dark;
      g.fillRect(0, y, size, 1);
    }
    g.globalAlpha = 1;
  };

  const [c, g] = canvas(size, base);
  hairline(g, "#ffffff", "#4c5058", 0.09);
  let r = rng(seed);
  mottle(g, size, r, ["#857b70", "#5e5a56", "#a59a8a"], 70, 0.13);
  drawScratches(g, fine, "#f6f8fc", 0.4);
  drawScratches(g, deep, "#33363a", 0.4, 1.4);

  const [rc, rg] = canvas(size, "#3a3a3a");
  hairline(rg, "#707070", "#161616", 0.3);
  r = rng(seed);
  mottle(rg, size, r, ["#868686", "#5c5c5c"], 70, 0.35);
  drawScratches(rg, fine, "#9a9a9a", 0.6);
  drawScratches(rg, deep, "#c8c8c8", 0.8, 1.4);

  const [bc, bg] = canvas(size, "#808080");
  hairline(bg, "#8c8c8c", "#747474", 0.5);
  drawScratches(bg, deep, "#404040", 0.8, 1.6);

  return { map: toTexture(c, true), roughnessMap: toTexture(rc, false), bumpMap: toTexture(bc, false) };
}

/** ガラスの曇りと指紋っぽい汚れ(roughness 用) */
export function agedGlass(seed = 3, size = 512): THREE.Texture {
  const r = rng(seed);
  const [c, g] = canvas(size, "#0c0c0c");
  mottle(g, size, r, ["#5a5a5a", "#8a8a8a"], 70, 0.4);
  grime(g, size, r, "#606060", 0.35);
  drawScratches(g, genScratches(r, size, 50, 0.1), "#b0b0b0", 0.4);
  return toTexture(c, false);
}

/** ガラスに走る斜めの映り込み。黒=透明として加算で重ねる */
export function glassGlare(size = 256): THREE.Texture {
  const [c, g] = canvas(size, "#000000");
  g.translate(size / 2, size / 2);
  g.rotate(-Math.PI / 5);
  for (const [pos, w, a] of [[-0.3, 0.13, 0.5], [-0.11, 0.035, 0.3], [0.3, 0.07, 0.22]]) {
    const x = pos * size;
    const half = (w * size) / 2;
    const grad = g.createLinearGradient(x - half, 0, x + half, 0);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(0.5, `rgba(255,255,255,${a})`);
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(x - half, -size, half * 2, size * 2);
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  // 下に向かって消える
  const fade = g.createLinearGradient(0, 0, 0, size);
  fade.addColorStop(0.25, "rgba(0,0,0,0)");
  fade.addColorStop(1, "rgba(0,0,0,0.9)");
  g.fillStyle = fade;
  g.fillRect(0, 0, size, size);
  const t = toTexture(c, true);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** 接地影: 真ん中が濃く、外に向かって消える */
export function contactShadow(size = 256): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, "rgba(0,0,0,0.5)");
  grad.addColorStop(0.45, "rgba(0,0,0,0.28)");
  grad.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  return new THREE.CanvasTexture(c);
}

/** ハンドルのまわりのリング: 黒いホーローに白い目盛りと、時計回りの矢印 */
export function dialRing(size = 512): THREE.Texture {
  const [c, g] = canvas(size, "#17171a");
  const mid = size / 2;
  g.translate(mid, mid);
  g.strokeStyle = g.fillStyle = "#ecebe6";
  // 目盛り(外周 0.445 / 内周 0.385 のリングに描く。全体は半径 0.445 = テクスチャの端)
  const outer = mid;
  const inner = mid * (0.385 / 0.445);
  const band = outer - inner;
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const long = i % 6 === 0;
    g.lineWidth = long ? size * 0.008 : size * 0.004;
    g.globalAlpha = long ? 1 : 0.7;
    const r0 = inner + band * (long ? 0.2 : 0.38);
    const r1 = outer - band * (long ? 0.2 : 0.38);
    g.beginPath();
    g.moveTo(Math.cos(a) * r0, Math.sin(a) * r0);
    g.lineTo(Math.cos(a) * r1, Math.sin(a) * r1);
    g.stroke();
  }
  g.setTransform(1, 0, 0, 1, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** 白いホーローの縦長プレート「一日一回」 */
export function ruleLabel(w = 128, h = 256): THREE.Texture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  g.fillStyle = "#efece4";
  g.fillRect(0, 0, w, h);
  const r = rng(11);
  mottle(g, h, r, ["#cfc6b4", "#b9ad98"], 26, 0.25);
  g.strokeStyle = "#8e1016";
  g.lineWidth = 4;
  g.strokeRect(9, 9, w - 18, h - 18);
  g.fillStyle = "#8e1016";
  g.font = `900 ${Math.round(h * 0.17)}px "Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  [..."一日一回"].forEach((ch, i) => g.fillText(ch, w / 2, h * (0.2 + i * 0.2)));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
