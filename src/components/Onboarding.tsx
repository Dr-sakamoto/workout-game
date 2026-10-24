import { useState } from "react";
import { useStore } from "../store/useStore";
import { BAN_PRESETS, DEFENSE_PRESETS, OFFENSE_PRESETS } from "../domain/presets";

export function Onboarding() {
  const { goals, addGoal, removeGoal, finishOnboarding } = useStore();
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [why, setWhy] = useState("");
  const [def, setDef] = useState(() => DEFENSE_PRESETS.map(() => true));
  const [off, setOff] = useState(() => OFFENSE_PRESETS.map(() => true));
  const [ban, setBan] = useState(() => BAN_PRESETS.map(() => true));

  const submitGoal = () => {
    if (!title.trim()) return;
    addGoal(title.trim(), why.trim());
    setTitle("");
    setWhy("");
  };

  const finish = () =>
    finishOnboarding(
      [...DEFENSE_PRESETS.filter((_, i) => def[i]), ...OFFENSE_PRESETS.filter((_, i) => off[i])],
      BAN_PRESETS.filter((_, i) => ban[i]),
    );

  return (
    <div className="app">
      <main className="screen onboarding">
        {step === 0 && (
          <section>
            <h1>行動ガチャ</h1>
            <p className="lead">1日1回ハンドルを回すと、今日のカードが出てきます。</p>
            <p className="muted">
              カードには今日やることのステッカーが4枚と、今日の禁止事項が1つ。
              楽しいことほどキラキラのステッカーになります。終わったらハンコを押すだけ。
            </p>
            <p className="muted">
              中身はランダムに見えて、裏では目標・期限・疲れ・これまでの行動を見て調整しています。
              できなかった日があっても、週の単位でちゃんと帳尻を合わせます。
            </p>
            <button className="primary" onClick={() => setStep(1)}>はじめる</button>
          </section>
        )}

        {step === 1 && (
          <section>
            <h2>今年なりたい姿は？</h2>
            <p className="muted">目標ごとに、それに向けた行動を自動でつくります。あとからでも追加できます。</p>
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
            <ul className="list">
              {DEFENSE_PRESETS.map((p, i) => (
                <li key={p.title}>
                  <label className="check">
                    <input type="checkbox" checked={def[i]} onChange={() => setDef(def.map((v, j) => (j === i ? !v : v)))} />
                    {p.title}
                  </label>
                </li>
              ))}
              {OFFENSE_PRESETS.map((p, i) => (
                <li key={p.title}>
                  <label className="check">
                    <input type="checkbox" checked={off[i]} onChange={() => setOff(off.map((v, j) => (j === i ? !v : v)))} />
                    {p.title}
                  </label>
                </li>
              ))}
            </ul>
            <button className="primary" onClick={() => setStep(3)}>次へ</button>
          </section>
        )}

        {step === 3 && (
          <section>
            <h2>禁止事項</h2>
            <p className="muted">毎日このうち1つがカードの下の帯に出ます。</p>
            <ul className="list">
              {BAN_PRESETS.map((p, i) => (
                <li key={p}>
                  <label className="check">
                    <input type="checkbox" checked={ban[i]} onChange={() => setBan(ban.map((v, j) => (j === i ? !v : v)))} />
                    {p}
                  </label>
                </li>
              ))}
            </ul>
            <button className="primary" onClick={finish}>ガチャのところへ行く</button>
          </section>
        )}
      </main>
    </div>
  );
}
