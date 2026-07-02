// Vercel サーバーレス関数: JANコードから正規の商品名を引く。
// Yahoo!ショッピング商品検索APIはサーバーサイド利用が前提でCORS対応も不明なため、
// ここでサーバー側から呼び出しクライアントには結果のみ返す（appidも露出させない）。
export default async function handler(req: any, res: any) {
  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!/^\d{8,14}$/.test(code)) {
    res.status(400).json({ name: null });
    return;
  }

  const appId = process.env.YAHOO_APP_ID;
  if (!appId) {
    res.status(200).json({ name: null });
    return;
  }

  const url =
    `https://shopping.yahooapis.jp/ShoppingWebService/V3/itemSearch` +
    `?appid=${encodeURIComponent(appId)}&jan_code=${encodeURIComponent(code)}&results=1`;

  try {
    const r = await fetch(url);
    if (!r.ok) {
      res.status(200).json({ name: null });
      return;
    }
    const data = await r.json();
    const name: string | undefined = data?.hits?.[0]?.name;
    res.status(200).json({ name: name ?? null });
  } catch {
    res.status(200).json({ name: null });
  }
}
