import { useState } from "react";
import { useStore } from "../store/useStore";
import { FREE, LIFE } from "../domain/shares";
import type { Action, Energy, Fun, Loss } from "../domain/types";
import {
  DEADLINE_STARTER,
  DEFAULT_STARTER,
  intervalChoices,
  intervalLabel,
  isDraftValid,
  draftFromAction,
  draftToFields,
  newDraft,
  type ActionDraft,
} from "../domain/actionDraft";
import { ymd } from "../domain/dates";
import { labelFor, styleFor } from "./sliceStyle";
import { StickerFace } from "./StickerFace";

const FUN: Record<Fun, { label: string; kira: string }> = {
  1: { label: "ふつう", kira: "ノーマル" },
  2: { label: "ちょっと楽しい", kira: "シルバー" },
  3: { label: "楽しい", kira: "ゴールド" },
  4: { label: "最高に楽しい", kira: "ホロ" },
};

const ENERGY: { n: Energy; label: string; hint: string }[] = [
  { n: 1, label: "ラク", hint: "ゴロ寝でもできる" },
  { n: 2, label: "ふつう", hint: "ふつうにやる" },
  { n: 3, label: "重い", hint: "気合いが要る" },
];

const LOSS: { n: Loss; label: string }[] = [
  { n: 1, label: "平気" },
  { n: 2, label: "ちょっと困る" },
  { n: 3, label: "かなり痛い" },
];

/** 2〜5分で始められる「最初の一歩」の例 */
const STARTERS = ["道具を出すだけ", "タイマー3分だけやる", "とりあえず開く"];

const DATE_CHIPS = [
  { label: "今日", days: 0 },
  { label: "明日", days: 1 },
  { label: "3日後", days: 3 },
  { label: "1週間後", days: 7 },
];

const daysFromNow = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return ymd(d);
};

/**
 * 行動の追加・編集。同じ画面で、ステッカーのプレビューを見ながら直せる。
 * 保存するまでは何も変わらない(✕で破棄)。
 */
export function ActionEditor({
  action,
  initial,
  onClose,
  onSaved,
}: {
  /** 渡すと編集、なければ追加 */
  action?: Action;
  /** 追加するときの初期値(クイック追加から引き継ぐ) */
  initial?: Partial<ActionDraft>;
  onClose: () => void;
  /** 保存したとき(キャンセルでは呼ばれない) */
  onSaved?: () => void;
}) {
  const s = useStore();
  const [d, setD] = useState<ActionDraft>(() =>
    action ? draftFromAction(action) : { ...newDraft(initial?.group ?? FREE, initial?.title ?? ""), ...initial },
  );
  const set = (patch: Partial<ActionDraft>) => setD((x) => ({ ...x, ...patch }));
  const life = d.group === LIFE;
  const valid = isDraftValid(d);
  const groups = [...s.goals.map((g) => g.id), LIFE, FREE];
  const previewStarter = d.starter.trim() || (life && d.timing === "deadline" ? DEADLINE_STARTER : DEFAULT_STARTER);

  const save = () => {
    if (!valid) return;
    const fields = draftToFields(d);
    if (action) s.updateAction(action.id, fields);
    else s.addAction(fields);
    onSaved?.();
    onClose();
  };

  const remove = () => {
    if (!action || !confirm(`「${action.title}」をガチャから外しますか?`)) return;
    s.removeAction(action.id);
    onClose();
  };

  return (
    <div className="editor" role="dialog" aria-label={action ? "行動を編集" : "行動を追加"}>
      <div className="editor-head">
        <h2>{action ? "行動を編集" : "行動を追加"}</h2>
        <button className="ghost" onClick={onClose} aria-label="閉じる">✕</button>
      </div>

      <div className="editor-body">
        {/* 名前 + 楽しさ + プレビュー */}
        <div className="editor-top">
          <div className="sticker-preview" aria-hidden>
            <div key={d.fun} className={`sticker kira-${d.fun}`}>
              <StickerFace title={d.title.trim() || "名前を入れてね"} starter={previewStarter} fun={d.fun} />
            </div>
          </div>
          <div className="editor-top-fields">
            <input
              className="name-input"
              placeholder="名前(例: 散歩する)"
              value={d.title}
              onChange={(e) => set({ title: e.target.value })}
              autoFocus={!action && !d.title}
            />
            <div className="fun-pick" role="group" aria-label="楽しさ">
              {([1, 2, 3, 4] as Fun[]).map((n) => (
                <button key={n} className={n <= d.fun ? "on" : ""} aria-label={`楽しさ${n}`} onClick={() => set({ fun: n })}>
                  ★
                </button>
              ))}
            </div>
            <p className="field-hint">{FUN[d.fun].label} → {FUN[d.fun].kira}のステッカー</p>
          </div>
        </div>

        {/* どれに入れる? */}
        <div className="field">
          <div className="field-label">どれに入れる?</div>
          <div className="chips">
            {groups.map((k) => (
              <button key={k} className={`pick ${d.group === k ? "on" : ""}`} onClick={() => set({ group: k })}>
                <i className="dot" style={{ background: styleFor(k, s.goals).fill }} />
                <span>{labelFor(k, s.goals)}</span>
              </button>
            ))}
          </div>
          <p className="field-hint">
            {life ? "支払い・片付け・連絡など、放っておくと困ること" : d.group === FREE ? "どの目標にも入らない、ちょっとした楽しみや息抜き" : "この目標を進める行動"}
          </p>
        </div>

        {/* くらし・用事だけ: いつやる? / やらないとどうなる? */}
        {life && (
          <>
            <div className="field">
              <div className="field-label">いつやる?</div>
              <div className="segmented">
                <button className={d.timing === "repeat" ? "active" : ""} onClick={() => set({ timing: "repeat" })}>くり返す</button>
                <button className={d.timing === "deadline" ? "active" : ""} onClick={() => set({ timing: "deadline" })}>期限がある</button>
              </div>
              {d.timing === "repeat" ? (
                <>
                  <div className="chips">
                    {intervalChoices(d.intervalDays).map((n) => (
                      <button key={n} className={`pick ${d.intervalDays === n ? "on" : ""}`} onClick={() => set({ intervalDays: n })}>
                        {intervalLabel(n)}
                      </button>
                    ))}
                  </div>
                  <p className="field-hint">間があくほど、ガチャに出やすくなります。</p>
                </>
              ) : (
                <>
                  <div className="chips">
                    {DATE_CHIPS.map((c) => (
                      <button key={c.label} className={`pick ${d.deadline === daysFromNow(c.days) ? "on" : ""}`} onClick={() => set({ deadline: daysFromNow(c.days) })}>
                        {c.label}
                      </button>
                    ))}
                    <input type="date" className="date-input" value={d.deadline} onChange={(e) => set({ deadline: e.target.value })} aria-label="期限の日付" />
                  </div>
                  <p className="field-hint">{d.deadline ? "近づくほど、ガチャに出やすくなります。" : "日付を選んでください。"}</p>
                </>
              )}
            </div>

            <div className="field">
              <div className="field-label">やらないとどうなる?</div>
              <div className="chips">
                {LOSS.map((l) => (
                  <button key={l.n} className={`pick ${d.loss === l.n ? "on" : ""}`} onClick={() => set({ loss: l.n })}>
                    {l.label}
                  </button>
                ))}
              </div>
              <p className="field-hint">痛いほど、早めに出やすくなります。</p>
            </div>
          </>
        )}

        {/* しんどさ */}
        <div className="field">
          <div className="field-label">やるのはどれくらいしんどい?</div>
          <div className="energy-pick">
            {ENERGY.map((e) => (
              <button key={e.n} className={d.energy === e.n ? "on" : ""} onClick={() => set({ energy: e.n })}>
                <b>{e.label}</b>
                <small>{e.hint}</small>
              </button>
            ))}
          </div>
          <p className="field-hint">疲れている日は、ラクなものが出やすくなります。</p>
        </div>

        {/* 最初の一歩 */}
        <div className="field">
          <div className="field-label">最初の一歩(2〜5分で始められること)</div>
          <input placeholder={DEFAULT_STARTER} value={d.starter} onChange={(e) => set({ starter: e.target.value })} />
          <div className="chips tight">
            {STARTERS.map((t) => (
              <button key={t} className="pick small" onClick={() => set({ starter: t })}>{t}</button>
            ))}
          </div>
          <p className="field-hint">ステッカーに大きく出ます。空のままだと上の文になります。</p>
        </div>

        {action && (
          <button className="ghost danger" onClick={remove}>この行動をガチャから外す</button>
        )}
      </div>

      <div className="editor-foot">
        <button className="primary" onClick={save} disabled={!valid}>
          {action ? "保存する" : "追加する"}
        </button>
      </div>
    </div>
  );
}
