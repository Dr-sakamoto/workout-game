import { useState } from "react";
import { useStore } from "../store/useStore";
import { DEFENSE_PRESETS, OFFENSE_PRESETS } from "../domain/presets";

export function Onboarding() {
  const { goals, addGoal, removeGoal, finishOnboarding } = useStore();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [def, setDef] = useState(() => DEFENSE_PRESETS.map(() => true));
  const [off, setOff] = useState(() => OFFENSE_PRESETS.map(() => true));

  const submitGoal = () => {
    if (!title.trim()) return;
    addGoal(title.trim(), why.trim());
    setTitle("");
    setWhy("");
  };

  const finish = () =>
    finishOnboarding([
      ...DEFENSE_PRESETS.filter((_, i) => def[i]),
      ...OFFENSE_PRESETS.filter((_, i) => off[i]),
    ]);

  return (
    <div className="app">
      <main className="screen onboarding">
        {step === 0 && (
          <section>
            <h1>行動ガチャ</h1>
            <p className="lead">衝動を抑えなくていい。やりたくなった瞬間にガチャを回して、出た行動を始めるだけ。</p>
            <p className="muted">
              ガチャはランダムに見えて、裏では目標・期限・疲れ・これまでの行動を見て中身を調整します。
              パスしても脱線しても、週の単位でちゃんと帳尻を合わせます。
            </p>
            <button className="primary" onClick={() => setStep(1)}>はじめる</button>
          </section>
        )}

        {step === 1 && (
          <section>
            <h2>今年なりたい姿は？</h2>
            <p className="muted">目標ごとに「攻撃行動」を自動でつくります。あとからでも追加できます。</p>
            <div className="card form">
              <input placeholder="例: 絵を描けるようになる" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input placeholder="なぜ?(任意)" value={why} onChange={(e) => setWhy(e.target.value)} />
              <button onClick={submitGoal} disabled={!title.trim()}>追加</button>
            </div>
            <ul className="list">
              {goals.map((g) => (
                <li key={g.id} className="row">
                  <span>★ {g.title}</span>
                  <button className="ghost" onClick={() => removeGoal(g.id)}>×</button>
                </li>
              ))}
            </ul>
            <button className="primary" onClick={() => setStep(2)}>次へ</button>
          </section>
        )}

        {step === 2 && (
          <section>
            <h2>ガチャに入れる行動</h2>
            <p className="muted">チェックを外したものは出ません。ここで細かく決めなくて大丈夫です。</p>
            <h3><span className="badge defense">防御</span> 放置すると困ること</h3>
            <ul className="list">
              {DEFENSE_PRESETS.map((p, i) => (
                <li key={p.title}>
                  <label className="check">
                    <input type="checkbox" checked={def[i]} onChange={() => setDef(def.map((v, j) => (j === i ? !v : v)))} />
                    {p.title}
                  </label>
                </li>
              ))}
            </ul>
            <h3><span className="badge offense">攻撃</span> 未来のためにやること</h3>
            <ul className="list">
              {OFFENSE_PRESETS.map((p, i) => (
                <li key={p.title}>
                  <label className="check">
                    <input type="checkbox" checked={off[i]} onChange={() => setOff(off.map((v, j) => (j === i ? !v : v)))} />
                    {p.title}
                  </label>
                </li>
              ))}
            </ul>
            <button className="primary" onClick={finish}>ガチャを回しにいく</button>
          </section>
        )}
      </main>
    </div>
  );
}
