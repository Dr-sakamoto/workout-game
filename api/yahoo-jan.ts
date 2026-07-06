// Vercel サーバーレス関数: JANコードから正規の商品名を引く。
// Yahoo!ショッピング商品検索APIはサーバーサイド利用が前提でCORS対応も不明なため、
// ここでサーバー側から呼び出しクライアントには結果のみ返す（appidも露出させない）。
//
// 失敗はすべて {name:null} に潰れて原因が追えなかったので、reason を添えて
// Vercel のランタイムログにも残す（未設定・上流エラー・単なる未ヒットを区別する）。
export default async function handler(req: any, res: any) {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!/^\d{8,14}$/.test(code)) {
    res.status(400).json({ name: null, reason: "bad-code" });
    return;
  }

  const appId = process.env.YAHOO_APP_ID;
  if (!appId) {
    console.warn("yahoo-jan: YAHOO_APP_ID が未設定のため商品名を引けません");
    res.status(200).json({ name: null, reason: "unconfigured" });
    return;
  }

  const url =
    `https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch` +
    `?appid=${encodeURIComponent(appId)}&jan_code=${encodeURIComponent(code)}&results=1`;

  try {
    const r = await fetch(url);
    if (!r.ok) {
      console.warn(`yahoo-jan: 上流APIがエラー応答 status=${r.status} code=${code}`);
      res.status(200).json({ name: null, reason: `upstream-${r.status}` });
      return;
    }
    const data = await r.json();
    const name: string | undefined = data?.hits?.[0]?.name;
    if (!name) console.info(`yahoo-jan: 未ヒット code=${code}`);
    res.status(200).json({ name: name ?? null, reason: name ? undefined : "not-found" });
  } catch (e) {
    console.warn(`yahoo-jan: 呼び出し失敗 code=${code}`, e);
    res.status(200).json({ name: null, reason: "fetch-error" });
  }
}
