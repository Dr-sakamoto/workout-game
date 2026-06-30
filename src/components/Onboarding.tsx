import { useMemo, useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { computeBmi, bodyTypeLabel } from "../domain/physique";
import { computeBuild } from "../domain/build";
import type { Goal } from "../domain/types";
import { PixelAvatar } from "./PixelAvatar";

export function Onboarding() {
  const initProfile = useGameStore((s) => s.initProfile);
  const [name, setName] = useState("");
  const [height, setHeight] = useState("172");
  const [weight, setWeight] = useState("65");
  const [goal, setGoal] = useState<Goal>("bulk");

  const h = Number(height) || 0;
  const w = Number(weight) || 0;
  const bmi = Math.round(computeBmi(h, w) * 10) / 10;

  // 入力に応じてアバターの体格がリアルタイムに変化(身長＋体重で見た目決定)
  const build = useMemo(() => computeBuild(h, w, undefined, "front"), [h, w]);

  const valid = name.trim().length > 0 && h >= 120 && h <= 230 && w >= 30 && w <= 200;

  return (
    <div className="app">
      <div className="topbar">
        <span className="title">▸ 筋トレクエスト</span>
        <span>NEW GAME</span>
      </div>
      <div className="screen">
        <div className="panel">
          <h2>キャラメイク</h2>
          <p className="hint">
            身長と体重から、キミの分身(ボクサー)の体格が決まる。<br />
            ここからトレーニングで鍛え上げていけ。
          </p>

          <div className="avatar-stage" style={{ margin: "14px 0" }}>
            <PixelAvatar build={build} size={170} />
            <div className="avatar-meta">
              BMI {bmi || "--"} ／ {h > 0 && w > 0 ? bodyTypeLabel(bmi) : "--"}
            </div>
          </div>

          <label>名前</label>
          <input
            value={name}
            maxLength={12}
            placeholder="例: ロッキー"
            onChange={(e) => setName(e.target.value)}
          />

          <div className="inline-inputs" style={{ gap: 12 }}>
            <div style={{ flex: 1 }}>
              <label>身長 (cm)</label>
              <input
                type="number"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label>体重 (kg)</label>
              <input
                type="number"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
            </div>
          </div>

          <label>目標</label>
          <select value={goal} onChange={(e) => setGoal(e.target.value as Goal)}>
            <option value="bulk">増量(バルクアップ)</option>
            <option value="cut">減量(カット)</option>
            <option value="keep">維持</option>
          </select>

          <button
            className="btn green full"
            style={{ marginTop: 18 }}
            disabled={!valid}
            onClick={() =>
              initProfile({ name: name.trim(), heightCm: h, weightKg: w, goal })
            }
          >
            ▶ 冒険を始める
          </button>
        </div>
      </div>
    </div>
  );
}
