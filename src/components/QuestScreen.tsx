import { useGameStore, selectToday, selectProgress, ACHIEVEMENTS } from "../store/useGameStore";
import { EXERCISE_MAP } from "../domain/exercises";

export function QuestScreen() {
  const claimQuest = useGameStore((s) => s.claimQuest);
  const claimAchievement = useGameStore((s) => s.claimAchievement);
  const streak = useGameStore((s) => s.streak);
  const records = useGameStore((s) => s.records);
  const progress = useGameStore(selectProgress);
  const claimedAch = useGameStore((s) => s.claimedAchievements);
  const { quests, claimed } = useGameStore(selectToday);

  const volBests = Object.entries(records.bestVolumeByExercise)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);

  const achievements = ACHIEVEMENTS.map((a) => ({
    ...a,
    met: a.check(progress),
    isClaimed: claimedAch.includes(a.id),
  }));
  const unlockedCount = achievements.filter((a) => a.met).length;

  return (
    <div className="screen">
      <div className="panel">
        <h2>🔥 ストリーク</h2>
        <div style={{ fontSize: 24, color: "var(--amber)", textAlign: "center", padding: "8px 0" }}>
          {streak.count} 日連続
        </div>
        <p className="hint" style={{ textAlign: "center" }}>
          毎日トレーニングを記録して連続記録を伸ばそう。途切れると1日目に戻る。
        </p>
      </div>

      <div className="panel">
        <h2>🏆 自己ベスト（ライバルは自分）</h2>
        <div className="log-item">
          <span>1日の最高EXP</span>
          <span className="exp">{records.bestDayExp}</span>
        </div>
        <div className="log-item">
          <span>最長ストリーク</span>
          <span className="exp">{records.bestStreak} 日</span>
        </div>
        {volBests.length === 0 ? (
          <p className="hint" style={{ marginTop: 8 }}>
            種目を記録すると、種目ごとの最高ボリュームがここに刻まれる。
          </p>
        ) : (
          volBests.map(([id, vol]) => (
            <div className="log-item" key={id}>
              <span>{EXERCISE_MAP[id]?.emoji} {EXERCISE_MAP[id]?.name} 最高ボリューム</span>
              <span className="exp">{Math.round(vol)}</span>
            </div>
          ))
        )}
      </div>

      <div className="panel">
        <h2>デイリークエスト</h2>
        {quests.map((q) => {
          const isClaimed = claimed.includes(q.id);
          return (
            <div className={`quest ${q.done ? "done" : ""}`} key={q.id}>
              <div className="qhead">
                <span>{q.emoji} {q.title}</span>
                <span className="reward">+{q.rewardExp}EXP / {q.rewardGold}G</span>
              </div>
              <div className="bar-label">
                <span>{q.done ? "達成！" : "進行中"}</span>
                <span>{q.progress} / {q.target}</span>
              </div>
              <div className="bar" style={{ height: 10 }}>
                <span
                  className="fill-exp"
                  style={{ width: `${Math.min(100, (q.progress / q.target) * 100)}%` }}
                />
              </div>
              <button
                className="btn green full"
                style={{ marginTop: 10 }}
                disabled={!q.done || isClaimed}
                onClick={() => claimQuest(q.id, q.rewardExp, q.rewardGold)}
              >
                {isClaimed ? "受取済み" : q.done ? "報酬を受け取る" : "未達成"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="panel">
        <h2>🏅 実績（{unlockedCount} / {achievements.length}）</h2>
        {achievements.map((a) => (
          <div className={`quest ${a.met ? "done" : ""}`} key={a.id}>
            <div className="qhead">
              <span style={{ opacity: a.met ? 1 : 0.5 }}>
                {a.met ? a.emoji : "🔒"} {a.name}
              </span>
              <span className="reward">+{a.rewardGold}G</span>
            </div>
            <div className="hint" style={{ margin: "2px 0 8px" }}>{a.desc}</div>
            <button
              className="btn green full"
              disabled={!a.met || a.isClaimed}
              onClick={() => claimAchievement(a.id, a.rewardGold)}
            >
              {a.isClaimed ? "受取済み" : a.met ? "報酬を受け取る" : "未達成"}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
