import { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { soundEngine } from "../sounds/soundEngine";
import { SCHEDULE_PRESETS, effectiveSchedule } from "../domain/schedule";

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const [seOn, setSeOn] = useState(soundEngine.seOn);
  const [confirmReset, setConfirmReset] = useState(false);
  const resetAll = useGameStore((s) => s.resetAll);
  const profile = useGameStore((s) => s.profile);
  const changeSchedule = useGameStore((s) => s.changeSchedule);
  const currentDays = effectiveSchedule(profile?.trainingDays);
  const currentId =
    SCHEDULE_PRESETS.find((s) => s.days.join(",") === [...currentDays].sort((a, b) => a - b).join(","))?.id ?? "";

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title">⚙ 設定</span>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">サウンド</div>
          <label className="settings-row">
            <span>SE（効果音）</span>
            <span className="toggle-switch">
              <input
                type="checkbox"
                checked={seOn}
                onChange={(e) => {
                  soundEngine.setSEOn(e.target.checked);
                  setSeOn(e.target.checked);
                  if (e.target.checked) soundEngine.play("click");
                }}
              />
              <span className="toggle-track" />
            </span>
          </label>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">トレーニングの頻度</div>
          <p className="hint" style={{ marginBottom: 8 }}>
            予定日にトレするとストリークが伸びる。基本は据え置きでコツコツと。
          </p>
          <div className="sched-grid">
            {SCHEDULE_PRESETS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`sched-card ${currentId === s.id ? "active" : ""}`}
                onClick={() => { changeSchedule(s.days); soundEngine.play("select"); }}
              >
                <span className="sched-emoji">{s.emoji}</span>
                <span className="sched-label">{s.label}</span>
                <span className="sched-desc">{s.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">データ</div>
          {!confirmReset ? (
            <button className="btn full secondary" onClick={() => setConfirmReset(true)}>
              データをリセット
            </button>
          ) : (
            <>
              <p className="hint" style={{ marginBottom: 10 }}>
                本当にリセットしますか？<br />全データが消えます。
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn full"
                  style={{ background: "var(--red)", borderColor: "#800", color: "#fff" }}
                  onClick={() => { resetAll(); onClose(); }}
                >
                  リセット
                </button>
                <button className="btn full secondary" onClick={() => setConfirmReset(false)}>
                  やめる
                </button>
              </div>
            </>
          )}
        </div>

        <div className="settings-section">
          <div className="settings-section-title">アプリ情報</div>
          <div className="settings-info-row">
            <span>バージョン</span>
            <span style={{ color: "var(--muted)" }}>1.0.0</span>
          </div>
          <div className="settings-info-row">
            <span>データ保存</span>
            <span style={{ color: "var(--muted)", fontSize: 8 }}>端末内（ローカル）</span>
          </div>
        </div>

        <button className="btn full secondary" style={{ marginTop: 8 }} onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
