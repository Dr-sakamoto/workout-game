import { useRef, useState } from "react";
import { currentWeek, useStore } from "../store/useStore";
import type { Action, Priority } from "../domain/types";
import { FREE, LIFE, groupOf, sliceKeys } from "../domain/shares";
import { draftToFields, intervalLabel, newDraft, type ActionDraft } from "../domain/actionDraft";
import { daysUntil } from "../domain/dates";
import { ActionEditor } from "./ActionEditor";
import { labelFor, styleFor } from "./sliceStyle";

const PRIORITY: Record<Priority, { label: string; next: Priority }> = {
  normal: { label: "ふつう", next: "high" },
  high: { label: "優先", next: "off" },
  off: { label: "休み", next: "normal" },
};

/** 行の補足: 期限 or くり返し */
function timing(a: Action): { text: string; warn: boolean } | undefined {
  if (a.deadline) {
    const d = daysUntil(a.deadline, new Date());
    return { text: d < 0 ? `${-d}日超過` : d === 0 ? "今日まで" : `あと${d}日`, warn: d <= 0 };
  }
  if (a.intervalDays) return { text: intervalLabel(a.intervalDays), warn: false };
  return undefined;
}

function Row({ a, onOpen }: { a: Action; onOpen: () => void }) {
  const s = useStore();
  const p = currentWeek(s).priorities[a.id] ?? "normal";
  const t = timing(a);
  return (
    <li className={`action-row ${p === "off" ? "paused" : ""}`}>
      <button className="action-main" onClick={onOpen} aria-label={`${a.title}を編集`}>
        <span className="action-title">{a.title}</span>
        {t && <span className={t.warn ? "danger" : "muted"}>{t.text}</span>}
        <span className="muted">›</span>
      </button>
      <div className="action-ctl">
        <span className="stars" role="group" aria-label="楽しさ">
          {[1, 2, 3, 4].map((n) => (
            <button key={n} className={n <= a.fun ? "on" : ""} aria-label={`楽しさ${n}`} onClick={() => s.updateAction(a.id, { fun: n as 1 | 2 | 3 | 4 })}>
              ★
            </button>
          ))}
        </span>
        <button className={`chip ${p}`} onClick={() => s.setPriority(a.id, PRIORITY[p].next)}>
          今週 {PRIORITY[p].label}
        </button>
      </div>
    </li>
  );
}

/**
 * 行動の一覧。名前を打って、入れる枠を選んで追加できる(細かい設定は「くわしく」から)。
 * 一覧では★と今週の出やすさをその場で変えられ、行をタップすると編集画面が開く。
 */
export function ActionsScreen() {
  const s = useStore();
  const [title, setTitle] = useState("");
  const [group, setGroup] = useState<string>(FREE);
  const [flash, setFlash] = useState("");
  const [editor, setEditor] = useState<{ action?: Action; initial?: Partial<ActionDraft> } | null>(null);
  const flashTimer = useRef<number>();
  const active = s.actions.filter((a) => !a.archived);
  const keys = sliceKeys(s.actions, s.goals.map((g) => g.id));
  // 追加で選べる枠: 目標 + くらし + そのほか(まだ行動のない枠も選べる)
  const choices = [...s.goals.map((g) => g.id), LIFE, FREE];

  const quickAdd = () => {
    const name = title.trim();
    if (!name) return;
    s.addAction(draftToFields(newDraft(group, name)));
    setTitle("");
    setFlash(`「${name}」を追加しました`);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(""), 2500);
  };

  return (
    <div>
      <h1>行動</h1>

      <form
        className="quick-add"
        onSubmit={(e) => {
          e.preventDefault();
          quickAdd();
        }}
      >
        <div className="add-row">
          <input placeholder="やりたいこと・やるべきことを追加" value={title} onChange={(e) => setTitle(e.target.value)} />
          <button type="submit" disabled={!title.trim()}>追加</button>
        </div>
        {title.trim() && (
          <div className="quick-pick">
            <span className="muted">どれに入れる?</span>
            <div className="chips">
              {choices.map((k) => (
                <button type="button" key={k} className={`pick ${group === k ? "on" : ""}`} onClick={() => setGroup(k)}>
                  <i className="dot" style={{ background: styleFor(k, s.goals).fill }} />
                  <span>{labelFor(k, s.goals)}</span>
                </button>
              ))}
            </div>
            <button type="button" className="link" onClick={() => setEditor({ initial: { title: title.trim(), group } })}>
              くわしく設定する →
            </button>
          </div>
        )}
        {flash && <p className="flash-msg">{flash}</p>}
      </form>

      <p className="muted legend-help">★ = 楽しさ(多いほどキラキラのステッカー)　右のボタン = 今週の出やすさ(タップで切り替え)　行をタップ = くわしく編集</p>

      {keys.map((k) => {
        const rows = active
          .filter((a) => groupOf(a) === k)
          .sort((a, b) => (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") || a.createdAt - b.createdAt);
        return (
          <section key={k}>
            <h3 className="group-head">
              <i className="dot" style={{ background: styleFor(k, s.goals).fill }} />
              {labelFor(k, s.goals)}
            </h3>
            <ul className="list">
              {rows.map((a) => (
                <Row key={a.id} a={a} onOpen={() => setEditor({ action: a })} />
              ))}
            </ul>
          </section>
        );
      })}

      {editor && (
        <ActionEditor
          key={editor.action?.id ?? "new"}
          action={editor.action}
          initial={editor.initial}
          onSaved={() => !editor.action && setTitle("")}
          onClose={() => setEditor(null)}
        />
      )}
    </div>
  );
}
