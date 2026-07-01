import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

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

type Status = "scanning" | "fetching" | "error";

export function BarcodeScanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const readerRef = useRef<BrowserMultiFormatReader | null>(null);
  const [status, setStatus] = useState<Status>("scanning");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    readerRef.current = reader;
    let stopped = false;

    const stopStream = (stream: MediaStream | null) => {
      if (stream) stream.getTracks().forEach((t) => t.stop());
    };

    let activeStream: MediaStream | null = null;

    reader.decodeFromVideoDevice(undefined, videoRef.current!, async (result, err) => {
      if (stopped) return;
      if (!result) return;
      if (err && (err as Error).name === "NotFoundException") return;

      const barcode = result.getText();
      stopped = true;
      stopStream(activeStream);
      setStatus("fetching");

      try {
        const res = await fetch(
          `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`,
        );
        const data = await res.json();

        if (data.status !== 1) {
          setErrorMsg("商品が見つかりませんでした");
          setStatus("error");
          return;
        }

        const p = data.product;
        const n = p.nutriments ?? {};
        const per100 = (key: string) => Number(n[key + "_100g"] ?? n[key] ?? 0);

        // serving size があれば使う、なければ 100g 換算
        const servingG = Number(p.serving_quantity) || 100;
        const ratio = servingG / 100;

        onResult({
          name: (p.product_name_ja || p.product_name || p.abbreviated_product_name || "不明").slice(0, 40),
          protein: Math.round(per100("proteins") * ratio * 10) / 10,
          fat: Math.round(per100("fat") * ratio * 10) / 10,
          carb: Math.round(per100("carbohydrates") * ratio * 10) / 10,
          calories: Math.round(per100("energy-kcal") * ratio),
        });
      } catch {
        setErrorMsg("通信エラー。Wi-Fi を確認してください");
        setStatus("error");
      }
    }).then((controls) => {
      // controls が返る場合はそのストリームを保持
      if (controls && "stream" in controls) {
        activeStream = (controls as { stream: MediaStream }).stream;
      }
    }).catch((e: unknown) => {
      setErrorMsg((e as Error).message ?? "カメラを起動できませんでした");
      setStatus("error");
    });

    return () => {
      stopped = true;
      stopStream(activeStream);
      // videoRef のカメラストリームも停止
      if (videoRef.current?.srcObject instanceof MediaStream) {
        (videoRef.current.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      }
    };
  }, [onResult]);

  return (
    <div className="barcode-overlay">
      <div className="barcode-modal">
        <button className="barcode-close" onClick={onClose}>✕</button>
        <h3>バーコードをスキャン</h3>

        {status === "scanning" && (
          <>
            <p className="barcode-hint">商品のバーコードをカメラに向けてください</p>
            <div className="video-wrap">
              <video ref={videoRef} className="barcode-video" />
              <div className="scan-line" />
            </div>
          </>
        )}

        {status === "fetching" && (
          <div className="barcode-loading">
            <div className="spinner" />
            <p>栄養情報を取得中…</p>
          </div>
        )}

        {status === "error" && (
          <div className="barcode-error">
            <p>⚠️ {errorMsg}</p>
            <button className="btn" onClick={() => setStatus("scanning")}>
              再スキャン
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
