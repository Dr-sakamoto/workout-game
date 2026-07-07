// Open Food Facts: バーコード(JAN/EAN)から商品情報を引ける無料の共有DB。
// APIキー不要・CORS対応なのでクライアントから直接呼べる。
// Yahoo商品検索(要YAHOO_APP_ID・サーバー経由)が未設定/未ヒットのときの
// フォールバックとして商品名のヒット率を上げる。
export async function lookupOpenFoodFactsName(barcode: string): Promise<string | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=product_name,product_name_ja`,
      { headers: { Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const p = data?.product;
    // 日本語名があれば優先。どちらも無ければ未ヒット扱い
    const name = String(p?.product_name_ja || p?.product_name || "").trim();
    return name || null;
  } catch {
    return null;
  }
}
