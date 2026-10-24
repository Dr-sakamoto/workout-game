import * as THREE from "three";

// エイジング(使い込まれた質感)のテクスチャを canvas で生成する

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function canvas(size: number) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  return [c, c.getContext("2d")!] as const;
}

function toTexture(c: HTMLCanvasElement, srgb: boolean) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** 色ムラ: 半透明のぼかした斑点をたくさん重ねる */
function mottle(g: CanvasRenderingContext2D, size: number, r: () => number, colors: string[], count: number, alpha: number) {
  for (let i = 0; i < count; i++) {
    const x = r() * size;
    const y = r() * size;
    const rad = size * (0.02 + r() * 0.12);
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, colors[Math.floor(r() * colors.length)]);
    grad.addColorStop(1, "transparent");
    g.globalAlpha = alpha * (0.4 + r() * 0.6);
    g.fillStyle = grad;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  g.globalAlpha = 1;
}

function scratches(g: CanvasRenderingContext2D, size: number, r: () => number, color: string, count: number, alpha: number) {
  g.strokeStyle = color;
  g.lineCap = "round";
  for (let i = 0; i < count; i++) {
    let x = r() * size;
    let y = r() * size;
    const len = size * (0.02 + r() * 0.12);
    let a = r() * Math.PI * 2;
    g.globalAlpha = alpha * (0.3 + r() * 0.7);
    g.lineWidth = 0.6 + r() * 1.4;
    g.beginPath();
    g.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      a += (r() - 0.5) * 0.4;
      x += (Math.cos(a) * len) / 4;
      y += (Math.sin(a) * len) / 4;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
}

/** 欠け: ギザギザの小さな多角形 */
function chips(g: CanvasRenderingContext2D, size: number, r: () => number, color: string, count: number) {
  g.fillStyle = color;
  for (let i = 0; i < count; i++) {
    // 端に寄せる(角や縁のほうが欠けやすい)
    const edge = r() < 0.85;
    const side = r() < 0.5;
    const x = edge && side ? (r() < 0.5 ? r() * 0.05 : 1 - r() * 0.05) * size : r() * size;
    const y = edge && !side ? (r() < 0.5 ? r() * 0.05 : 1 - r() * 0.05) * size : r() * size;
    const rad = size * (0.004 + r() * 0.014);
    g.globalAlpha = 0.6 + r() * 0.4;
    g.beginPath();
    const n = 6 + Math.floor(r() * 5);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const rr = rad * (0.4 + r() * 0.9);
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (k === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.fill();
  }
  g.globalAlpha = 1;
}

/** 上から垂れた汚れと、下のほうに溜まった汚れ */
function grime(g: CanvasRenderingContext2D, size: number, r: () => number, color: string, alpha: number) {
  for (let i = 0; i < 40; i++) {
    const x = r() * size;
    const w = 2 + r() * 10;
    const h = size * (0.1 + r() * 0.5);
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, color);
    grad.addColorStop(1, "transparent");
    g.globalAlpha = alpha * r();
    g.fillStyle = grad;
    g.fillRect(x, 0, w, h);
  }
  const bottom = g.createLinearGradient(0, size, 0, size * 0.6);
  bottom.addColorStop(0, color);
  bottom.addColorStop(1, "transparent");
  g.globalAlpha = alpha * 1.4;
  g.fillStyle = bottom;
  g.fillRect(0, size * 0.6, size, size * 0.4);
  g.globalAlpha = 1;
}

export interface AgedMaps {
  map: THREE.Texture;
  roughnessMap: THREE.Texture;
}

/** 使い込まれた赤い塗装 */
export function agedPaint(base: string, seed = 1, size = 1024): AgedMaps {
  const r = rng(seed);
  const [c, g] = canvas(size);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  mottle(g, size, r, ["#5a0a0e", "#b0262c", "#6e1a12", "#8a2a1a"], 260, 0.35);
  grime(g, size, r, "#2a1410", 0.35);
  scratches(g, size, r, "#d9a79a", 140, 0.35);
  chips(g, size, r, "#5d5550", 34);
  chips(g, size, r, "#2a2220", 14);

  const rr = rng(seed);
  const [rc, rg] = canvas(size);
  rg.fillStyle = "#6a6a6a";
  rg.fillRect(0, 0, size, size);
  mottle(rg, size, rr, ["#9a9a9a", "#4a4a4a"], 260, 0.5);
  grime(rg, size, rr, "#c8c8c8", 0.4);
  scratches(rg, size, rr, "#e0e0e0", 140, 0.6);
  chips(rg, size, rr, "#f0f0f0", 48);
  return { map: toTexture(c, true), roughnessMap: toTexture(rc, false) };
}

/** 傷とくすみのある金属 */
export function agedMetal(base: string, seed = 7, size = 512): AgedMaps {
  const r = rng(seed);
  const [c, g] = canvas(size);
  g.fillStyle = base;
  g.fillRect(0, 0, size, size);
  // ヘアライン
  for (let y = 0; y < size; y += 1) {
    g.globalAlpha = 0.04 + r() * 0.06;
    g.fillStyle = r() < 0.5 ? "#ffffff" : "#5a5e66";
    g.fillRect(0, y, size, 1);
  }
  g.globalAlpha = 1;
  mottle(g, size, r, ["#6b625a", "#8a8070", "#3e3a36"], 120, 0.35);
  scratches(g, size, r, "#f4f6fa", 120, 0.5);
  scratches(g, size, r, "#3a3d42", 60, 0.35);

  const rr = rng(seed);
  const [rc, rg] = canvas(size);
  rg.fillStyle = "#2e2e2e";
  rg.fillRect(0, 0, size, size);
  mottle(rg, size, rr, ["#8a8a8a", "#5a5a5a"], 120, 0.6);
  scratches(rg, size, rr, "#a0a0a0", 160, 0.6);
  return { map: toTexture(c, true), roughnessMap: toTexture(rc, false) };
}

/** ガラスの曇りと指紋っぽい汚れ(roughness 用) */
export function agedGlass(seed = 3, size = 512): THREE.Texture {
  const r = rng(seed);
  const [c, g] = canvas(size);
  g.fillStyle = "#101010";
  g.fillRect(0, 0, size, size);
  mottle(g, size, r, ["#6a6a6a", "#9a9a9a"], 90, 0.5);
  grime(g, size, r, "#707070", 0.4);
  scratches(g, size, r, "#b0b0b0", 50, 0.4);
  return toTexture(c, false);
}
