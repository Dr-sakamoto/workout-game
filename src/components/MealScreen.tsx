import { useMemo, useState } from "react";
import { useGameStore, selectToday } from "../store/useGameStore";
import { computeCondition, sumMeals, proteinGoal, calorieGoal } from "../domain/meals";
import type { MealLog, MealSlot } from "../domain/types";
import { registerCommunityFood } from "../lib/supabase";
import { soundEngine } from "../sounds/soundEngine";
import {
  PROTEIN_LEVELS,
  MEAL_SIZES,
  estimateSimpleMeal,
  simpleMealName,
  type ProteinLevel,
  type MealSize,
} from "../domain/simpleMeal";
import { BarcodeScanner } from "./BarcodeScanner";

// 「よく食べる物」に出すための最低記録回数。固定プリセットは置かず、
// 本人の履歴が育ってから初めて意味のある提案をする。
const FREQUENT_MIN_COUNT = 3;

const SLOTS: { id: MealSlot; label: string; emoji: string }[] = [
  { id: "morning", label: "朝", emoji: "🌅" },
  { id: "noon", label: "昼", emoji: "☀️" },
  { id: "night", label: "夕", emoji: "🌙" },
  { id: "snack", label: "間食", emoji: "🍩" },
];

function defaultSlot(): MealSlot {
  const h = new Date().getHours();
  if (h < 10) return "morning";
  if (h < 15) return "noon";
  if (h < 21) return "night";
  return "snack";
}

const scale = (m: { protein: number; fat: number; carb: number; calories: number }, q: number) => ({
  protein: Math.round(m.protein * q),
  fat: Math.round(m.fat * q),
  carb: Math.round(m.carb * q),
  calories: Math.round(m.calories * q),
});

export function MealScreen() {
  const profile = useGameStore((s) => s.profile)!;
  const logMeal = useGameStore((s) => s.logMeal);
  const allMeals = useGameStore((s) => s.mealLogs);
  const { meals } = useGameStore(selectToday);

  const [slot, setSlot] = useState<MealSlot>(defaultSlot());
  const [qty, setQty] = useState(1);
  const [search, setSearch] = useState("");
  const [name, setName] = useState("");
  const [p, setP] = useState(""); const [f, setF] = useState("");
  const [c, setC] = useState(""); const [kcal, setKcal] = useState("");
  const [showScanner, setShowScanner] = useState(false);

  // かんたん記録(バーコードのない自炊・外食向け)
  const [simpleName, setSimpleName] = useState("");
  const [proteinLevel, setProteinLevel] = useState<ProteinLevel>("some");
  const [mealSize, setMealSize] = useState<MealSize>("normal");

  // 記録の修正・削除
  const [editing, setEditing] = useState<MealLog | null>(null);

  // 最近食べたもの(名前で重複除去)
  const recent = useMemo(() => {
    const out: typeof allMeals = []; const seen = new Set<string>();
    for (const m of allMeals) {
      if (seen.has(m.name)) continue;
      seen.add(m.name); out.push(m);
      if (out.length >= 12) break;
    }
    return out;
  }, [allMeals]);

  // よく食べる物: 履歴の記録回数から動的に算出する（固定プリセットは持たない）
  const frequent = useMemo(() => {
    const counts = new Map<string, { count: number; sample: (typeof allMeals)[number] }>();
    for (const m of allMeals) {
      const cur = counts.get(m.name);
      if (cur) cur.count++;
      else counts.set(m.name, { count: 1, sample: m });
    }
    return [...counts.values()]
      .filter((v) => v.count >= FREQUENT_MIN_COUNT)
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [allMeals]);

  // 検索: 最近＋よく食べる物 を名前で絞り込み
  const q = search.trim();
  const shownRecent = q ? recent.filter((x) => x.name.includes(q)) : recent;
  const shownFrequent = q ? frequent.filter((v) => v.sample.name.includes(q)) : frequent;

  const totals = sumMeals(meals);
  const condition = computeCondition(meals, profile);
  const pGoal = proteinGoal(profile.weightKg);
  const cGoal = calorieGoal(profile);

  const add = (m: { name: string; protein: number; fat: number; carb: number; calories: number; estimated?: boolean; barcode?: string }) => {
    logMeal({
      name: qty === 1 ? m.name : `${m.name}×${qty}`,
      ...scale(m, qty),
      slot,
      estimated: m.estimated,
      // 数量倍した値は商品1個分と一致しないので、バーコードの紐付けは等倍のときだけ
      barcode: qty === 1 ? m.barcode : undefined,
    });
    soundEngine.play("meal");
  };

  const simpleEstimate = estimateSimpleMeal(proteinLevel, mealSize);
  const addSimple = () => {
    add({
      name: simpleName.trim() || simpleMealName(proteinLevel, mealSize),
      ...simpleEstimate,
      estimated: true,
    });
    setSimpleName("");
  };

  const addCustom = () => {
    if (!name.trim()) return;
    add({ name: name.trim(), protein: Number(p) || 0, fat: Number(f) || 0, carb: Number(c) || 0, calories: Number(kcal) || 0 });
    setName(""); setP(""); setF(""); setC(""); setKcal("");
  };

  // スキャナー側で内容確認済みなので、そのまま記録する(タップ数最小化)。
  // 間違いに気づいたら「今日の食事」から修正・削除できる。
  const handleBarcodeScan = (food: { name: string; protein: number; fat: number; carb: number; calories: number; barcode?: string }) => {
    setShowScanner(false);
    add(food);
  };

  return (
    <div className="screen">
      {showScanner && (
        <BarcodeScanner onResult={handleBarcodeScan} onClose={() => setShowScanner(false)} />
      )}
      {editing && <MealEditModal meal={editing} onClose={() => setEditing(null)} />}
      <div className="panel">
        <h2>今日の栄養</h2>
        <div className="condition" style={{ marginBottom: 12 }}>
          <span className="big">{condition.emoji}</span>
          <div>
            <div>{condition.label}(スコア {condition.score}）</div>
            <div className={condition.expModifier >= 1 ? "mod-up" : "mod-down"}>
              トレEXP {condition.expModifier >= 1 ? "+" : ""}{Math.round((condition.expModifier - 1) * 100)}%
            </div>
          </div>
        </div>
        <div className="bar-label"><span>🍗 タンパク質</span><span>{Math.round(totals.protein)} / {pGoal} g</span></div>
        <div className="bar"><span className="fill-exp" style={{ width: `${Math.min(100, (totals.protein / pGoal) * 100)}%` }} /></div>
        <div className="bar-label"><span>🔥 カロリー</span><span>{Math.round(totals.calories)} / {cGoal} kcal</span></div>
        <div className="bar"><span className="fill-hp" style={{ width: `${Math.min(100, (totals.calories / cGoal) * 100)}%` }} /></div>
        <p className="hint" style={{ marginTop: 8 }}>F {Math.round(totals.fat)}g ／ C {Math.round(totals.carb)}g</p>
      </div>

      <div className="panel">
        <h2>記録する</h2>
        {/* 時間帯 */}
        <div className="cat-tabs">
          {SLOTS.map((s) => (
            <button key={s.id} className={`cat-tab ${slot === s.id ? "active" : ""}`} onClick={() => { setSlot(s.id); soundEngine.play("select"); }}>
              {s.emoji}{s.label}
            </button>
          ))}
        </div>
        {/* 数量 */}
        <div className="qty-row">
          <span className="qty-cap">数量</span>
          <div className="stepper">
            <button onClick={() => setQty(Math.max(1, qty - 1))}>−</button>
            <input type="number" value={qty} onChange={(e) => setQty(Math.max(1, Number(e.target.value) || 1))} />
            <button onClick={() => setQty(qty + 1)}>＋</button>
            <span className="su">人前</span>
          </div>
        </div>

        {/* パッケージ商品: バーコードスキャン */}
        <button className="scan-cta" onClick={() => setShowScanner(true)}>
          <span className="scan-cta-ico">📷</span>
          <span className="scan-cta-text">
            <span className="scan-cta-title">バーコードをスキャン</span>
            <span className="scan-cta-sub">パッケージ商品はPFC・カロリーを自動入力</span>
          </span>
          <span className="scan-cta-arrow">›</span>
        </button>

        <div className="or-divider"><span>または</span></div>

        <h3>🍚 自炊・外食をかんたん記録</h3>
        <p className="hint" style={{ marginBottom: 8 }}>
          バーコードがなくてもOK。2つ選ぶだけで目安を記録します。
        </p>
        <input
          placeholder="メニュー名（なくてもOK）"
          value={simpleName}
          onChange={(e) => setSimpleName(e.target.value)}
          style={{ marginBottom: 10 }}
        />
        <div className="simple-q">肉・魚・卵・大豆・プロテインは？</div>
        <div className="cat-tabs">
          {PROTEIN_LEVELS.map((o) => (
            <button
              key={o.id}
              className={`cat-tab ${proteinLevel === o.id ? "active" : ""}`}
              onClick={() => { setProteinLevel(o.id); soundEngine.play("select"); }}
            >
              {o.emoji}{o.label}
            </button>
          ))}
        </div>
        <p className="hint simple-hint">目安: {PROTEIN_LEVELS.find((o) => o.id === proteinLevel)!.hint}</p>
        <div className="simple-q">全体の量は？</div>
        <div className="cat-tabs">
          {MEAL_SIZES.map((o) => (
            <button
              key={o.id}
              className={`cat-tab ${mealSize === o.id ? "active" : ""}`}
              onClick={() => { setMealSize(o.id); soundEngine.play("select"); }}
            >
              {o.emoji}{o.label}
            </button>
          ))}
        </div>
        <p className="hint simple-hint">目安: {MEAL_SIZES.find((o) => o.id === mealSize)!.hint}</p>
        <button className="btn full" style={{ marginTop: 8 }} onClick={addSimple}>
          ＋ {SLOTS.find((s) => s.id === slot)!.label}に記録（目安 P{simpleEstimate.protein}g・約{simpleEstimate.calories}kcal）{qty > 1 ? `×${qty}` : ""}
        </button>

        {(recent.length > 0 || frequent.length > 0) && (
          <>
            <div className="or-divider" style={{ marginTop: 14 }}><span>いつもの物をワンタップ</span></div>
            <input className="search" placeholder="🔍 食べ物を検索" value={search} onChange={(e) => setSearch(e.target.value)} />
          </>
        )}

        {shownRecent.length > 0 && (
          <>
            <h3>最近食べたもの</h3>
            <div className="chip-grid">
              {shownRecent.map((m) => (
                <button key={m.id} className="chip" onClick={() => add(m)}>
                  <span className="emoji">🍽️</span>
                  <span className="chip-name">{m.name}（P{Math.round(m.protein)}）</span>
                </button>
              ))}
            </div>
          </>
        )}

        {shownFrequent.length > 0 && (
          <>
            <h3>よく食べる物</h3>
            <div className="chip-grid">
              {shownFrequent.map(({ sample: m, count }) => (
                <button key={m.name} className="chip" onClick={() => add(m)}>
                  <span className="emoji">🍽️</span>
                  <span className="chip-name">{m.name}</span>
                  <span className="chip-count">×{count}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <details className="adv-input">
          <summary>✍️ g単位で詳細に入力（慣れている人向け）</summary>
          <input placeholder="メニュー名" value={name} onChange={(e) => setName(e.target.value)} style={{ marginBottom: 8, marginTop: 10 }} />
          <div className="inline-inputs" style={{ marginTop: 8 }}>
            <input placeholder="P(g)" type="number" value={p} onChange={(e) => setP(e.target.value)} />
            <input placeholder="F(g)" type="number" value={f} onChange={(e) => setF(e.target.value)} />
            <input placeholder="C(g)" type="number" value={c} onChange={(e) => setC(e.target.value)} />
            <input placeholder="kcal" type="number" value={kcal} onChange={(e) => setKcal(e.target.value)} />
          </div>
          <button className="btn full" style={{ marginTop: 12 }} onClick={addCustom}>
            ＋ {SLOTS.find((s) => s.id === slot)!.label}に記録{qty > 1 ? `（×${qty}）` : ""}
          </button>
        </details>
      </div>

      <div className="panel">
        <h2>今日の食事</h2>
        {meals.length === 0 ? (
          <div className="empty">まだ記録なし。</div>
        ) : (
          <>
          <p className="hint" style={{ marginBottom: 4 }}>タップで修正・削除できます</p>
          {
          SLOTS.map((s) => {
            const items = meals.filter((m) => (m.slot ?? "snack") === s.id);
            if (items.length === 0) return null;
            const sub = sumMeals(items);
            return (
              <div key={s.id} style={{ marginBottom: 8 }}>
                <div className="slot-head">{s.emoji} {s.label}　<span className="hint">P{Math.round(sub.protein)} / {Math.round(sub.calories)}kcal</span></div>
                {items.map((m) => (
                  <button className="log-item log-item-btn" key={m.id} onClick={() => setEditing(m)}>
                    <span>{m.name}</span>
                    <span>
                      {m.estimated ? "約 " : ""}P{Math.round(m.protein)} / {Math.round(m.calories)}kcal
                      <span className="edit-ico">✏️</span>
                    </span>
                  </button>
                ))}
              </div>
            );
          })}
          </>
        )}
      </div>
    </div>
  );
}

/** 記録済み食事の修正・削除モーダル。バーコード由来の記録はコミュニティDBへも反映できる */
function MealEditModal({ meal, onClose }: { meal: MealLog; onClose: () => void }) {
  const updateMeal = useGameStore((s) => s.updateMeal);
  const deleteMeal = useGameStore((s) => s.deleteMeal);

  const [name, setName] = useState(meal.name);
  const [p, setP] = useState(String(meal.protein));
  const [f, setF] = useState(String(meal.fat));
  const [c, setC] = useState(String(meal.carb));
  const [kcal, setKcal] = useState(String(meal.calories));
  const [slot, setSlot] = useState<MealSlot>(meal.slot ?? "snack");
  const [fixCommunity, setFixCommunity] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = () => {
    if (!name.trim()) return;
    const patch = {
      name: name.trim(),
      protein: Number(p) || 0,
      fat: Number(f) || 0,
      carb: Number(c) || 0,
      calories: Number(kcal) || 0,
      slot,
      // 手で直した値はもう「概算」ではない
      estimated: false,
    };
    updateMeal(meal.id, patch);
    soundEngine.play("click");
    if (fixCommunity && meal.barcode) {
      // 共有DBの修正は投げっぱなしでよい(失敗しても本人の記録は直っている)
      void registerCommunityFood({
        barcode: meal.barcode,
        name: patch.name,
        protein: patch.protein,
        fat: patch.fat,
        carb: patch.carb,
        calories: patch.calories,
      }).catch(() => {});
    }
    onClose();
  };

  const remove = () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    deleteMeal(meal.id);
    soundEngine.play("delete");
    onClose();
  };

  return (
    <div className="barcode-overlay" onClick={onClose}>
      <div className="barcode-modal" onClick={(e) => e.stopPropagation()}>
        <button className="barcode-close" onClick={onClose} aria-label="閉じる">✕</button>
        <h3>記録を修正</h3>
        <div className="cat-tabs">
          {SLOTS.map((s) => (
            <button key={s.id} className={`cat-tab ${slot === s.id ? "active" : ""}`} onClick={() => { setSlot(s.id); soundEngine.play("select"); }}>
              {s.emoji}{s.label}
            </button>
          ))}
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="メニュー名" style={{ marginBottom: 8 }} />
        <div className="inline-inputs">
          <input type="number" placeholder="P(g)" value={p} onChange={(e) => setP(e.target.value)} />
          <input type="number" placeholder="F(g)" value={f} onChange={(e) => setF(e.target.value)} />
          <input type="number" placeholder="C(g)" value={c} onChange={(e) => setC(e.target.value)} />
          <input type="number" placeholder="kcal" value={kcal} onChange={(e) => setKcal(e.target.value)} />
        </div>
        {meal.barcode && (
          <label className="fix-community">
            <input
              type="checkbox"
              checked={fixCommunity}
              onChange={(e) => setFixCommunity(e.target.checked)}
            />
            <span>コミュニティDBの登録も間違っていたので、この内容に直す（みんなに共有されます）</span>
          </label>
        )}
        <button className="btn full" style={{ marginTop: 12 }} onClick={save}>保存する</button>
        <button className="btn secondary full btn-danger" style={{ marginTop: 8 }} onClick={remove}>
          {confirmDelete ? "本当に削除する（取り消せません）" : "この記録を削除"}
        </button>
      </div>
    </div>
  );
}
