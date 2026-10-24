import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { agedGlass, agedMetal, agedPaint } from "./aging";
import { sound } from "../lib/sound";

export interface SceneCallbacks {
  /** ハンドルを1周回しきった */
  onTurned: () => void;
  /** 本体(ハンドル以外)をタップした */
  onBodyTap: () => void;
  /** 回せないときにハンドルを触った */
  onLockedHandle: () => void;
  /** 出てきたカプセルを開けた */
  onCapsuleOpened: () => void;
  /** ハンドルの画面上の位置(px)が変わった */
  onHandleMoved?: (x: number, y: number, radius: number) => void;
}

const RED = "#8e1016";
/** 取り出し口の高さ */
const EXIT_Y = 0.735;

const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
};

interface Tween {
  t0: number;
  dur: number;
  fn: (k: number) => void;
  resolve: () => void;
}

// ---------- 背景: 白地にプリズム/ホログラムの雲がランダムに流れる ----------

const BG_VERT = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}`;

const BG_FRAG = /* glsl */ `
precision highp float;
varying vec2 vUv;
uniform float uTime;
uniform vec2 uRes;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}
float fbm(vec2 p) {
  // 細かいディテールを入れず、大きくぼやけた塊だけにする
  float v = 0.0, a = 0.55;
  for (int i = 0; i < 3; i++) { v += a * noise(p); p = p * 1.9 + 17.1; a *= 0.45; }
  return v;
}

void main() {
  vec2 uv = vUv * vec2(uRes.x / uRes.y, 1.0);
  vec2 p = uv * 2.6;
  // 参考動画の0.5倍速くらいで、塊がゆっくり流れながら形を変える
  float t = uTime * 0.2;
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(5.2, -t * 0.8)));
  vec2 r = vec2(fbm(p + 2.0 * q + vec2(1.7, 9.2) + t * 0.6), fbm(p + 2.0 * q + vec2(8.3, 2.8) - t * 0.5));
  float n = fbm(p + 2.0 * r);
  float blob = smoothstep(0.38, 0.8, n);

  // プリズムの色。塊の中で色相がゆっくり回る
  float h = n * 1.8 + r.x * 1.2 + uTime * 0.02;
  vec3 prism = 0.5 + 0.5 * cos(6.2832 * (h + vec3(0.0, 0.33, 0.67)));
  vec3 col = mix(vec3(1.0), mix(vec3(1.0), prism, 0.6), blob * 0.42);
  gl_FragColor = vec4(col, 1.0);
}`;

// ---------- 部品 ----------

function capsuleMaterial(kira: number) {
  switch (kira) {
    case 2:
      return new THREE.MeshPhysicalMaterial({ color: "#d9dde3", metalness: 0.9, roughness: 0.25, clearcoat: 1 });
    case 3:
      return new THREE.MeshPhysicalMaterial({ color: "#e6c27a", metalness: 0.9, roughness: 0.25, clearcoat: 1 });
    case 4:
      return new THREE.MeshPhysicalMaterial({
        color: "#ffffff", roughness: 0.15, iridescence: 1, iridescenceIOR: 2.0,
        iridescenceThicknessRange: [200, 900], clearcoat: 1, metalness: 0.3,
      });
    default:
      return new THREE.MeshPhysicalMaterial({ color: "#f4f4f6", roughness: 0.35, clearcoat: 0.8 });
  }
}

/**
 * 金属の映り込み用のスタジオ。暗い部屋に細長いライトを置いて、
 * 反射にくっきりした明暗(コントラスト)が出るようにする
 */
function studio() {
  const room = new THREE.Scene();
  room.background = new THREE.Color("#18181c");
  const light = (w: number, h: number, x: number, y: number, z: number, ry: number, rx = 0, power = 1) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(power, power, power), side: THREE.DoubleSide }),
    );
    m.position.set(x, y, z);
    m.rotation.set(rx, ry, 0);
    room.add(m);
  };
  light(8, 3, 0, 6, 0, 0, Math.PI / 2, 3); // 天井のソフトボックス
  light(1.2, 7, -5, 2, 2, Math.PI / 2, 0, 4); // 左のストリップ
  light(1.2, 7, 5, 2, -1, -Math.PI / 2, 0, 2.5); // 右のストリップ
  light(16, 5, 0, 1, 7, Math.PI, 0, 1.6); // カメラ側の大きな光。正面を向いた平らな金属が真っ黒にならないように
  return room;
}

/** 上半分=キラ度に応じた質感、下半分=半透明のカプセル */
function makeCapsule(r: number, kira: number) {
  const g = new THREE.Group();
  const top = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), capsuleMaterial(kira));
  const bottom = new THREE.Mesh(
    new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: "#eeeef2", roughness: 0.1, transparent: true, opacity: 0.85, clearcoat: 1 }),
  );
  const seam = new THREE.Mesh(
    new THREE.TorusGeometry(r, r * 0.04, 8, 48),
    new THREE.MeshStandardMaterial({ color: "#e8e8ec", roughness: 0.4 }),
  );
  seam.rotation.x = Math.PI / 2;
  top.castShadow = bottom.castShadow = true;
  g.add(top, bottom, seam);
  g.userData = { top, bottom, seam };
  return g;
}

export class GachaScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  private bgScene = new THREE.Scene();
  private bgCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private bgMat: THREE.ShaderMaterial;
  private clock = new THREE.Clock();
  private tweens: Tween[] = [];
  private raf = 0;
  private ro: ResizeObserver;

  private machine = new THREE.Group();
  private rotor = new THREE.Group();
  private handleHit: THREE.Mesh;
  private handleCenter = new THREE.Vector3(0, 1.57, 0.75);
  private pile: THREE.Group[] = [];
  private capsule?: THREE.Group;
  private bits: { mesh: THREE.Mesh; v: THREE.Vector3 }[] = [];

  private handleEnabled = false;
  private capsuleReady = false;
  private dragging = false;
  private lastAngle = 0;
  private turned = 0;
  private lastTick = 0;
  private down?: { x: number; y: number; t: number; onHandle: boolean };
  private bottomPx = 0;
  private raycaster = new THREE.Raycaster();

  constructor(
    private container: HTMLElement,
    private cb: SceneCallbacks,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.autoClear = false;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.domElement.style.touchAction = "none";
    container.appendChild(this.renderer.domElement);

    this.bgMat = new THREE.ShaderMaterial({
      vertexShader: BG_VERT,
      fragmentShader: BG_FRAG,
      uniforms: { uTime: { value: Math.random() * 100 }, uRes: { value: new THREE.Vector2(1, 1) } },
      depthTest: false,
      depthWrite: false,
    });
    this.bgScene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat));

    this.buildWorld();
    this.buildMachine();
    this.handleHit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.6, 0.6, 0.3, 24),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }),
    );
    this.handleHit.rotation.x = Math.PI / 2;
    this.handleHit.position.copy(this.handleCenter);
    this.machine.add(this.handleHit);

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onDown);
    el.addEventListener("pointermove", this.onMove);
    el.addEventListener("pointerup", this.onUp);
    el.addEventListener("pointercancel", this.onUp);

    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    this.loop();
  }

  // ---------- 構築 ----------

  private buildWorld() {
    const s = this.scene;
    // 金属・ホロのカプセルが映り込むように環境マップを入れる
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    s.environment = pmrem.fromScene(studio(), 0.02).texture;
    pmrem.dispose();
    s.add(new THREE.HemisphereLight("#ffffff", "#e4e4ea", 0.8));
    const key = new THREE.DirectionalLight("#ffffff", 1.5);
    key.position.set(3, 8, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -3;
    key.shadow.radius = 6;
    s.add(key);

    // 背景は白いまま、影だけ落とす
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity: 0.12 }));
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    s.add(this.machine);
  }

  private part(geo: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z = 0) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    this.machine.add(mesh);
    return mesh;
  }

  /** ラフの比率(200px = 1)を少し低めにして組む。使い込まれた赤い胴体とフタ・メタル・青緑のガラス */
  private buildMachine() {
    const paint = agedPaint(RED);
    const red = new THREE.MeshPhysicalMaterial({
      color: "#ffffff", map: paint.map, roughness: 1, roughnessMap: paint.roughnessMap,
      clearcoat: 0.35, clearcoatRoughness: 0.4,
    });
    const steel = agedMetal("#d8dce2");
    const metal = new THREE.MeshStandardMaterial({
      color: "#ffffff", map: steel.map, metalness: 1, roughness: 1, roughnessMap: steel.roughnessMap,
      envMapIntensity: 1.5,
    });

    // 脚
    for (const x of [-0.75, 0.75]) this.part(new RoundedBoxGeometry(0.16, 0.24, 0.3, 3, 0.03), metal, x, 0.12);
    // 胴体
    this.part(new RoundedBoxGeometry(2.09, 1.85, 1.4, 5, 0.1), red, 0, 1.165);

    // ハンドル: メタルの円盤 + 太めのつまみ
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.035, 16, 64), metal);
    ring.position.copy(this.handleCenter).setZ(0.71);
    this.machine.add(ring);
    const disk = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.08, 64), metal);
    disk.rotation.x = Math.PI / 2;
    disk.castShadow = true;
    const grip = new THREE.Mesh(new RoundedBoxGeometry(0.64, 0.2, 0.2, 3, 0.07), metal);
    grip.position.z = 0.11;
    grip.castShadow = true;
    this.rotor.add(disk, grip);
    this.rotor.position.copy(this.handleCenter);
    this.machine.add(this.rotor);

    // 取り出し口: メタルの枠 + 暗い穴
    this.part(new RoundedBoxGeometry(0.7, 0.62, 0.08, 3, 0.03), metal, 0, EXIT_Y, 0.7);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.47), new THREE.MeshBasicMaterial({ color: "#121214" }));
    hole.position.set(0, EXIT_Y, 0.7415);
    this.machine.add(hole);

    // ガラスケース(うっすら青緑) + 台座 + 四隅の柱
    this.part(new RoundedBoxGeometry(1.5, 0.06, 1.2, 3, 0.02), metal, 0, 2.12);
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(1.4, 1.3, 1.1),
      new THREE.MeshPhysicalMaterial({
        color: "#8fd3c8", roughness: 0.35, roughnessMap: agedGlass(), transparent: true, opacity: 0.24,
        clearcoat: 1, envMapIntensity: 1.6, depthWrite: false,
      }),
    );
    glass.position.set(0, 2.8, 0);
    glass.renderOrder = 2;
    this.machine.add(glass);
    for (const [x, z] of [[-0.7, 0.55], [0.7, 0.55], [-0.7, -0.55], [0.7, -0.55]]) {
      this.part(new THREE.CylinderGeometry(0.025, 0.025, 1.3, 12), metal, x, 2.8, z);
    }
    // 胴体と同じ素材の赤いフタ(厚め)
    this.part(new RoundedBoxGeometry(1.64, 0.34, 1.32, 4, 0.06), red, 0, 3.62);

    // ケースの中のカプセル(ラフの丸の配置)
    const spots: [number, number, number, number][] = [
      // x, y, z, r
      [-0.32, 2.37, 0.1, 0.22], [0.08, 2.4, 0.12, 0.25], [0.4, 2.37, -0.05, 0.22],
      [-0.3, 2.73, -0.1, 0.2], [0.12, 2.79, -0.15, 0.2], [0.36, 2.68, 0.1, 0.12], [0.5, 2.66, -0.25, 0.09],
    ];
    spots.forEach(([x, y, z, r], i) => {
      const c = makeCapsule(r, [1, 4, 2, 1, 3, 4, 1][i]);
      c.position.set(x, y, z);
      c.rotation.set(i * 0.5, i * 1.3, i * 0.3);
      c.userData.base = c.position.clone();
      this.pile.push(c);
      this.machine.add(c);
    });
  }

  // ---------- レイアウト ----------

  /** 下からこのピクセル分はカードが置かれる。ガチャはその上に収める */
  setLayout(bottomPx: number) {
    this.bottomPx = bottomPx;
    this.resize();
  }

  private resize() {
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.bgMat.uniforms.uRes.value.set(w, h);
    const topH = Math.max(200, h - this.bottomPx);
    this.camera.aspect = w / topH;
    // 上の領域を基準に画角を決め、下は描画だけ延長する
    this.camera.setViewOffset(w, topH, 0, 0, w, h);
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const distH = (3.9 * 1.15) / 2 / tan;
    const distW = (2.1 * 1.45) / 2 / (tan * this.camera.aspect);
    const dist = Math.max(distH, distW);
    const target = new THREE.Vector3(0, 1.9, 0);
    const dir = new THREE.Vector3(0.08, 0.16, 1).normalize();
    this.camera.position.copy(target).addScaledVector(dir, dist);
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    const c = this.handleCenter.clone().project(this.camera);
    const edge = this.handleCenter.clone().add(new THREE.Vector3(0.43, 0, 0)).project(this.camera);
    this.cb.onHandleMoved?.(((c.x + 1) / 2) * w, ((1 - c.y) / 2) * h, ((edge.x - c.x) / 2) * w);
  }

  // ---------- 入力 ----------

  private ndc(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private hit(e: PointerEvent, objects: THREE.Object3D[]) {
    this.raycaster.setFromCamera(this.ndc(e), this.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  private screenAngle(e: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    const p = this.handleCenter.clone().project(this.camera);
    const cx = r.left + ((p.x + 1) / 2) * r.width;
    const cy = r.top + ((1 - p.y) / 2) * r.height;
    return Math.atan2(e.clientY - cy, e.clientX - cx);
  }

  private onDown = (e: PointerEvent) => {
    if (this.capsuleReady) {
      void this.openCapsule();
      return;
    }
    const onHandle = this.hit(e, [this.handleHit]).length > 0;
    this.down = { x: e.clientX, y: e.clientY, t: performance.now(), onHandle };
    if (onHandle && this.handleEnabled) {
      this.dragging = true;
      this.lastAngle = this.screenAngle(e);
      this.renderer.domElement.setPointerCapture(e.pointerId);
    }
  };

  private onMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    const a = this.screenAngle(e);
    let d = a - this.lastAngle;
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    this.lastAngle = a;
    // 画面上で時計回り(y が下向きなので角度が増える向き)だけ進む。逆回しは戻らない
    this.turned = Math.max(this.turned, Math.min(Math.PI * 2, this.turned + d));
    this.rotor.rotation.z = -this.turned;
    const step = Math.floor(this.turned / (Math.PI / 4));
    if (step > this.lastTick) {
      this.lastTick = step;
      sound.tick();
      this.jigglePile(0.03);
    }
    if (this.turned >= Math.PI * 2) {
      this.dragging = false;
      this.handleEnabled = false;
      this.cb.onTurned();
    }
  };

  private onUp = (e: PointerEvent) => {
    const d = this.down;
    this.down = undefined;
    if (this.dragging) {
      this.dragging = false;
      return;
    }
    if (!d) return;
    const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y);
    if (moved > 10 || performance.now() - d.t > 600) return;
    if (d.onHandle) {
      if (!this.handleEnabled) {
        this.cb.onLockedHandle();
        this.wiggleRotor();
      }
      return;
    }
    if (this.hit(e, [this.machine]).length > 0) this.cb.onBodyTap();
  };

  // ---------- 演出 ----------

  private tween(dur: number, fn: (k: number) => void) {
    return new Promise<void>((resolve) => {
      this.tweens.push({ t0: this.clock.elapsedTime, dur, fn, resolve });
    });
  }

  private jigglePile(amount: number) {
    for (const c of this.pile) {
      c.position.y = c.userData.base.y + Math.random() * amount * 2;
      c.rotation.z += (Math.random() - 0.5) * amount * 6;
    }
  }

  private wiggleRotor() {
    void this.tween(0.35, (k) => {
      this.rotor.rotation.z = -this.turned + Math.sin(k * Math.PI * 4) * 0.15 * (1 - k);
    });
  }

  setHandleEnabled(enabled: boolean) {
    this.handleEnabled = enabled;
    if (enabled) {
      this.turned = 0;
      this.lastTick = 0;
      this.rotor.rotation.z = 0;
    }
  }

  /** カプセルを出す。着地したら解決する(開けるのはタップ)。kira でカプセルの質感が変わる */
  async dropCapsule(kira: number) {
    // 本体がガタッと揺れる
    await this.tween(0.45, (k) => {
      this.machine.rotation.z = Math.sin(k * Math.PI * 6) * 0.02 * (1 - k);
      this.jigglePile(0.05 * (1 - k));
    });
    this.machine.rotation.z = 0;

    const r = 0.26;
    const cap = makeCapsule(r, kira);
    cap.position.set(0, EXIT_Y, 0.5);
    cap.scale.setScalar(0.8);
    this.scene.add(cap);
    this.capsule = cap;
    sound.drop();

    // 取り出し口から出る
    await this.tween(0.3, (k) => {
      cap.position.z = 0.5 + 0.6 * ease.outCubic(k);
    });
    // 床に落ちて、手前に転がってくる
    const landY = r * 1.6;
    await this.tween(1.0, (k) => {
      const z = 1.1 + 1.1 * ease.outCubic(k);
      const s = 0.8 + 0.8 * ease.outCubic(k);
      const b = k < 0.45 ? 1 - Math.pow(k / 0.45, 2) : k < 0.8 ? Math.sin(((k - 0.45) / 0.35) * Math.PI) * 0.3 : 0;
      cap.position.set(0, landY + (EXIT_Y - landY) * Math.max(0, b), z);
      cap.scale.setScalar(s);
      cap.rotation.x = k * Math.PI * 3;
      if (Math.abs(k - 0.45) < 0.02) sound.drop();
    });
    cap.rotation.set(0.25, 0, 0);
    this.capsuleReady = true;
  }

  private async openCapsule() {
    const cap = this.capsule;
    if (!cap || !this.capsuleReady) return;
    this.capsuleReady = false;
    sound.pop();
    const { top, bottom, seam } = cap.userData as Record<string, THREE.Mesh>;
    // 虹色のかけらを飛ばす
    for (let i = 0; i < 26; i++) {
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.05 + Math.random() * 0.05),
        new THREE.MeshBasicMaterial({ color: new THREE.Color().setHSL(i / 26, 0.7, 0.75), transparent: true }),
      );
      mesh.position.copy(cap.position);
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * 2.5, 2 + Math.random() * 3, Math.sin(a) * 1.5 + 0.5);
      this.scene.add(mesh);
      this.bits.push({ mesh, v });
    }
    await this.tween(0.7, (k) => {
      top.position.y = k * 1.6;
      top.rotation.x = -k * 2.5;
      seam.position.y = k * 0.6;
      bottom.scale.setScalar(1 - k);
      seam.scale.setScalar(1 - k);
      top.scale.setScalar(1 - k * 0.6);
    });
    this.scene.remove(cap);
    this.capsule = undefined;
    this.cb.onCapsuleOpened();
  }

  /** 上納を受け取ったときの演出 */
  receiveTribute() {
    void this.tween(0.9, (k) => {
      this.machine.position.y = Math.sin(k * Math.PI) * 0.15;
      this.machine.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.03);
    });
  }

  // ---------- ループ ----------

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;
    this.bgMat.uniforms.uTime.value += dt;

    this.tweens = this.tweens.filter((tw) => {
      const k = Math.min(1, (t - tw.t0) / tw.dur);
      tw.fn(k);
      if (k >= 1) tw.resolve();
      return k < 1;
    });

    if (this.capsuleReady && this.capsule) {
      // 開けてほしそうに揺れる
      this.capsule.rotation.z = Math.sin(t * 6) * 0.15;
      this.capsule.position.y = 0.42 + Math.abs(Math.sin(t * 3)) * 0.08;
    }
    this.bits = this.bits.filter((b) => {
      b.v.y -= 9 * dt;
      b.mesh.position.addScaledVector(b.v, dt);
      b.mesh.rotation.x += dt * 8;
      const mat = b.mesh.material as THREE.MeshBasicMaterial;
      mat.opacity -= dt * 0.9;
      if (mat.opacity <= 0) {
        this.scene.remove(b.mesh);
        return false;
      }
      return true;
    });

    this.renderer.clear();
    this.renderer.render(this.bgScene, this.bgCamera);
    this.renderer.render(this.scene, this.camera);
  };

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onDown);
    el.removeEventListener("pointermove", this.onMove);
    el.removeEventListener("pointerup", this.onUp);
    el.removeEventListener("pointercancel", this.onUp);
    this.renderer.dispose();
    el.remove();
  }
}
