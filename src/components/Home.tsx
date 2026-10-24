import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { GachaScene } from "../three/GachaScene";
import { staleCards, todayCard, useStore } from "../store/useStore";
import { DailyCardView } from "./DailyCardView";
import { Settings } from "./Settings";
import { ymd } from "../domain/dates";
import { sound } from "../lib/sound";

/**
 * tribute=前日までのカードを上納中 / ready=ハンドルを回せる / dropping=カプセルが出てくる途中
 * capsule=カプセル待ち(タップで開く) / reveal=カードが出てくる演出 / card=今日のカードを表示中
 */
type Phase = "tribute" | "ready" | "dropping" | "capsule" | "reveal" | "card";

/** カードを置く領域の高さ(px) */
const cardArea = (h: number) => Math.min(Math.round(h * 0.4), 300);

export function Home() {
  const store = useStore();
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<GachaScene>();
  const phaseRef = useRef<Phase>("ready");
  const [phase, setPhaseState] = useState<Phase>(() => initialPhase());
  const [toast, setToast] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [day, setDay] = useState(() => ymd(new Date()));
  const [handlePos, setHandlePos] = useState<{ x: number; y: number; r: number } | null>(null);

  function initialPhase(): Phase {
    const s = useStore.getState();
    if (staleCards(s).length) return "tribute";
    return todayCard(s) ? "card" : "ready";
  }

  const setPhase = (p: Phase) => {
    phaseRef.current = p;
    setPhaseState(p);
  };
  phaseRef.current = phase;

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  };

  // 3Dシーン
  useLayoutEffect(() => {
    const scene = new GachaScene(hostRef.current!, {
      onTurned: () => {
        const card = useStore.getState().drawCard();
        if (!card) {
          setPhase("card");
          return;
        }
        const s = useStore.getState();
        const funs = card.drawIds.map((id) => {
          const d = s.draws.find((x) => x.id === id);
          return s.actions.find((a) => a.id === d?.actionId)?.fun ?? 1;
        });
        setPhase("dropping");
        void scene.dropCapsule(Math.max(1, ...funs)).then(() => setPhase("capsule"));
      },
      onCapsuleOpened: () => {
        setPhase("reveal");
        setTimeout(() => setPhase("card"), 1100);
      },
      onBodyTap: () => {
        if (phaseRef.current === "ready" || phaseRef.current === "card") setSettingsOpen(true);
      },
      onHandleMoved: (x, y, r) => setHandlePos({ x, y, r }),
      onLockedHandle: () => {
        if (phaseRef.current === "card") showToast("今日のカードは引いたよ。また明日回せます");
      },
    });
    sceneRef.current = scene;
    const fit = () => scene.setLayout(cardArea(window.innerHeight));
    fit();
    window.addEventListener("resize", fit);
    return () => {
      window.removeEventListener("resize", fit);
      scene.dispose();
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setHandleEnabled(phase === "ready");
  }, [phase]);

  // 日付の変わり目を見張る
  useEffect(() => {
    const check = () => {
      const now = ymd(new Date());
      if (now === day) return;
      setDay(now);
      const p = phaseRef.current;
      if (p === "card" || p === "ready") setPhase(staleCards(useStore.getState()).length ? "tribute" : "ready");
    };
    const id = setInterval(check, 20_000);
    document.addEventListener("visibilitychange", check);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", check);
    };
  }, [day]);

  // 上納の演出
  useEffect(() => {
    if (phase !== "tribute") return;
    const t1 = setTimeout(() => {
      sound.chime();
      sceneRef.current?.receiveTribute();
    }, 1300);
    const t2 = setTimeout(() => {
      store.tribute();
      setPhase("ready");
    }, 2300);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const stale = staleCards(store);
  const shown =
    phase === "tribute"
      ? [...stale].sort((a, b) => b.date.localeCompare(a.date))[0]
      : phase === "reveal" || phase === "card"
        ? todayCard(store)
        : undefined;

  return (
    <div className="home" style={{ "--card-area": `${cardArea(window.innerHeight)}px` } as React.CSSProperties}>
      <div className="world" ref={hostRef} />

      <div className="hint-top">本体をタップで設定</div>
      {phase === "ready" && <div className="hint">ハンドルをぐるっと1周まわそう</div>}
      {phase === "ready" && handlePos && (
        <div
          className="handle-guide"
          style={{ left: handlePos.x, top: handlePos.y, width: handlePos.r * 2.9, height: handlePos.r * 2.9 }}
        />
      )}
      {phase === "capsule" && <div className="hint pulse">タップして開けよう!</div>}
      {phase === "reveal" && <div className="flash" />}
      {toast && <div className="toast">{toast}</div>}

      <div className="card-area" style={{ height: cardArea(window.innerHeight) }}>
        {shown ? (
          <DailyCardView
            key={`${shown.date}-${phase === "tribute"}`}
            card={shown}
            mode={phase === "tribute" ? "tribute" : phase === "reveal" ? "reveal" : "live"}
          />
        ) : (
          phase === "ready" && <div className="card-slot">今日のカードはまだ引いていません</div>
        )}
      </div>

      {settingsOpen && <Settings onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
