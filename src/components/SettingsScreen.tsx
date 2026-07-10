import { useEffect, useRef, useState } from "react";
import { useGameStore, STORAGE_KEY, todayKey } from "../store/useGameStore";
import { pushFreshStateAfterReset } from "../store/cloudSync";
import { isSupabaseConfigured, getLinkedEmail, linkEmailToCurrentSession, signInWithEmailLink } from "../lib/supabase";
import { soundEngine } from "../sounds/soundEngine";
import { SCHEDULE_PRESETS, effectiveSchedule } from "../domain/schedule";

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// P3(SYNC_DESIGN.md): 匿名認証だけでは端末のキャッシュクリアで進捗が消えて
// しまう。メールを紐づけて初めて「復帰可能な身元」が生まれる。
// - 「このデータを保護する」: 今使っている端末の進捗にメールを紐づける
// - 「別の端末のデータを呼び出す」: 既に紐づけたメールでこの端末にサインイン
//   (この端末に既存の進捗があっても、ログ単位マージ(P4)で自動的に統合される)
function EmailLinkSection() {
  const [linkedEmail, setLinkedEmail] = useState<string | null | undefined>(undefined);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void getLinkedEmail().then(setLinkedEmail);
  }, []);

  const protect = async () => {
    if (!isValidEmail(email)) {
      setMsg("メールアドレスの形式が正しくありません");
      return;
    }
    setBusy(true);
    const error = await linkEmailToCurrentSession(email);
    setBusy(false);
    soundEngine.play("click");
    setMsg(
      error
        ? `送信できませんでした（${error}）`
        : "確認メールを送りました。メール内のリンクを開くとこのデータが保護されます。",
    );
  };

  const signIn = async () => {
    if (!isValidEmail(email)) {
      setMsg("メールアドレスの形式が正しくありません");
      return;
    }
    setBusy(true);
    const error = await signInWithEmailLink(email);
    setBusy(false);
    soundEngine.play("click");
    setMsg(
      error
        ? `送信できませんでした（${error}）`
        : "ログイン用のメールを送りました。メール内のリンクを開くと、この端末の記録と自動的に統合されます。",
    );
  };

  if (linkedEmail === undefined) return null; // 読み込み中は何も出さない

  return (
    <div className="settings-section">
      <div className="settings-section-title">メールで引き継ぎ</div>
      {linkedEmail ? (
        <p className="hint">✅ {linkedEmail} で保護されています</p>
      ) : (
        <>
          <p className="hint" style={{ marginBottom: 8 }}>
            機種変・キャッシュクリアに備えて、この記録をメールアドレスに紐づけて
            おこう。別の端末で同じメールを使えば記録を呼び出せる。
          </p>
          <input
            type="email"
            placeholder="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            style={{ marginBottom: 8 }}
          />
          <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
            <button className="btn full" disabled={busy} onClick={() => void protect()}>
              このデータを保護する
            </button>
          </div>
          <button className="btn full secondary" disabled={busy} onClick={() => void signIn()}>
            別の端末のデータを呼び出す
          </button>
          {msg && <p className="hint" style={{ marginTop: 8 }}>{msg}</p>}
        </>
      )}
    </div>
  );
}

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const [seOn, setSeOn] = useState(soundEngine.seOn);
  const [confirmReset, setConfirmReset] = useState(false);
  const [backupMsg, setBackupMsg] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // 機種変・キャッシュクリアでの全データ消失(ISSUES.md A-2)への一次対応。
  // 保存形式は zustand persist の生JSONそのまま(読み込みは書き戻すだけ)。
  const exportBackup = () => {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      setBackupMsg("保存データがありません");
      return;
    }
    const blob = new Blob([raw], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kintore-quest-backup-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    soundEngine.play("click");
    setBackupMsg("書き出しました。ファイルを安全な場所に保管してください");
  };

  const importBackup = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      // persist形式( {state: {...}, version } )で、プロフィールを持つことだけ確認
      if (!parsed || typeof parsed !== "object" || !parsed.state?.profile) {
        throw new Error("invalid");
      }
      const name = String(parsed.state.profile.name ?? "?");
      const level = Number(parsed.state.avatar?.level ?? 1);
      if (!window.confirm(`「${name}」(Lv.${level}) のバックアップで今のデータを上書きします。よろしいですか？`)) {
        return;
      }
      localStorage.setItem(STORAGE_KEY, text);
      location.reload(); // ストアを丸ごと読み直す
    } catch {
      setBackupMsg("読み込めませんでした。このアプリのバックアップファイルか確認してください");
    }
  };
  const resetAll = useGameStore((s) => s.resetAll);
  const profile = useGameStore((s) => s.profile);
  const changeSchedule = useGameStore((s) => s.changeSchedule);
  const syncEnabled = useGameStore((s) => s.syncEnabled);
  const setSyncEnabled = useGameStore((s) => s.setSyncEnabled);
  const currentDays = effectiveSchedule(profile?.trainingDays);
  const currentId =
    SCHEDULE_PRESETS.find((s) => s.days.join(",") === [...currentDays].sort((a, b) => a - b).join(","))?.id ?? "";

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span className="settings-title">⚙ 設定</span>
          <button className="settings-close" onClick={onClose}>✕</button>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">サウンド</div>
          <label className="settings-row">
            <span>SE（効果音）</span>
            <span className="toggle-switch">
              <input
                type="checkbox"
                checked={seOn}
                onChange={(e) => {
                  soundEngine.setSEOn(e.target.checked);
                  setSeOn(e.target.checked);
                  if (e.target.checked) soundEngine.play("click");
                }}
              />
              <span className="toggle-track" />
            </span>
          </label>
        </div>

        <div className="settings-section">
          <div className="settings-section-title">トレーニングの頻度</div>
          <p className="hint" style={{ marginBottom: 8 }}>
            予定日にトレするとストリークが伸びる。基本は据え置きでコツコツと。
          </p>
          <div className="sched-grid">
            {SCHEDULE_PRESETS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`sched-card ${currentId === s.id ? "active" : ""}`}
                onClick={() => { changeSchedule(s.days); soundEngine.play("select"); }}
              >
                <span className="sched-emoji">{s.emoji}</span>
                <span className="sched-label">{s.label}</span>
                <span className="sched-desc">{s.desc}</span>
              </button>
            ))}
          </div>
        </div>

        {isSupabaseConfigured() && (
          <div className="settings-section">
            <div className="settings-section-title">クラウド同期</div>
            <p className="hint" style={{ marginBottom: 8 }}>
              ONにすると、この端末の記録が自動でクラウドに保存される。他の端末で
              同じアカウントに引き継げば記録を復元できる。
            </p>
            <label className="settings-row">
              <span>クラウド同期</span>
              <span className="toggle-switch">
                <input
                  type="checkbox"
                  checked={syncEnabled}
                  onChange={(e) => {
                    setSyncEnabled(e.target.checked);
                    soundEngine.play("click");
                  }}
                />
                <span className="toggle-track" />
              </span>
            </label>
          </div>
        )}

        {isSupabaseConfigured() && <EmailLinkSection />}

        <div className="settings-section">
          <div className="settings-section-title">データ</div>
          <p className="hint" style={{ marginBottom: 8 }}>
            データは端末内にのみ保存される。機種変・ブラウザのデータ削除に備えて
            バックアップを書き出しておこう。
          </p>
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <button className="btn full secondary" onClick={exportBackup}>
              📤 バックアップを書き出す
            </button>
            <button className="btn full secondary" onClick={() => fileRef.current?.click()}>
              📥 読み込む
            </button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importBackup(f);
              e.target.value = "";
            }}
          />
          {backupMsg && <p className="hint" style={{ marginBottom: 8 }}>{backupMsg}</p>}
          {!confirmReset ? (
            <button className="btn full secondary" onClick={() => setConfirmReset(true)}>
              データをリセット
            </button>
          ) : (
            <>
              <p className="hint" style={{ marginBottom: 10 }}>
                本当にリセットしますか？<br />全データが消えます。
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  className="btn full"
                  style={{ background: "var(--red)", borderColor: "#800", color: "#fff" }}
                  onClick={() => {
                    resetAll();
                    // クラウド同期中の場合、remoteも上書きしないと次回起動時の
                    // 自動プルでリセットが巻き戻ってしまう。
                    void pushFreshStateAfterReset();
                    onClose();
                  }}
                >
                  リセット
                </button>
                <button className="btn full secondary" onClick={() => setConfirmReset(false)}>
                  やめる
                </button>
              </div>
            </>
          )}
        </div>

        <div className="settings-section">
          <div className="settings-section-title">アプリ情報</div>
          <div className="settings-info-row">
            <span>バージョン</span>
            <span style={{ color: "var(--muted)" }}>1.0.0</span>
          </div>
          <div className="settings-info-row">
            <span>データ保存</span>
            <span style={{ color: "var(--muted)", fontSize: 8 }}>端末内（ローカル）</span>
          </div>
        </div>

        <button className="btn full secondary" style={{ marginTop: 8 }} onClick={onClose}>
          閉じる
        </button>
      </div>
    </div>
  );
}
