import { useCallback, useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";
import { lookupCommunityFood, registerCommunityFood } from "../lib/supabase";
import { analyzeFoodPhotos } from "../lib/gemini";

interface FoodResult {
  name: string;
  protein: number;
  fat: number;
  carb: number;
  calories: number;
}

interface Props {
  onResult: (food: FoodResult) => void;
  onClose: () => void;
}

type Phase =
  | "scanning"
  | "found"
  | "photo-front"
  | "photo-back"
  | "analyzing"
  | "confirm"
  | "error";

export function BarcodeScanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const photoVideoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [phase, setPhase] = useState<Phase>("scanning");
  const [barcode, setBarcode] = useState("");
  const [frontPhoto, setFrontPhoto] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const [form, setForm] = useState<FoodResult>({ name: "", protein: 0, fat: 0, carb: 0, calories: 0 });

  const stopStream = (stream: MediaStream | null) => {
    stream?.getTracks().forEach((t) => t.stop());
  };

  // カメラ起動（撮影用）
  const startPhotoCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (photoVideoRef.current) photoVideoRef.current.srcObject = stream;
    } catch {
      setErrorMsg("カメラを起動できませんでした");
      setPhase("error");
    }
  }, []);

  // バーコードスキャン
  useEffect(() => {
    if (phase !== "scanning") return;
    const reader = new BrowserMultiFormatReader();
    let stopped = false;

    reader.decodeFromVideoDevice(undefined, videoRef.current!, async (result, err) => {
      if (stopped || !result) return;
      if (err && (err as Error).name === "NotFoundException") return;

      stopped = true;
      const code = result.getText();
      setBarcode(code);

      // まずコミュニティDBを検索
      try {
        const found = await lookupCommunityFood(code);
        if (found) {
          setForm(found);
          setPhase("found");
          return;
        }
      } catch {
        // DB接続失敗してもフォールバック
      }

      // なければ写真撮影フェーズへ
      stopStream(videoRef.current?.srcObject instanceof MediaStream ? videoRef.current.srcObject : null);
      setPhase("photo-front");
    });

    return () => {
      stopped = true;
      if (videoRef.current?.srcObject instanceof MediaStream) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
    };
  }, [phase]);

  // 撮影フェーズでカメラ起動
  useEffect(() => {
    if (phase === "photo-front" || phase === "photo-back") {
      startPhotoCamera();
    }
    return () => {
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [phase, startPhotoCamera]);

  const takePhoto = useCallback((): string => {
    const video = photoVideoRef.current!;
    const canvas = canvasRef.current!;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d")!.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.85);
  }, []);

  const handleFrontShot = () => {
    const dataUrl = takePhoto();
    setFrontPhoto(dataUrl);
    stopStream(streamRef.current);
    streamRef.current = null;
    setPhase("photo-back");
  };

  const handleBackShot = async () => {
    const backPhoto = takePhoto();
    stopStream(streamRef.current);
    streamRef.current = null;
    setPhase("analyzing");

    try {
      const result = await analyzeFoodPhotos(frontPhoto, backPhoto);
      setForm(result);
      setPhase("confirm");
    } catch (e) {
      setErrorMsg((e as Error).message);
      setPhase("error");
    }
  };

  const handleRegister = async () => {
    await registerCommunityFood({ barcode, ...form });
    onResult(form);
  };

  return (
    <div className="barcode-overlay">
      <div className="barcode-modal">
        <button className="barcode-close" onClick={onClose}>✕</button>

        {/* ① バーコードスキャン */}
        {phase === "scanning" && (
          <>
            <h3>バーコードをスキャン</h3>
            <p className="barcode-hint">商品のバーコードをカメラに向けてください</p>
            <div className="video-wrap">
              <video ref={videoRef} className="barcode-video" autoPlay playsInline muted />
              <div className="scan-line" />
            </div>
          </>
        )}

        {/* ② コミュニティDBで発見 */}
        {phase === "found" && (
          <>
            <h3>✅ 見つかりました</h3>
            <div className="found-card">
              <div className="found-name">{form.name}</div>
              <div className="found-pfc">
                P {form.protein}g ／ F {form.fat}g ／ C {form.carb}g ／ {form.calories}kcal
              </div>
            </div>
            <button className="btn full" onClick={() => onResult(form)}>この食品を記録</button>
          </>
        )}

        {/* ③ 表面撮影 */}
        {phase === "photo-front" && (
          <>
            <h3>📷 商品の表を撮影</h3>
            <p className="barcode-hint">コミュニティDBに未登録です。商品名を読み取ります。</p>
            <div className="video-wrap">
              <video ref={photoVideoRef} className="barcode-video" autoPlay playsInline muted />
            </div>
            <button className="btn full" onClick={handleFrontShot}>撮影</button>
          </>
        )}

        {/* ④ 裏面撮影 */}
        {phase === "photo-back" && (
          <>
            <h3>📷 栄養成分表示を撮影</h3>
            <p className="barcode-hint">パッケージ裏の栄養成分表示を写してください</p>
            <div className="video-wrap">
              <video ref={photoVideoRef} className="barcode-video" autoPlay playsInline muted />
            </div>
            <button className="btn full" onClick={handleBackShot}>撮影して解析</button>
          </>
        )}

        {/* ⑤ Gemini解析中 */}
        {phase === "analyzing" && (
          <div className="barcode-loading">
            <div className="spinner" />
            <p>AIが栄養成分を読み取り中…</p>
          </div>
        )}

        {/* ⑥ 確認・修正・登録 */}
        {phase === "confirm" && (
          <>
            <h3>内容を確認</h3>
            <p className="barcode-hint">修正してからコミュニティに登録できます</p>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="商品名"
              style={{ marginBottom: 8 }}
            />
            <div className="inline-inputs">
              <input type="number" placeholder="P(g)" value={form.protein}
                onChange={(e) => setForm((f) => ({ ...f, protein: Number(e.target.value) }))} />
              <input type="number" placeholder="F(g)" value={form.fat}
                onChange={(e) => setForm((f) => ({ ...f, fat: Number(e.target.value) }))} />
              <input type="number" placeholder="C(g)" value={form.carb}
                onChange={(e) => setForm((f) => ({ ...f, carb: Number(e.target.value) }))} />
              <input type="number" placeholder="kcal" value={form.calories}
                onChange={(e) => setForm((f) => ({ ...f, calories: Number(e.target.value) }))} />
            </div>
            <button className="btn full" style={{ marginTop: 12 }} onClick={handleRegister}>
              コミュニティに登録して記録
            </button>
            <button className="btn-ghost" onClick={() => onResult(form)}>
              登録せずに記録だけする
            </button>
          </>
        )}

        {/* エラー */}
        {phase === "error" && (
          <div className="barcode-error">
            <p>⚠️ {errorMsg}</p>
            <button className="btn" onClick={() => setPhase("scanning")}>再スキャン</button>
          </div>
        )}

        <canvas ref={canvasRef} style={{ display: "none" }} />
      </div>
    </div>
  );
}
