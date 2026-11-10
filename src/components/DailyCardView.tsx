import { useState } from "react";
import { useStore } from "../store/useStore";
import type { DailyCard } from "../domain/types";
import { parseYmd } from "../domain/dates";
import { sound } from "../lib/sound";
import { StickerFace } from "./StickerFace";
import { stayDay } from "../domain/engine";

type Confirm = { kind: "sticker"; id: string } | null;

/** live=操作できる / reveal=出てきた直後の演出 / tribute=上納中 */
export type CardMode = "live" | "reveal" | "tribute";

function Stamp({ pressing }: { pressing: boolean }) {
  return (
    <div className={`stamp-tool ${pressing ? "pressing" : ""}`} aria-hidden>
      <span className="stamp-knob" />
      <span className="stamp-neck" />
      <span className="stamp-base" />
    </div>
  );
}

export function DailyCardView({ card, mode }: { card: DailyCard; mode: CardMode }) {
  const { draws, actions, cards, completeSticker } = useStore();
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [pressing, setPressing] = useState<string | null>(null);
  const [shake, setShake] = useState(false);
  const live = mode === "live";

  const stickers = card.drawIds
    .map((id) => draws.find((d) => d.id === id))
    .filter((d) => d !== undefined)
    .map((d) => ({ draw: d, action: actions.find((a) => a.id === d.actionId) }))
    .filter((x) => x.action !== undefined); // 出た順(残留枠は最初に入るので左端)
  const stayN = card.stayId ? stayDay(card, cards, draws) : 0;

  const press = (key: string, commit: () => void, heavy = false) => {
    setPressing(key);
    setTimeout(() => {
      if (heavy) sound.stampHeavy();
      else sound.stamp();
      commit();
      setShake(true);
    }, 280);
    setTimeout(() => {
      setPressing(null);
      setConfirm(null);
      setShake(false);
    }, 700);
  };

  const d = parseYmd(card.date);
  const question = confirm ? "このタスクが終わりましたか?" : null;

  return (
    <div className={`daily-card mode-${mode} ${shake ? "shake" : ""}`}>
      <div className={`card-head ${question ? "asking" : ""}`}>
        {question ?? (
          <>
            <span>{d.getMonth() + 1}月{d.getDate()}日のカード</span>
            <span className="card-count">
              {stickers.filter((s) => s.draw.outcome === "done").length}/{stickers.length}
            </span>
          </>
        )}
      </div>

      <div className="stickers">
        {stickers.map(({ draw, action }, i) => {
          const a = action!;
          const done = draw.outcome === "done";
          const asking = confirm?.kind === "sticker" && confirm.id === draw.id;
          const stay = draw.id === card.stayId;
          return (
            <div
              key={draw.id}
              className={`sticker kira-${a.fun} ${done ? "done" : ""} ${asking ? "asking" : ""} ${stay ? "stay" : ""}`}
              style={{ animationDelay: `${0.25 + i * 0.12}s` }}
              onClick={() => {
                if (!live || done || pressing) return;
                setConfirm(asking ? null : { kind: "sticker", id: draw.id });
              }}
            >
              <StickerFace title={a.title} starter={a.starter} fun={a.fun} />
              {stay && <div className="stay-tag">残留 {stayN}日目</div>}
              {asking && pressing !== draw.id && (
                <div className="sticker-confirm" onClick={(e) => e.stopPropagation()}>
                  <button className="yes" onClick={() => press(draw.id, () => completeSticker(draw.id), a.energy === 3)}>はい</button>
                  <button onClick={() => setConfirm(null)}>いいえ</button>
                </div>
              )}
              {(asking || pressing === draw.id) && <Stamp pressing={pressing === draw.id} />}
              {done && <div className={`imprint ${a.energy === 3 ? "hard" : ""}`}>完了</div>}
            </div>
          );
        })}
        {stickers.length === 0 && <p className="card-empty">行動が登録されていません</p>}
      </div>

      {mode === "tribute" && <div className="tribute-label">上納</div>}
    </div>
  );
}
