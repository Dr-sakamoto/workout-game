import { useGameStore } from "../store/useGameStore";
import { computeBuild, overallMuscle } from "../domain/build";
import type { StatKey } from "../domain/types";
import { PixelAvatar } from "./PixelAvatar";

// 成長の記録(Before / After) — ライバルは自分(原則2・3)
// 「最初のショボい自分」と「今の自分」を並べ、差分=これまでの努力を可視化する。
export function GrowthPanel() {
  const profile = useGameStore((s) => s.profile)!;
  const avatar = useGameStore((s) => s.avatar);
  const snap = useGameStore((s) => s.startSnapshot);
  const partVolumes = useGameStore((s) => s.partVolumes);
  const bodyFat = useGameStore((s) => s.bodyFat);
  if (!snap) return null;

  // Before/After で体脂肪は同じにし、筋肉(部位)の差分だけを見せる。
  const before = computeBuild(snap.heightCm, snap.weightKg, undefined, "front", bodyFat);
  const now = computeBuild(profile.heightCm, profile.weightKg, partVolumes, "front", bodyFat);

  const statSum = (s: Record<StatKey, number>) =>
    s.str + s.end + s.vit + s.agi + s.dex;
  const dStat = statSum(avatar.stats) - statSum(snap.stats);
  const dLevel = avatar.level - snap.level;
  const dMuscle = overallMuscle(now.parts) - overallMuscle(before.parts);

  return (
    <div className="panel">
      <h2>成長の記録 — ライバルは自分</h2>
      <div className="ba-row">
        <div className="ba-col">
          <PixelAvatar build={before} size={120} />
          <div className="ba-tag">最初の自分</div>
          <div className="ba-sub">Lv.{snap.level} / {snap.date}</div>
        </div>
        <div className="ba-arrow">▶</div>
        <div className="ba-col">
          <PixelAvatar build={now} size={120} aura="#f2b134" />
          <div className="ba-tag now">今の自分</div>
          <div className="ba-sub">Lv.{avatar.level}</div>
        </div>
      </div>
      <div className="ba-delta">
        {dLevel > 0 ? `Lv +${dLevel}` : "Lv ±0"}　/
        ステータス計 {dStat >= 0 ? "+" : ""}{dStat}　/
        {dMuscle > 0 ? `筋肉ランク +${dMuscle} 💪` : "これから鍛える"}
      </div>
      {dMuscle === 0 && dLevel === 0 ? (
        <p className="hint" style={{ marginTop: 8 }}>
          まだ何も変わっていない。トレーニングを重ねて「最初の自分」を超えろ。
        </p>
      ) : null}
    </div>
  );
}
