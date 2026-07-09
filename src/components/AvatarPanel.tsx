import { useGameStore, selectToday } from "../store/useGameStore";
import { appearanceForLevel, maxHp } from "../domain/avatar";
import { computeBmi } from "../domain/physique";
import { computeBuild, weakenedBuild, BODY_FAT_LABELS } from "../domain/build";
import { computeCondition } from "../domain/meals";
import { computeSleepCondition, SLEEP_OPTIONS } from "../domain/sleep";
import { STAT_LABELS } from "../domain/exercises";
import { VISUAL_PARTS, PART_LABELS, partTiers } from "../domain/parts";
import type { StatKey, SleepQuality } from "../domain/types";
import { PixelAvatar } from "./PixelAvatar";
import { GrowthPanel } from "./GrowthPanel";
import { soundEngine } from "../sounds/soundEngine";

export function AvatarPanel() {
  const profile = useGameStore((s) => s.profile)!;
  const avatar = useGameStore((s) => s.avatar);
  const streak = useGameStore((s) => s.streak);
  const partVolumes = useGameStore((s) => s.partVolumes);
  const bodyFat = useGameStore((s) => s.bodyFat);
  const setBodyFat = useGameStore((s) => s.setBodyFat);
  const logSleep = useGameStore((s) => s.logSleep);
  const { meals, sleep } = useGameStore(selectToday);

  const playerHp = useGameStore((s) => s.playerHp);

  const bmi = Math.round(computeBmi(profile.heightCm, profile.weightKg) * 10) / 10;
  const effFat = bodyFat ?? 2;
  const mhpForWeak = maxHp(avatar.stats);
  // HPが尽きると見た目が一時的に1段階なまる(可逆)。トレでHPが戻れば元通り。
  const weakened = (playerHp ?? mhpForWeak) <= 0;
  const rawFront = computeBuild(profile.heightCm, profile.weightKg, partVolumes, "front", effFat);
  const rawBack = computeBuild(profile.heightCm, profile.weightKg, partVolumes, "back", effFat);
  const buildFront = weakened ? weakenedBuild(rawFront) : rawFront;
  const buildBack = weakened ? weakenedBuild(rawBack) : rawBack;
  const tiers = partTiers(partVolumes);
  const tier = appearanceForLevel(avatar.level);
  const condition = computeCondition(meals, profile);
  const sleepCond = computeSleepCondition(sleep?.quality ?? null);
  const expPct = Math.min(100, (avatar.expIntoLevel / avatar.expForNextLevel) * 100);
  const mhp = maxHp(avatar.stats);
  const currentHp = Math.min(playerHp ?? mhp, mhp);
  const hpPct = Math.min(100, (currentHp / mhp) * 100);
  const hpFillClass = hpPct > 60 ? "fill-hp" : hpPct > 30 ? "fill-hp-warn" : "fill-hp-danger";

  const maxStat = Math.max(20, ...Object.values(avatar.stats));

  return (
    <div className="screen">
      <div className="panel">
        <div className="avatar-stage">
          <div className="avatar-pair">
            <div className="ba-col">
              <PixelAvatar build={buildFront} size={150} aura={tier.aura} />
              <div className="ba-tag">正面</div>
            </div>
            <div className="ba-col">
              <PixelAvatar build={buildBack} size={150} aura={tier.aura} />
              <div className="ba-tag">背面</div>
            </div>
          </div>
          <div className="avatar-name">{profile.name}</div>
          <div className="avatar-title">
            Lv.{avatar.level} {tier.title}
          </div>
          <div className="avatar-meta">
            {BODY_FAT_LABELS[effFat]} ／ BMI {bmi} ／ 🔥{streak.count}日連続
          </div>
          {weakened && (
            <div className="weakened-note">
              ⚠️ HPが尽きて体が少しなまっている。トレーニングすれば元に戻る！
            </div>
          )}
          <div className="fat-adjust">
            <span className="fat-cap">体型を自分に合わせる</span>
            <div className="fat-btns">
              <button onClick={() => setBodyFat(effFat - 1)} disabled={effFat <= 0}>−</button>
              <div className="fat-pips">
                {[0, 1, 2, 3, 4].map((i) => (
                  <span key={i} className={`pip ${i <= effFat ? "on" : ""}`} />
                ))}
              </div>
              <button onClick={() => setBodyFat(effFat + 1)} disabled={effFat >= 4}>＋</button>
            </div>
          </div>
        </div>

        <div className="bar-label">
          <span>EXP</span>
          <span>
            {avatar.expIntoLevel} / {avatar.expForNextLevel}
          </span>
        </div>
        <div className="bar">
          <span className="fill-exp" style={{ width: `${expPct}%` }} />
        </div>

        <div className="bar-label">
          <span>HP</span>
          <span>{currentHp} / {mhp}</span>
        </div>
        <div className="bar">
          <span className={hpFillClass} style={{ width: `${hpPct}%` }} />
        </div>
      </div>

      <GrowthPanel />

      <div className="panel">
        <h2>部位の発達</h2>
        <p className="hint" style={{ marginBottom: 10 }}>
          鍛えた部位だけアバターが育つ。腕を鍛えれば腕が、背中を鍛えれば背中が太くなる。
        </p>
        <div className="part-grid">
          {VISUAL_PARTS.map((p) => (
            <div className="part-row" key={p}>
              <span className="part-name">{PART_LABELS[p].emoji} {PART_LABELS[p].label}</span>
              <span className="pips">
                {[0, 1, 2, 3].map((i) => (
                  <span key={i} className={`pip ${i < tiers[p] ? "on" : ""}`} />
                ))}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>ステータス</h2>
        <div className="stat-grid">
          {(Object.keys(STAT_LABELS) as StatKey[]).map((k) => (
            <div className="stat-row" key={k}>
              <span title={STAT_LABELS[k].full}>{STAT_LABELS[k].emoji}</span>
              <span className="stat-bar">
                <span style={{ width: `${(avatar.stats[k] / maxStat) * 100}%` }} />
              </span>
              <span className="stat-val">{avatar.stats[k]}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <h2>今日のコンディション</h2>

        {/* 睡眠サーベイ */}
        <div className="sleep-section">
          <div className="sleep-label">
            <span className="sleep-ico">{sleepCond.emoji}</span>
            <div>
              <div className="sleep-title">今日の睡眠</div>
              <div className={sleepCond.expModifier > 1 ? "mod-up" : sleepCond.expModifier < 1 ? "mod-down" : "hint"}>
                {sleepCond.quality === null ? sleepCond.hint : sleepCond.hint}
              </div>
            </div>
          </div>
          <div className="sleep-btns">
            {SLEEP_OPTIONS.map((opt) => (
              <button
                key={opt.quality}
                className={`sleep-btn ${sleep?.quality === opt.quality ? "selected" : ""}`}
                onClick={() => { logSleep(opt.quality as SleepQuality); soundEngine.play("sleep"); }}
              >
                <span className="sleep-btn-ico">{opt.emoji}</span>
                <span className="sleep-btn-label">{opt.label}</span>
                <span className="sleep-btn-sub">{opt.subLabel}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 食事コンディション */}
        <div className="condition" style={{ marginTop: 14 }}>
          <span className="big">{condition.emoji}</span>
          <div>
            <div>{condition.label}</div>
            <div className={condition.expModifier >= 1 ? "mod-up" : "mod-down"}>
              食事補正 {condition.expModifier >= 1 ? "+" : ""}{Math.round((condition.expModifier - 1) * 100)}%
            </div>
          </div>
        </div>

        {/* 合計補正 */}
        {sleep !== null && (
          <div className="combined-mod" style={{ marginTop: 10 }}>
            <span>トレEXP補正（睡眠×食事）</span>
            <span className={condition.expModifier * sleepCond.expModifier >= 1 ? "mod-up" : "mod-down"}>
              ×{Math.round(condition.expModifier * sleepCond.expModifier * 100) / 100}
            </span>
          </div>
        )}

        <p className="hint" style={{ marginTop: 10 }}>
          睡眠と食事の両方を記録するとトレEXPにボーナスがつく。
        </p>
      </div>
    </div>
  );
}
