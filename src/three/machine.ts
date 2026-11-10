import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { agedGlass, agedMetal, agedPaint, dialRing, glassGlare, ruleLabel } from "./aging";

// ガチャ本体とカプセルの3Dモデル。寸法はラフの比率(200px = 1)

const RED = "#8e1016";
/** 取り出し口の高さ */
export const EXIT_Y = 0.72;
/** ハンドルの中心 */
export const HANDLE_CENTER = new THREE.Vector3(0, 1.57, 0.75);
/** ハンドルの見た目の半径(まわりのリングまで) */
export const HANDLE_RADIUS = 0.445;

const BODY = { w: 2.09, h: 1.83, d: 1.4, y: 0.26 };
const HOLE = { w: 0.56, h: 0.44 };
/** ケースの床 */
const CASE_FLOOR = 2.2;

export interface Machine {
  group: THREE.Group;
  /** ハンドルの回る部分 */
  rotor: THREE.Group;
  /** 取り出し口のフラップ(上端がちょうつがい)。rotation.x を負にすると手前に開く */
  flap: THREE.Group;
  /** ケースの中のカプセル。userData.base に元の位置 */
  pile: THREE.Group[];
}

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 角丸の四角の輪郭(反時計回り)。始点と終点が重ならない点列で返す(重なると面を張るときに欠ける) */
function roundedRect(x: number, y: number, w: number, h: number, r: number, steps = 8) {
  const pts: THREE.Vector2[] = [];
  const corners: [number, number, number][] = [
    [x + w - r, y + r, -Math.PI / 2], [x + w - r, y + h - r, 0], [x + r, y + h - r, Math.PI / 2], [x + r, y + r, Math.PI],
  ];
  for (const [cx, cy, a0] of corners) {
    for (let i = 0; i <= steps; i++) {
      const a = a0 + (i / steps) * (Math.PI / 2);
      pts.push(new THREE.Vector2(cx + Math.cos(a) * r, cy + Math.sin(a) * r));
    }
  }
  return pts;
}

/** 箱の向きごとに位置からUVを振り直す。細長い面でもテクスチャが引き伸ばされない */
function projectUV(geo: THREE.BufferGeometry, scale: number) {
  const pos = geo.attributes.position;
  const nor = geo.attributes.normal;
  const uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(nor.getX(i));
    const ay = Math.abs(nor.getY(i));
    const az = Math.abs(nor.getZ(i));
    const [u, v] = ax > ay && ax > az ? [pos.getZ(i), pos.getY(i)] : ay > az ? [pos.getX(i), pos.getZ(i)] : [pos.getX(i), pos.getY(i)];
    uv.setXY(i, u * scale + 0.5, v * scale + 0.5);
  }
  return geo;
}

/** 回転体。断面は [半径, 高さ] の列で、軸が手前(+z)を向く */
function lathe(profile: [number, number][], segments = 64) {
  const geo = new THREE.LatheGeometry(profile.map(([r, y]) => new THREE.Vector2(r, y)), segments);
  geo.rotateX(Math.PI / 2);
  return geo;
}

// ---------- カプセル ----------

const capsuleGeo = {
  top: new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2),
  bottom: new THREE.SphereGeometry(0.965, 40, 20, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
  seam: new THREE.TorusGeometry(1, 0.05, 10, 56).rotateX(Math.PI / 2),
  lip: new THREE.CylinderGeometry(1.015, 1.015, 0.1, 56, 1, true),
  card: new RoundedBoxGeometry(1.05, 0.1, 0.72, 2, 0.04),
};

let capsuleMats: { top: THREE.Material[]; bottom: THREE.Material; seam: THREE.Material; card: THREE.Material } | undefined;

function capsuleMaterials() {
  if (capsuleMats) return capsuleMats;
  const P = THREE.MeshPhysicalMaterial;
  const side = THREE.DoubleSide;
  capsuleMats = {
    top: [
      new P({ color: "#f3f2ee", roughness: 0.32, clearcoat: 0.9, clearcoatRoughness: 0.15, side }),
      new P({ color: "#dfe3ea", metalness: 1, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1, side }),
      new P({ color: "#e9bf62", metalness: 1, roughness: 0.2, clearcoat: 1, clearcoatRoughness: 0.1, side }),
      new P({
        color: "#f1f0ff", metalness: 1, roughness: 0.1, clearcoat: 1, side,
        iridescence: 1, iridescenceIOR: 1.9, iridescenceThicknessRange: [120, 760],
      }),
    ],
    bottom: new P({
      color: "#c9d6db", roughness: 0.08, transparent: true, opacity: 0.46, clearcoat: 1, depthWrite: false,
      envMapIntensity: 1.8,
    }),
    seam: new P({ color: "#f6f5f1", roughness: 0.35, clearcoat: 0.6 }),
    card: new THREE.MeshStandardMaterial({ color: "#fbfaf5", roughness: 0.85 }),
  };
  return capsuleMats;
}

/**
 * カプセル。上半分=キラ度に応じた質感、下半分=透明で、中に入った紙が透けて見える。
 * userData: top / bottom / seam / card (半径1の空間に置いてある)
 */
export function makeCapsule(r: number, kira: number) {
  const m = capsuleMaterials();
  const g = new THREE.Group();
  const shell = new THREE.Group();
  shell.scale.setScalar(r);
  const top = new THREE.Group();
  const dome = new THREE.Mesh(capsuleGeo.top, m.top[THREE.MathUtils.clamp(kira, 1, 4) - 1]);
  const lip = new THREE.Mesh(capsuleGeo.lip, dome.material);
  lip.position.y = 0.05;
  top.add(dome, lip);
  const bottom = new THREE.Mesh(capsuleGeo.bottom, m.bottom);
  const seam = new THREE.Mesh(capsuleGeo.seam, m.seam);
  const card = new THREE.Mesh(capsuleGeo.card, m.card);
  card.position.y = -0.36;
  card.rotation.set(0.18, 0.5, -0.12);
  dome.castShadow = bottom.castShadow = true;
  bottom.renderOrder = 1;
  shell.add(card, top, bottom, seam);
  g.add(shell);
  g.userData = { top, bottom, seam, card };
  return g;
}

/** ケースの中にカプセルを1個ずつ落として積む(いちばん低く収まる場所に置いていく) */
function packPile(count: number) {
  const r = rng(29);
  const placed: { x: number; y: number; z: number; r: number }[] = [];
  for (let i = 0; i < count; i++) {
    const rad = 0.17 + r() * 0.035;
    const limX = 0.67 - rad;
    const limZ = 0.52 - rad;
    let best = { x: 0, y: Infinity, z: 0, r: rad };
    for (let k = 0; k < 500; k++) {
      const x = (r() * 2 - 1) * limX;
      const z = (r() * 2 - 1) * limZ;
      let y = CASE_FLOOR + rad;
      for (const p of placed) {
        const d2 = (p.x - x) ** 2 + (p.z - z) ** 2;
        const reach = p.r + rad;
        if (d2 < reach * reach) y = Math.max(y, p.y + Math.sqrt(reach * reach - d2));
      }
      if (y < best.y) best = { x, y, z, r: rad };
    }
    placed.push(best);
  }
  return placed;
}

// ---------- 本体 ----------

export function buildMachine(): Machine {
  const group = new THREE.Group();
  const add = <T extends THREE.Object3D>(o: T, x = 0, y = 0, z = 0, parent: THREE.Object3D = group) => {
    o.position.set(x, y, z);
    if (o instanceof THREE.Mesh) o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  };

  const paint = agedPaint(RED);
  const red = new THREE.MeshPhysicalMaterial({
    color: "#ffffff", map: paint.map, roughness: 1, roughnessMap: paint.roughnessMap,
    bumpMap: paint.bumpMap, bumpScale: 1.6, clearcoat: 0.5, clearcoatRoughness: 0.3,
  });
  const steel = agedMetal("#d8dce2");
  const metal = new THREE.MeshStandardMaterial({
    color: "#ffffff", map: steel.map, metalness: 1, roughness: 1, roughnessMap: steel.roughnessMap,
    bumpMap: steel.bumpMap, bumpScale: 0.5, envMapIntensity: 1.4,
  });
  const darkMetal = metal.clone();
  darkMetal.color.set("#7c8087");
  const rubber = new THREE.MeshStandardMaterial({ color: "#1b1b1d", roughness: 0.92 });
  const dark = new THREE.MeshStandardMaterial({ color: "#0e0e10", roughness: 0.95, envMapIntensity: 0.15 });

  // --- 土台とゴム足
  for (const x of [-0.8, 0.8]) for (const z of [-0.48, 0.48]) add(new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 0.08, 20), rubber), x, 0.04, z);
  add(new THREE.Mesh(new RoundedBoxGeometry(1.97, 0.22, 1.28, 3, 0.03), darkMetal), 0, 0.17);

  // --- 胴体: 取り出し口をくり抜いた角丸の箱
  const shape = new THREE.Shape(roundedRect(-BODY.w / 2, 0, BODY.w, BODY.h, 0.12));
  const holeY = EXIT_Y - BODY.y - HOLE.h / 2;
  shape.holes.push(new THREE.Path(roundedRect(-HOLE.w / 2, holeY, HOLE.w, HOLE.h, 0.03, 3)));
  const bevel = 0.07;
  // 面ごとに 0〜1 のUVを振る(欠けを面の縁に寄せて描いてあるため)
  const faceUV = (v: number[], i: number, wall: boolean, alongY: boolean) => {
    const x = v[i * 3] / BODY.w + 0.5;
    const y = v[i * 3 + 1] / BODY.h;
    const z = (v[i * 3 + 2] + bevel) / BODY.d;
    return wall ? new THREE.Vector2(alongY ? y : x, z) : new THREE.Vector2(x, y);
  };
  const bodyGeo = new THREE.ExtrudeGeometry(shape, {
    depth: BODY.d - bevel * 2, bevelThickness: bevel, bevelSize: bevel, bevelOffset: -bevel, bevelSegments: 5, curveSegments: 8,
    UVGenerator: {
      generateTopUV: (_g, v, a, b, c) => [a, b, c].map((i) => faceUV(v, i, false, false)),
      generateSideWallUV: (_g, v, a, b, c, d) => {
        const alongY = Math.abs(v[a * 3 + 1] - v[b * 3 + 1]) > Math.abs(v[a * 3] - v[b * 3]);
        return [a, b, c, d].map((i) => faceUV(v, i, true, alongY));
      },
    },
  });
  bodyGeo.translate(0, 0, -(BODY.d - bevel * 2) / 2);
  add(new THREE.Mesh(bodyGeo, red), 0, BODY.y);
  const front = BODY.d / 2;

  // --- 取り出し口: 奥まで続く暗い箱 + メタルの枠 + 受け皿 + 半透明のフラップ
  const liner = new THREE.Mesh(
    new THREE.BoxGeometry(HOLE.w - 0.004, HOLE.h - 0.004, 0.64),
    new THREE.MeshStandardMaterial({ color: "#0e0e10", roughness: 0.95, envMapIntensity: 0.15, side: THREE.BackSide }),
  );
  liner.position.set(0, EXIT_Y, front - 0.33);
  liner.receiveShadow = true;
  group.add(liner);
  const frameShape = new THREE.Shape(roundedRect(-0.37, -0.3, 0.74, 0.6, 0.06, 5));
  frameShape.holes.push(new THREE.Path(roundedRect(-HOLE.w / 2, -HOLE.h / 2, HOLE.w, HOLE.h, 0.03, 3)));
  const frameGeo = new THREE.ExtrudeGeometry(frameShape, {
    depth: 0.045, bevelThickness: 0.014, bevelSize: 0.014, bevelOffset: -0.014, bevelSegments: 3, curveSegments: 6,
  });
  add(new THREE.Mesh(frameGeo, metal), 0, EXIT_Y, front + 0.012);
  add(new THREE.Mesh(new RoundedBoxGeometry(0.54, 0.03, 0.2, 2, 0.012), metal), 0, EXIT_Y - HOLE.h / 2 + 0.005, front + 0.03);
  const flap = new THREE.Group();
  flap.position.set(0, EXIT_Y + HOLE.h / 2 - 0.01, front + 0.03);
  const flapPlate = new THREE.Mesh(
    new RoundedBoxGeometry(HOLE.w - 0.03, HOLE.h - 0.04, 0.014, 2, 0.006),
    new THREE.MeshPhysicalMaterial({
      color: "#30363b", roughness: 0.12, transparent: true, opacity: 0.6, clearcoat: 1, envMapIntensity: 1.6, depthWrite: false,
    }),
  );
  flapPlate.position.y = -(HOLE.h - 0.04) / 2;
  flapPlate.renderOrder = 1;
  const hinge = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, HOLE.w - 0.02, 10).rotateZ(Math.PI / 2), metal);
  flap.add(flapPlate, hinge);
  group.add(flap);

  // --- ハンドル: ベゼル + 目盛りのリング(固定) / 皿状のダイヤル + ローレット + つまみ(回る)
  const hy = HANDLE_CENTER.y;
  add(new THREE.Mesh(lathe([[0.5, 0], [0.5, 0.028], [0.492, 0.046], [0.474, 0.056], [0.458, 0.056], [0.446, 0.044], [0.442, 0]]), metal), 0, hy, front);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.385, HANDLE_RADIUS, 64),
    new THREE.MeshPhysicalMaterial({ map: dialRing(), roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.2 }),
  );
  ring.position.set(0, hy, front + 0.004);
  ring.receiveShadow = true;
  group.add(ring);

  const rotor = new THREE.Group();
  rotor.position.copy(HANDLE_CENTER);
  // ローカルの z=0 は胴体の面から 0.05 手前
  const dial = new THREE.Mesh(
    lathe([[0.378, -0.05], [0.378, 0.03], [0.368, 0.046], [0.345, 0.054], [0.325, 0.05], [0.305, 0.034], [0.28, 0.022], [0.0, 0.016]]),
    metal,
  );
  dial.castShadow = dial.receiveShadow = true;
  const knurlGeo = new THREE.BoxGeometry(0.014, 0.022, 0.066);
  const knurl = new THREE.InstancedMesh(knurlGeo, darkMetal, 72);
  const m4 = new THREE.Matrix4();
  for (let i = 0; i < 72; i++) {
    const a = (i / 72) * Math.PI * 2;
    m4.makeRotationZ(a - Math.PI / 2).setPosition(Math.cos(a) * 0.38, Math.sin(a) * 0.38, -0.008);
    knurl.setMatrixAt(i, m4);
  }
  // つまみ: 両端が丸い棒。面取りして指がかかる形にする
  const gripGeo = new THREE.ExtrudeGeometry(new THREE.Shape(roundedRect(-0.3, -0.085, 0.6, 0.17, 0.085, 10)), {
    depth: 0.09, bevelThickness: 0.035, bevelSize: 0.035, bevelOffset: -0.035, bevelSegments: 5, curveSegments: 10,
  });
  const grip = new THREE.Mesh(gripGeo, metal);
  grip.position.z = 0.05;
  grip.castShadow = grip.receiveShadow = true;
  const hub = new THREE.Mesh(lathe([[0.062, 0], [0.062, 0.012], [0.05, 0.022], [0, 0.024]], 24), metal);
  hub.position.z = 0.175;
  const hubSlot = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.004), dark);
  hubSlot.position.z = 0.199;
  hubSlot.rotation.z = 0.5;
  rotor.add(dial, knurl, grip, hub, hubSlot);
  group.add(rotor);

  // --- コイン口(右)と「一日一回」のプレート(左)
  add(new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.38, 0.03, 2, 0.012), metal), 0.775, hy, front + 0.012);
  add(new THREE.Mesh(new RoundedBoxGeometry(0.036, 0.2, 0.01, 2, 0.004), dark), 0.775, hy, front + 0.024);
  add(new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.38, 0.02, 2, 0.008), metal), -0.775, hy, front + 0.008);
  const label = new THREE.Mesh(
    new THREE.PlaneGeometry(0.18, 0.36),
    new THREE.MeshPhysicalMaterial({ map: ruleLabel(), roughness: 0.35, clearcoat: 1, clearcoatRoughness: 0.25 }),
  );
  label.position.set(-0.775, hy, front + 0.019);
  group.add(label);

  // --- ネジ
  const screws: [number, number, number, number][] = [
    // x, y, z, 大きさ
    [-0.9, 0.44, front, 1], [0.9, 0.44, front, 1], [-0.9, 1.93, front, 1], [0.9, 1.93, front, 1],
    [0.775, hy + 0.15, front + 0.027, 0.62], [0.775, hy - 0.15, front + 0.027, 0.62],
    [-0.325, EXIT_Y + 0.255, front + 0.07, 0.62], [0.325, EXIT_Y + 0.255, front + 0.07, 0.62],
    [-0.325, EXIT_Y - 0.255, front + 0.07, 0.62], [0.325, EXIT_Y - 0.255, front + 0.07, 0.62],
  ];
  const heads = new THREE.InstancedMesh(lathe([[0.036, 0], [0.036, 0.008], [0.027, 0.018], [0, 0.02]], 16), metal, screws.length);
  const slots = new THREE.InstancedMesh(new THREE.BoxGeometry(0.052, 0.009, 0.006), dark, screws.length);
  const q = new THREE.Quaternion();
  const zAxis = new THREE.Vector3(0, 0, 1);
  const spin = rng(5);
  screws.forEach(([x, y, z, s], i) => {
    q.setFromAxisAngle(zAxis, spin() * Math.PI);
    heads.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z), q, new THREE.Vector3(s, s, s)));
    slots.setMatrixAt(i, m4.compose(new THREE.Vector3(x, y, z + 0.018 * s), q, new THREE.Vector3(s, s, s)));
  });
  heads.castShadow = true;
  group.add(heads, slots);

  // --- ケース: 台座 + 床 + 4本の柱 + 上枠 + ガラス板
  add(new THREE.Mesh(new RoundedBoxGeometry(1.62, 0.12, 1.32, 3, 0.03), metal), 0, 2.135);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.36, 0.02, 1.06), darkMetal), 0, CASE_FLOOR - 0.01);
  const top = 3.44;
  const paneH = top - CASE_FLOOR;
  const paneY = CASE_FLOOR + paneH / 2;
  for (const x of [-0.7, 0.7]) for (const z of [-0.55, 0.55]) add(new THREE.Mesh(new THREE.BoxGeometry(0.055, paneH, 0.055), metal), x, paneY, z);
  add(new THREE.Mesh(new RoundedBoxGeometry(1.54, 0.07, 1.24, 3, 0.02), metal), 0, top + 0.02);
  const glass = new THREE.MeshPhysicalMaterial({
    color: "#9fdcd2", roughness: 0.22, roughnessMap: agedGlass(), transparent: true, opacity: 0.17,
    clearcoat: 1, envMapIntensity: 2, depthWrite: false,
  });
  const pane = (w: number, d: number, x: number, z: number) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, paneH, d), glass);
    mesh.position.set(x, paneY, z);
    mesh.renderOrder = 2;
    group.add(mesh);
  };
  pane(1.35, 0.022, 0, 0.55);
  pane(1.35, 0.022, 0, -0.55);
  pane(0.022, 1.05, -0.7, 0);
  pane(0.022, 1.05, 0.7, 0);
  const glare = new THREE.Mesh(
    new THREE.PlaneGeometry(1.35, paneH),
    new THREE.MeshBasicMaterial({
      map: glassGlare(), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  glare.position.set(0, paneY, 0.563);
  glare.renderOrder = 3;
  group.add(glare);

  // --- フタ: 胴体と同じ塗装の2段 + 鍵
  add(new THREE.Mesh(projectUV(new RoundedBoxGeometry(1.7, 0.2, 1.38, 4, 0.05), 0.45), red), 0, 3.57);
  add(new THREE.Mesh(projectUV(new RoundedBoxGeometry(1.42, 0.14, 1.1, 4, 0.05), 0.45), red), 0, 3.72);
  add(new THREE.Mesh(lathe([[0.062, 0], [0.062, 0.014], [0.05, 0.024], [0, 0.024]], 24), metal), 0, 3.57, 0.69);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.05, 0.006), dark), 0, 3.57, 0.714);

  // --- ケースの中のカプセル
  const kiras = [1, 2, 1, 1, 3, 1, 2, 1, 4, 1, 1, 2, 3, 1, 1, 2, 1, 4];
  const turn = rng(41);
  const pile = packPile(kiras.length).map((p, i) => {
    const c = makeCapsule(p.r, kiras[i]);
    c.position.set(p.x, p.y, p.z);
    c.rotation.set(turn() * 6.28, turn() * 6.28, turn() * 6.28);
    c.userData.base = c.position.clone();
    group.add(c);
    return c;
  });

  return { group, rotor, flap, pile };
}
