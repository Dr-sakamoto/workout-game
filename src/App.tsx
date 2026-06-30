import { useState, useEffect, useRef } from "react";
import { useGameStore } from "./store/useGameStore";
import { Onboarding } from "./components/Onboarding";
import { AvatarPanel } from "./components/AvatarPanel";
import { WorkoutScreen } from "./components/WorkoutScreen";
import { MealScreen } from "./components/MealScreen";
import { QuestScreen } from "./components/QuestScreen";
import { BossScreen } from "./components/BossScreen";
import { ShopModal } from "./components/ShopModal";
import { soundEngine } from "./sounds/soundEngine";

type Tab = "home" | "train" | "meal" | "boss" | "quest";

function PenaltyToast() {
  const penalty = useGameStore((s) => s.lastPenalty);
  const clearPenalty = useGameStore((s) => s.clearPenalty);
  const played = useRef(false);

  useEffect(() => {
    if (penalty && !played.current) {
      soundEngine.play("damage");
      played.current = true;
    }
    if (!penalty) played.current = false;
  }, [penalty]);

  if (!penalty) return null;

  const hpPct = Math.min(100, (penalty.newHp / penalty.maxHp) * 100);
  const hpFill = hpPct > 60 ? "fill-hp" : hpPct > 30 ? "fill-hp-warn" : "fill-hp-danger";

  return (
    <div className="toast-overlay" onClick={clearPenalty}>
      <div className="toast toast-penalty" onClick={(e) => e.stopPropagation()}>
        <div className="penalty-header">
          {penalty.bossEmoji} {penalty.bossName}の攻撃！
        </div>
        <div className="penalty-missed">
          {penalty.missedDays === 1 ? "昨日サボった！" : `${penalty.missedDays}日間サボった！`}
        </div>
        <div className="penalty-dmg">
          攻撃力 {penalty.damagePerDay} × {penalty.missedDays}日
        </div>
        <div className="penalty-total">= -{penalty.totalDamage} HP ダメージ</div>
        <div className="penalty-hp-label">残りHP: {penalty.newHp} / {penalty.maxHp}</div>
        <div className="bar" style={{ margin: "6px 0 12px" }}>
          <span className={hpFill} style={{ width: `${hpPct}%` }} />
        </div>
        <div className="hint">トレーニングすればHPが回復する！</div>
        <button className="btn full btn-penalty-ok" style={{ marginTop: 16 }} onClick={clearPenalty}>
          わかった
        </button>
      </div>
    </div>
  );
}

function RewardToast() {
  const reward = useGameStore((s) => s.lastReward);
  const clear = useGameStore((s) => s.clearReward);
  const played = useRef(false);

  useEffect(() => {
    if (reward && !played.current) {
      if (reward.source === "quest" || reward.source === "achievement") {
        soundEngine.play("quest");
      } else if (reward.bossDefeated) {
        soundEngine.play("bossDefeat");
      } else if (reward.levelsGained > 0) {
        soundEngine.play("levelup");
      } else {
        soundEngine.play("workout");
      }
      played.current = true;
    }
    if (!reward) played.current = false;
  }, [reward]);

  if (!reward) return null;
  return (
    <div className="toast-overlay" onClick={clear}>
      <div className="toast" onClick={(e) => e.stopPropagation()}>
        {reward.levelsGained > 0 && (
          <div className="levelup">★ LEVEL UP! ★ +{reward.levelsGained}</div>
        )}
        {reward.bossDefeated && (
          <div className="newbest">⚔️ {reward.bossDefeated} を撃破！</div>
        )}
        {reward.newBest && (
          <div className="newbest">🏆 {reward.newBest}</div>
        )}
        {reward.exp > 0 && <div className="big-exp">+{reward.exp} EXP</div>}
        <div style={{ color: "var(--amber)" }}>+{reward.gold} ゴールド</div>
        {reward.expBoostUsed && (
          <div className="hint" style={{ marginTop: 8, color: "var(--green)" }}>
            🧪 コンディションドリンク発動 ×1.5
          </div>
        )}
        {reward.modifier !== 1 && (
          <div className="hint" style={{ marginTop: 8 }}>
            コンディション補正 ×{reward.modifier}
          </div>
        )}
        {reward.statText && (
          <div style={{ color: "var(--blue)", fontSize: 9, marginTop: 8 }}>
            {reward.statText}
          </div>
        )}
        <button className="btn full" style={{ marginTop: 16 }} onClick={clear}>
          OK
        </button>
      </div>
    </div>
  );
}

function SoundToggle() {
  const [seOn, setSeOn] = useState(soundEngine.seOn);
  const [bgmOn, setBgmOn] = useState(soundEngine.bgmOn);
  const [open, setOpen] = useState(false);

  const icon = seOn || bgmOn ? "🔊" : "🔇";

  return (
    <div className="sound-toggle">
      <button className="coin-btn sound-btn" onClick={() => setOpen((p) => !p)}>
        {icon}
      </button>
      {open && (
        <div className="sound-menu" onClick={(e) => e.stopPropagation()}>
          <label className="sound-row">
            <span>SE</span>
            <input
              type="checkbox"
              checked={seOn}
              onChange={(e) => {
                soundEngine.setSEOn(e.target.checked);
                setSeOn(e.target.checked);
                if (e.target.checked) soundEngine.play("click");
              }}
            />
          </label>
          <label className="sound-row">
            <span>BGM</span>
            <input
              type="checkbox"
              checked={bgmOn}
              onChange={(e) => {
                soundEngine.setBGMOn(e.target.checked);
                setBgmOn(e.target.checked);
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const profile = useGameStore((s) => s.profile);
  const gold = useGameStore((s) => s.avatar.gold);
  const applyDailyPenalty = useGameStore((s) => s.applyDailyPenalty);
  const [tab, setTab] = useState<Tab>("home");
  const [shopOpen, setShopOpen] = useState(false);

  useEffect(() => {
    applyDailyPenalty();
  }, [applyDailyPenalty]);

  // ブラウザの自動再生制限に対応: 最初のユーザー操作でBGM開始
  useEffect(() => {
    const start = () => soundEngine.startBGM();
    document.addEventListener("click", start, { once: true });
    document.addEventListener("touchstart", start, { once: true });

    // iOS PWA: バックグラウンド復帰時に AudioContext が suspend → 再開
    const onVisibility = () => soundEngine.handleVisibilityChange();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("click", start);
      document.removeEventListener("touchstart", start);
      document.removeEventListener("visibilitychange", onVisibility);
      soundEngine.stopBGM();
    };
  }, []);

  if (!profile) return <Onboarding />;

  return (
    <div className="app">
      <div className="topbar">
        <span className="title">▸ {profile.name}</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <SoundToggle />
          <button className="coin coin-btn" onClick={() => setShopOpen(true)}>
            🪙 {gold} ▸ 🏪
          </button>
        </div>
      </div>

      {tab === "home" && <AvatarPanel />}
      {tab === "train" && <WorkoutScreen />}
      {tab === "meal" && <MealScreen />}
      {tab === "boss" && <BossScreen />}
      {tab === "quest" && <QuestScreen />}

      <nav className="tabbar">
        <button className={tab === "home" ? "active" : ""} onClick={() => setTab("home")}>
          <span className="ico">🧍</span>アバター
        </button>
        <button className={tab === "train" ? "active" : ""} onClick={() => setTab("train")}>
          <span className="ico">🏋️</span>トレ
        </button>
        <button className={tab === "meal" ? "active" : ""} onClick={() => setTab("meal")}>
          <span className="ico">🍽️</span>食事
        </button>
        <button className={tab === "boss" ? "active" : ""} onClick={() => setTab("boss")}>
          <span className="ico">⚔️</span>バトル
        </button>
        <button className={tab === "quest" ? "active" : ""} onClick={() => setTab("quest")}>
          <span className="ico">📜</span>クエスト
        </button>
      </nav>

      {shopOpen && <ShopModal onClose={() => setShopOpen(false)} />}
      <PenaltyToast />
      <RewardToast />
    </div>
  );
}
