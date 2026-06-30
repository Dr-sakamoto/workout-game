import { useState, useEffect, useRef } from "react";
import { useGameStore } from "./store/useGameStore";
import type { FloatingReward } from "./store/useGameStore";
import { Onboarding } from "./components/Onboarding";
import { AvatarPanel } from "./components/AvatarPanel";
import { WorkoutScreen } from "./components/WorkoutScreen";
import { MealScreen } from "./components/MealScreen";
import { QuestScreen } from "./components/QuestScreen";
import { BossScreen } from "./components/BossScreen";
import { ShopModal } from "./components/ShopModal";
import { SettingsScreen } from "./components/SettingsScreen";
import { soundEngine } from "./sounds/soundEngine";

type Tab = "home" | "train" | "meal" | "boss" | "quest";

// 報酬 SE を一か所で管理するフック。各トーストに分散させない。
function useSoundEffects() {
  const lastReward = useGameStore((s) => s.lastReward);
  const prev = useRef<FloatingReward | null>(null);

  useEffect(() => {
    if (lastReward && lastReward !== prev.current) {
      prev.current = lastReward;
      if (lastReward.source === "quest" || lastReward.source === "achievement") {
        soundEngine.play("quest");
      } else if (lastReward.bossDefeated) {
        soundEngine.play("bossDefeat");
      } else if (lastReward.levelsGained > 0) {
        soundEngine.play("levelup");
      } else {
        soundEngine.play("workout");
      }
    }
    if (!lastReward) prev.current = null;
  }, [lastReward]);
}

function PenaltyToast() {
  const penalty = useGameStore((s) => s.lastPenalty);
  const clearPenalty = useGameStore((s) => s.clearPenalty);

  if (!penalty) return null;

  const hpPct = Math.min(100, (penalty.newHp / penalty.maxHp) * 100);
  const hpFill = hpPct > 60 ? "fill-hp" : hpPct > 30 ? "fill-hp-warn" : "fill-hp-danger";

  // ダメージ SE はユーザーのタップ内で再生する（初回ジェスチャー前でも動く）
  const dismiss = () => {
    soundEngine.play("damage");
    clearPenalty();
  };

  return (
    <div className="toast-overlay" onClick={dismiss}>
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
        <button className="btn full btn-penalty-ok" style={{ marginTop: 16 }} onClick={dismiss}>
          わかった
        </button>
      </div>
    </div>
  );
}

function RewardToast() {
  const reward = useGameStore((s) => s.lastReward);
  const clear = useGameStore((s) => s.clearReward);

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

export default function App() {
  const profile = useGameStore((s) => s.profile);
  const gold = useGameStore((s) => s.avatar.gold);
  const applyDailyPenalty = useGameStore((s) => s.applyDailyPenalty);
  const [tab, setTab] = useState<Tab>("home");
  const [shopOpen, setShopOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useSoundEffects();

  useEffect(() => {
    applyDailyPenalty();
  }, [applyDailyPenalty]);

  useEffect(() => {
    // ブラウザの自動再生制限に対応: 最初のユーザー操作で AudioContext を起動
    const start = () => {
      soundEngine.warmup();   // ctx をジェスチャー内で resume しておく
      soundEngine.startBGM();
    };
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
          <button className="coin-btn gear-btn" onClick={() => setSettingsOpen(true)}>
            ⚙
          </button>
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
      {settingsOpen && <SettingsScreen onClose={() => setSettingsOpen(false)} />}
      <PenaltyToast />
      <RewardToast />
    </div>
  );
}
