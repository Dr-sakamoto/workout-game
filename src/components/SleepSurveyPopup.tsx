import { useState } from "react";
import { useGameStore } from "../store/useGameStore";
import { SLEEP_OPTIONS } from "../domain/sleep";
import type { SleepQuality } from "../domain/types";

export function SleepSurveyPopup({ onClose }: { onClose: () => void }) {
  const [selected, setSelected] = useState<SleepQuality | null>(null);
  const logSleep = useGameStore((s) => s.logSleep);

  const handleSubmit = () => {
    if (!selected) return;
    logSleep(selected);
    onClose();
  };

  return (
    <div className="toast-overlay">
      <div className="toast sleep-survey-popup">
        <div className="sleep-survey-title">💤 昨夜の睡眠は？</div>
        <div className="hint" style={{ marginBottom: 16 }}>
          睡眠を記録してトレーニングEXPを最大化！
        </div>
        <div className="sleep-btns" style={{ marginBottom: 20 }}>
          {SLEEP_OPTIONS.map((opt) => (
            <button
              key={opt.quality}
              className={`sleep-btn${selected === opt.quality ? " selected" : ""}`}
              onClick={() => setSelected(opt.quality)}
            >
              <span className="sleep-btn-ico">{opt.emoji}</span>
              <span className="sleep-btn-label">{opt.label}</span>
              <span className="sleep-btn-sub">{opt.subLabel}</span>
            </button>
          ))}
        </div>
        <button
          className="btn full"
          disabled={!selected}
          onClick={handleSubmit}
          style={{ marginBottom: 8 }}
        >
          記録する
        </button>
        <button className="btn full secondary" onClick={onClose}>
          あとで
        </button>
      </div>
    </div>
  );
}
