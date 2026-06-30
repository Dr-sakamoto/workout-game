import { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { soundEngine } from "../sounds/soundEngine";

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const [seOn, setSeOn] = useState(soundEngine.seOn);
  const [confirmReset, setConfirmReset] = useState(false);
  const resetAll = useGameStore((s) => s.resetAll);

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
