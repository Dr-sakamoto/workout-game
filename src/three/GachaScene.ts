import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
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

/** カプセルの色。カードの中で一番キラなステッカーで決まる */
const CAPSULE_COLORS: Record<number, string> = { 1: "#ff6b6b", 2: "#62b6ff", 3: "#ffc93c", 4: "#ff8de1" };
const PILE_COLORS = ["#ff6b6b", "#62b6ff", "#ffc93c", "#7ad08f", "#b48cff", "#ff9f5a"];

const ease = {
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2),
};

interface Tween {
  t0: number;
  dur: number;
  fn: (k: number) => void;
  resolve: () => void;
}

function rbox(w: number, h: number, d: number, color: string, r = 0.08) {
  const m = new THREE.Mesh(
    new RoundedBoxGeometry(w, h, d, 4, r),
    new THREE.MeshStandardMaterial({ color, roughness: 0.45 }),
  );
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function textTexture(draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, w: number, h: number) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

const FONT = `"Hiragino Sans", "Noto Sans JP", "Yu Gothic", sans-serif`;

function makeCapsule(color: string, r: number) {
  const g = new THREE.Group();
  const topMat =
    color === CAPSULE_COLORS[4]
      ? new THREE.MeshPhysicalMaterial({ color, roughness: 0.15, iridescence: 1, iridescenceIOR: 1.8, clearcoat: 1 })
      : new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, clearcoat: 0.8 });
  const top = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), topMat);
  const bottom = new THREE.Mesh(
    new THREE.SphereGeometry(r, 32, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2),
    new THREE.MeshPhysicalMaterial({ color: "#ffffff", roughness: 0.2, transparent: true, opacity: 0.85, clearcoat: 0.6 }),
  );
  const band = new THREE.Mesh(
    new THREE.TorusGeometry(r * 1.0, r * 0.06, 8, 32),
    new THREE.MeshStandardMaterial({ color: "#eeeeee", roughness: 0.4 }),
  );
  band.rotation.x = Math.PI / 2;
  for (const m of [top, bottom, band]) {
    m.castShadow = true;
    g.add(m);
  }
  g.userData = { top, bottom, band };
  return g;
}

export class GachaScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
  private clock = new THREE.Clock();
  private tweens: Tween[] = [];
  private raf = 0;
  private ro: ResizeObserver;

  private machine = new THREE.Group();
  private rotor = new THREE.Group();
  private handleHit: THREE.Mesh;
  private handleCenter = new THREE.Vector3(0, 1.42, 0.78);
  private signMat!: THREE.MeshBasicMaterial;
  private pile: THREE.Group[] = [];
  private floaters: THREE.Group[] = [];
  private capsule?: THREE.Group;
  private capsuleLight?: THREE.PointLight;
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
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.domElement.style.touchAction = "none";
    container.appendChild(this.renderer.domElement);

    this.buildWorld();
    this.buildMachine();
    this.handleHit = new THREE.Mesh(
      new THREE.CylinderGeometry(0.66, 0.66, 0.3, 24),
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
    s.fog = new THREE.Fog("#2a2140", 14, 30);

    s.add(new THREE.HemisphereLight("#ffe9f2", "#3a2f55", 1.1));
    const key = new THREE.DirectionalLight("#fff4e0", 2.2);
    key.position.set(4, 9, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = -5;
    key.shadow.camera.right = 5;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -3;
    key.shadow.radius = 4;
    s.add(key);
    const rim = new THREE.DirectionalLight("#9ec5ff", 0.8);
    rim.position.set(-6, 5, -4);
    s.add(rim);

    const floor = new THREE.Mesh(
      new THREE.CircleGeometry(30, 64),
      new THREE.MeshStandardMaterial({ color: "#4a3d6b", roughness: 0.9 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    s.add(floor);
    // 足元のスポット
    const spot = new THREE.Mesh(
      new THREE.CircleGeometry(2.6, 48),
      new THREE.MeshStandardMaterial({ color: "#6b5a96", roughness: 0.8 }),
    );
    spot.rotation.x = -Math.PI / 2;
    spot.position.y = 0.005;
    spot.receiveShadow = true;
    s.add(spot);

    // 遠くに浮かぶカプセル
    for (let i = 0; i < 9; i++) {
      const c = makeCapsule(PILE_COLORS[i % PILE_COLORS.length], 0.35 + (i % 3) * 0.12);
      const a = (i / 9) * Math.PI * 2;
      c.position.set(Math.cos(a) * (7 + (i % 3)), 2 + ((i * 1.7) % 4), -4 - Math.abs(Math.sin(a)) * 6);
      c.rotation.set(i, i * 2, 0);
      c.userData.phase = i;
      this.floaters.push(c);
      s.add(c);
    }
    s.add(this.machine);
  }

  private buildMachine() {
    const m = this.machine;
    const RED = "#e8463f";
    const CREAM = "#fff3dc";
    const YELLOW = "#ffd23f";

    // 脚
    for (const x of [-0.72, 0.72]) {
      const f = rbox(0.22, 0.16, 0.22, "#3b3b46", 0.04);
      f.position.set(x, 0.08, 0);
      m.add(f);
    }
    // 胴体
    const body = rbox(2.0, 1.9, 1.5, RED, 0.12);
    body.position.set(0, 1.1, 0);
    m.add(body);

    // ハンドル(固定リング + 回る部分)
    const ring = new THREE.Mesh(
      new THREE.CylinderGeometry(0.52, 0.52, 0.06, 48),
      new THREE.MeshStandardMaterial({ color: "#d9dce3", metalness: 0.8, roughness: 0.25 }),
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.copy(this.handleCenter).setZ(0.76);
    m.add(ring);
    const disk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.44, 0.44, 0.1, 48),
      new THREE.MeshStandardMaterial({ color: "#ffffff", roughness: 0.35 }),
    );
    disk.rotation.x = Math.PI / 2;
    disk.castShadow = true;
    const bar = rbox(0.8, 0.18, 0.2, YELLOW, 0.07);
    bar.position.z = 0.1;
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.1, 24, 12),
      new THREE.MeshStandardMaterial({ color: RED, roughness: 0.3 }),
    );
    cap.position.z = 0.2;
    // 回転方向がわかる目印
    const dot = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.04, 16),
      new THREE.MeshStandardMaterial({ color: RED }),
    );
    dot.rotation.x = Math.PI / 2;
    dot.position.set(0.3, 0, 0.21);
    this.rotor.add(disk, bar, cap, dot);
    this.rotor.position.copy(this.handleCenter);
    m.add(this.rotor);

    // 取り出し口
    const frame = rbox(0.7, 0.56, 0.12, "#d9dce3", 0.06);
    (frame.material as THREE.MeshStandardMaterial).metalness = 0.6;
    frame.position.set(0, 0.6, 0.74);
    m.add(frame);
    const hole = new THREE.Mesh(
      new THREE.PlaneGeometry(0.54, 0.4),
      new THREE.MeshStandardMaterial({ color: "#16121f", roughness: 1 }),
    );
    hole.position.set(0, 0.6, 0.805);
    m.add(hole);

    // ガラスケースの台座
    const deck = rbox(1.6, 0.08, 1.15, CREAM, 0.03);
    deck.position.set(0, 2.09, 0);
    m.add(deck);
    // ガラスケース
    const glass = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 1.45, 1.0),
      new THREE.MeshPhysicalMaterial({
        color: "#e8f4ff",
        roughness: 0.05,
        transparent: true,
        opacity: 0.18,
        clearcoat: 1,
        depthWrite: false,
      }),
    );
    glass.position.set(0, 2.85, 0);
    glass.renderOrder = 2;
    m.add(glass);
    for (const [x, z] of [[-0.65, 0.5], [0.65, 0.5], [-0.65, -0.5], [0.65, -0.5]]) {
      const p = rbox(0.06, 1.45, 0.06, CREAM, 0.02);
      p.position.set(x, 2.85, z);
      m.add(p);
    }
    // ケースの中のカプセル
    const spots = [
      [-0.38, -0.2], [0, -0.22], [0.38, -0.2], [-0.4, 0.2], [0.02, 0.18], [0.38, 0.22],
      [-0.2, 0], [0.2, 0.02], [-0.05, -0.05], [0.25, -0.15],
    ];
    spots.forEach(([x, z], i) => {
      const r = 0.19 + (i % 3) * 0.02;
      const c = makeCapsule(PILE_COLORS[i % PILE_COLORS.length], r);
      const y = 2.13 + r + (i >= 6 ? 0.3 : 0) + (i >= 8 ? 0.2 : 0);
      c.position.set(x, y, z);
      c.rotation.set(i * 0.9, i * 1.3, i * 0.4);
      c.userData.base = c.position.clone();
      c.userData.phase = i;
      this.pile.push(c);
      m.add(c);
    });
    // ガラスに貼られたラベル
    const label = new THREE.Mesh(
      new THREE.PlaneGeometry(0.6, 0.16),
      new THREE.MeshBasicMaterial({
        map: textTexture((g, w, h) => {
          g.fillStyle = "#ffffff";
          g.fillRect(0, 0, w, h);
          g.fillStyle = RED;
          g.font = `bold ${h * 0.62}px ${FONT}`;
          g.textAlign = "center";
          g.textBaseline = "middle";
          g.fillText("1日1回", w / 2, h / 2 + 2);
        }, 480, 128),
        toneMapped: false,
      }),
    );
    label.position.set(0, 3.28, 0.505);
    m.add(label);

    // 左右のパネル
    const left = rbox(0.36, 1.0, 0.9, CREAM, 0.06);
    left.position.set(-0.86, 2.6, 0);
    const right = rbox(0.36, 1.22, 0.9, CREAM, 0.06);
    right.position.set(0.86, 2.71, 0);
    m.add(left, right);
    const stripe = (h: number) =>
      textTexture((g, w, hh) => {
        g.fillStyle = YELLOW;
        g.fillRect(0, 0, w, hh);
        g.fillStyle = RED;
        for (let y = -w; y < hh; y += 48) {
          g.beginPath();
          g.moveTo(0, y);
          g.lineTo(w, y + w);
          g.lineTo(w, y + w + 22);
          g.lineTo(0, y + 22);
          g.fill();
        }
      }, 128, Math.round(128 * h * 3));
    for (const [panel, h] of [[left, 1.0], [right, 1.22]] as const) {
      const face = new THREE.Mesh(
        new THREE.PlaneGeometry(0.26, h - 0.14),
        new THREE.MeshStandardMaterial({ map: stripe(h), roughness: 0.6 }),
      );
      face.position.set(panel.position.x, panel.position.y, 0.452);
      m.add(face);
    }

    // 帯
    const band = rbox(2.2, 0.38, 1.25, CREAM, 0.08);
    band.position.set(0, 3.76, 0);
    m.add(band);
    // 看板
    const sign = rbox(2.5, 0.85, 0.36, RED, 0.12);
    sign.position.set(0, 4.38, 0.1);
    m.add(sign);
    this.signMat = new THREE.MeshBasicMaterial({
      map: textTexture((g, w, h) => {
        g.fillStyle = YELLOW;
        g.beginPath();
        g.roundRect(0, 0, w, h, 40);
        g.fill();
        // 電球
        g.fillStyle = "#ffffff";
        for (let x = 30; x < w; x += 60) {
          for (const y of [24, h - 24]) {
            g.beginPath();
            g.arc(x, y, 10, 0, Math.PI * 2);
            g.fill();
          }
        }
        g.font = `900 ${h * 0.5}px ${FONT}`;
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.lineWidth = 22;
        g.strokeStyle = "#ffffff";
        g.strokeText("行動ガチャ", w / 2, h / 2 + 6);
        g.fillStyle = RED;
        g.fillText("行動ガチャ", w / 2, h / 2 + 6);
      }, 1024, 340),
      toneMapped: false,
    });
    const signFace = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 0.72), this.signMat);
    signFace.position.set(0, 4.38, 0.285);
    m.add(signFace);
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
    const topH = Math.max(200, h - this.bottomPx);
    this.camera.aspect = w / topH;
    // 上の領域を基準に画角を決め、下は描画だけ延長する
    this.camera.setViewOffset(w, topH, 0, 0, w, h);
    const tan = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2));
    const distH = (5.0 * 1.08) / 2 / tan;
    const distW = (2.6 * 1.3) / 2 / (tan * this.camera.aspect);
    const dist = Math.max(distH, distW);
    const target = new THREE.Vector3(0, 2.45, 0);
    const dir = new THREE.Vector3(0, 0.18, 1).normalize();
    this.camera.position.copy(target).addScaledVector(dir, dist);
    this.camera.lookAt(target);
    this.camera.updateProjectionMatrix();
    this.camera.updateMatrixWorld();

    const c = this.handleCenter.clone().project(this.camera);
    const edge = this.handleCenter.clone().setX(0.52).project(this.camera);
    const x = ((c.x + 1) / 2) * w;
    const y = ((1 - c.y) / 2) * h;
    this.cb.onHandleMoved?.(x, y, ((edge.x - c.x) / 2) * w);
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
      this.openCapsule();
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

  /** カプセルを出す。着地したら解決する(開けるのはタップ) */
  async dropCapsule(kira: number) {
    const color = CAPSULE_COLORS[kira] ?? CAPSULE_COLORS[1];
    // 本体がガタッと揺れる
    await this.tween(0.45, (k) => {
      this.machine.rotation.z = Math.sin(k * Math.PI * 6) * 0.02 * (1 - k);
      this.jigglePile(0.05 * (1 - k));
    });
    this.machine.rotation.z = 0;

    const r = 0.3;
    const cap = makeCapsule(color, r);
    cap.position.set(0, 0.6, 0.5);
    cap.scale.setScalar(0.7);
    this.scene.add(cap);
    this.capsule = cap;
    sound.drop();

    // 取り出し口から出る
    await this.tween(0.3, (k) => {
      cap.position.z = 0.5 + 0.6 * ease.outCubic(k);
    });
    // 床に落ちて、手前に転がってくる
    const landY = r * 1.5;
    await this.tween(1.0, (k) => {
      const z = 1.1 + 1.1 * ease.outCubic(k);
      const s = 0.7 + 0.8 * ease.outCubic(k);
      // 2回バウンド
      const b = k < 0.45 ? 1 - Math.pow(k / 0.45, 2) : k < 0.8 ? Math.sin(((k - 0.45) / 0.35) * Math.PI) * 0.3 : 0;
      cap.position.set(0, landY + (0.6 - landY) * Math.max(0, b), z);
      cap.scale.setScalar(s);
      cap.rotation.x = k * Math.PI * 3;
      if (Math.abs(k - 0.45) < 0.02) sound.drop();
    });
    cap.rotation.set(0.25, 0, 0);
    const light = new THREE.PointLight(color, 3, 4);
    light.position.set(0, 1, 2.6);
    this.scene.add(light);
    this.capsuleLight = light;
    this.capsuleReady = true;
  }

  private async openCapsule() {
    const cap = this.capsule;
    if (!cap || !this.capsuleReady) return;
    this.capsuleReady = false;
    sound.pop();
    const { top, bottom, band } = cap.userData as Record<string, THREE.Mesh>;
    // かけらを飛ばす
    const colors = ["#ffffff", "#ffd23f", "#ff8de1", "#62b6ff"];
    for (let i = 0; i < 28; i++) {
      const mesh = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.06 + Math.random() * 0.05),
        new THREE.MeshBasicMaterial({ color: colors[i % colors.length], transparent: true }),
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
      band.position.y = k * 0.6;
      bottom.scale.setScalar(1 - k);
      band.scale.setScalar(1 - k);
      top.scale.setScalar(1 - k * 0.6);
      if (this.capsuleLight) this.capsuleLight.intensity = 3 + Math.sin(k * Math.PI) * 12;
    });
    this.scene.remove(cap);
    if (this.capsuleLight) this.scene.remove(this.capsuleLight);
    this.capsule = undefined;
    this.capsuleLight = undefined;
    this.cb.onCapsuleOpened();
  }

  /** 上納を受け取ったときの演出 */
  receiveTribute() {
    void this.tween(0.9, (k) => {
      this.signMat.color.setScalar(1 + Math.sin(k * Math.PI) * 0.6);
      this.machine.position.y = Math.sin(k * Math.PI) * 0.15;
      this.machine.scale.setScalar(1 + Math.sin(k * Math.PI) * 0.03);
    });
  }

  // ---------- ループ ----------

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    const t = this.clock.elapsedTime;

    this.tweens = this.tweens.filter((tw) => {
      const k = Math.min(1, (t - tw.t0) / tw.dur);
      tw.fn(k);
      if (k >= 1) tw.resolve();
      return k < 1;
    });

    for (const f of this.floaters) {
      f.rotation.y += dt * 0.3;
      f.position.y += Math.sin(t + f.userData.phase) * dt * 0.15;
    }
    if (this.capsuleReady && this.capsule) {
      // 開けてほしそうに揺れる
      this.capsule.rotation.z = Math.sin(t * 6) * 0.15;
      this.capsule.position.y = 0.45 + Math.abs(Math.sin(t * 3)) * 0.08;
      if (this.capsuleLight) this.capsuleLight.intensity = 3 + Math.sin(t * 4) * 1.5;
    }
    for (const c of this.capsule ? [this.capsule] : []) {
      const top = c.userData.top as THREE.Mesh;
      const mat = top.material as THREE.MeshPhysicalMaterial;
      if (mat.iridescence) mat.color.setHSL((t * 0.15) % 1, 0.8, 0.7);
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
    if (!this.tweens.length) this.signMat.color.setScalar(0.95 + Math.sin(t * 2) * 0.05);

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
