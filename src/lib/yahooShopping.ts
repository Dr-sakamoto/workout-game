// JANコード(バーコード)から正規の商品名を取得する。
// コミュニティDBは「最初にスキャンした人がAIに推測させた名前」が全員の
// 表記になってしまうと表記ゆれが発生するため、可能な限りここで正規名を
// 確定させてから撮影・登録に進む。取得できなければ従来の撮影フローへ。
export async function lookupCanonicalProductName(barcode: string): Promise<string | null> {
  let res: Response;
  try {
    res = await fetch(`/api/yahoo-jan?code=${encodeURIComponent(barcode)}`);
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const data = await res.json();
  return typeof data?.name === "string" && data.name.trim() ? data.name.trim() : null;
}
