import { useEffect, useMemo, useState } from "react";
import { useGameStore, selectToday } from "../store/useGameStore";
import { EXERCISES, EXERCISE_MAP, CATEGORY_LABELS } from "../domain/exercises";
import type { ExerciseCategory, WorkoutSet } from "../domain/types";
import { computeBaseExp } from "../domain/expEngine";

const CATEGORIES: ExerciseCategory[] = [
  "chest", "back", "legs", "shoulders", "arms", "core", "cardio",
];
type Filter = ExerciseCategory | "fav" | "recent";

function Stepper({ value, step, min, onChange, suffix }: {
  value: number; step: number; min: number; onChange: (v: number) => void; suffix: string;
}) {
  return (
    <div className="stepper">
      <button onClick={() => onChange(Math.max(min, Math.round((value - step) * 10) / 10))}>−</button>
      <input type="number" value={value} onChange={(e) => onChange(Number(e.target.value))} />
      <button onClick={() => onChange(Math.round((value + step) * 10) / 10)}>＋</button>
      <span className="su">{suffix}</span>
    </div>
  );
}

// セット間レストタイマー(記録すると自動スタート)
function RestTimer({ endsAt, onAdd, onSkip }: {
  endsAt: number | null; onAdd: () => void; onSkip: () => void;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [endsAt]);
  if (!endsAt) return null;
  const remain = Math.max(0, Math.ceil((endsAt - now) / 1000));
  if (remain <= 0) return null;
  const mm = Math.floor(remain / 60);
  const ss = String(remain % 60).padStart(2, "0");
  return (
    <div className="rest-bar">
      <span className="rest-time">⏱ レスト {mm}:{ss}</span>
      <button onClick={onAdd}>+30s</button>
      <button onClick={onSkip}>スキップ</button>
    </div>
  );
}

export function WorkoutScreen() {
  const profile = useGameStore((s) => s.profile)!;
  const logWorkout = useGameStore((s) => s.logWorkout);
  const lastSets = useGameStore((s) => s.lastSetsByExercise);
  const lastMinutes = useGameStore((s) => s.lastMinutesByExercise);
  const allWorkouts = useGameStore((s) => s.workoutLogs);
  const favorites = useGameStore((s) => s.favorites);
  const toggleFavorite = useGameStore((s) => s.toggleFavorite);
  const { workouts } = useGameStore(selectToday);

  const recentIds = useMemo(() => {
    const out: string[] = [];
    for (const w of allWorkouts) {
      if (!out.includes(w.exerciseId)) out.push(w.exerciseId);
      if (out.length >= 12) break;
    }
    return out;
  }, [allWorkouts]);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>(
    favorites.length ? "fav" : recentIds.length ? "recent" : "chest",
  );
  const [selected, setSelected] = useState<string | null>(null);
  const [sets, setSets] = useState<WorkoutSet[]>([{ weight: 40, reps: 10 }]);
  const [minutes, setMinutes] = useState(20);
  const [restEndsAt, setRestEndsAt] = useState<number | null>(null);

  const exercise = selected ? EXERCISE_MAP[selected] : null;
  const isCardio = exercise?.category === "cardio";

  useEffect(() => {
    if (!selected) return;
    const prev = lastSets[selected];
    setSets(prev && prev.length ? prev.map((s) => ({ ...s })) : [{ weight: 40, reps: 10 }]);
    setMinutes(lastMinutes[selected] ?? 20);
  }, [selected, lastSets, lastMinutes]);

  const list = useMemo(() => {
    const q = search.trim();
    if (q) return EXERCISES.filter((e) => e.name.includes(q));
    if (filter === "fav") return favorites.map((id) => EXERCISE_MAP[id]).filter(Boolean);
    if (filter === "recent") return recentIds.map((id) => EXERCISE_MAP[id]).filter(Boolean);
    return EXERCISES.filter((e) => e.category === filter);
  }, [search, filter, favorites, recentIds]);

  const preview = exercise
    ? computeBaseExp(exercise, isCardio ? { minutes } : { sets }, profile.weightKg)
    : 0;

  const setVal = (i: number, key: "weight" | "reps", v: number) =>
    setSets(sets.map((x, j) => (j === i ? { ...x, [key]: v } : x)));

  const submit = () => {
    if (!exercise) return;
    logWorkout(exercise.id, isCardio ? { minutes } : { sets });
    if (!isCardio) setRestEndsAt(Date.now() + 90000); // 90秒レスト自動開始
  };

  return (
    <div className="screen">
      <div className="panel">
        <h2>トレーニングを記録</h2>

        <input
          className="search"
          placeholder="🔍 種目を検索（例: スクワット）"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {!search && (
          <div className="cat-tabs">
            {favorites.length > 0 && (
              <button className={`cat-tab ${filter === "fav" ? "active" : ""}`} onClick={() => { setFilter("fav"); setSelected(null); }}>★お気に入り</button>
            )}
            {recentIds.length > 0 && (
              <button className={`cat-tab ${filter === "recent" ? "active" : ""}`} onClick={() => { setFilter("recent"); setSelected(null); }}>最近</button>
            )}
            {CATEGORIES.map((c) => (
              <button key={c} className={`cat-tab ${filter === c ? "active" : ""}`} onClick={() => { setFilter(c); setSelected(null); }}>
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
        )}

        <div className="chip-grid">
          {list.map((e) => (
            <div key={e.id} className={`chip ${selected === e.id ? "active" : ""}`} onClick={() => setSelected(e.id)}>
              <span className="emoji">{e.emoji}</span>
              <span className="chip-name">{e.name}</span>
              <button
                className={`star ${favorites.includes(e.id) ? "on" : ""}`}
                onClick={(ev) => { ev.stopPropagation(); toggleFavorite(e.id); }}
              >★</button>
            </div>
          ))}
          {list.length === 0 && <div className="empty">該当なし</div>}
        </div>

        {exercise && (
          <>
            <h3>
              {exercise.emoji} {exercise.name}
              {lastSets[exercise.id] && !isCardio && <span className="prefill-tag">前回値</span>}
            </h3>
            {isCardio ? (
              <Stepper value={minutes} step={5} min={1} onChange={setMinutes} suffix="分" />
            ) : (
              <>
                {sets.map((s, i) => (
                  <div className="set-row" key={i}>
                    <span className="idx">SET {i + 1}</span>
                    <Stepper value={s.weight} step={2.5} min={0} onChange={(v) => setVal(i, "weight", v)} suffix="kg" />
                    <Stepper value={s.reps} step={1} min={1} onChange={(v) => setVal(i, "reps", v)} suffix="回" />
                    {sets.length > 1 && (
                      <button className="set-del" onClick={() => setSets(sets.filter((_, j) => j !== i))}>×</button>
                    )}
                  </div>
                ))}
                {exercise.bodyweight && (
                  <p className="hint">※自重種目。重量は加重ぶんのみ(なければ0)。体重 {profile.weightKg}kg を負荷に自動計算。</p>
                )}
                <button className="btn secondary" onClick={() => setSets([...sets, { ...sets[sets.length - 1] }])}>
                  ＋ セット追加（前セットをコピー）
                </button>
              </>
            )}

            <div style={{ margin: "14px 0", fontSize: 10 }}>
              獲得予定: <span style={{ color: "var(--green)" }}>+{preview} EXP</span>
            </div>
            <button className="btn green full" onClick={submit} disabled={preview <= 0}>
              ▶ 記録してEXP獲得
            </button>
          </>
        )}
      </div>

      <div className="panel">
        <h2>今日の記録</h2>
        {workouts.length === 0 ? (
          <div className="empty">まだ記録なし。さあ鍛えよう。</div>
        ) : (
          workouts.map((w) => (
            <div className="log-item" key={w.id}>
              <span>
                {EXERCISE_MAP[w.exerciseId]?.emoji} {w.exerciseName}
                {w.minutes ? ` ${w.minutes}分` : ` ${w.sets.length}セット`}
              </span>
              <span className="exp">+{w.earnedExp} EXP</span>
            </div>
          ))
        )}
      </div>

      <RestTimer
        endsAt={restEndsAt}
        onAdd={() => setRestEndsAt((t) => (t ?? Date.now()) + 30000)}
        onSkip={() => setRestEndsAt(null)}
      />
    </div>
  );
}
