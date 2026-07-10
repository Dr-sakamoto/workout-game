import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

// アカウント同期(lib/sync.ts)からも直接使うため export する。
export const supabase = url && key ? createClient(url, key) : null;

export function isSupabaseConfigured(): boolean {
  return supabase !== null;
}

// 匿名セッションの確保。ここに置く理由: community_foods への書き込みはP2で
// 「認証済みユーザーのみ」のRLSに締めたため(B-2)、アカウント同期(syncEnabled)の
// ON/OFFに関わらず、バーコード登録など同期を経由しない書き込みにもセッションが
// 要る。lib/sync.ts からも使うが、supabase クライアントと一緒にこちらへ置くことで
// supabase.ts ⇄ sync.ts の循環importを避けている。
export async function ensureSession(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  if (data.session?.user) return data.session.user.id;

  const signIn = await supabase.auth.signInAnonymously();
  if (signIn.error || !signIn.data.session) {
    console.warn(
      "supabase: 匿名サインインに失敗しました(Supabaseプロジェクトで Anonymous Sign-Ins が無効になっている可能性があります)",
      signIn.error,
    );
    return null;
  }
  return signIn.data.session.user.id;
}

// P3(SYNC_DESIGN.md): 匿名認証だけでは端末のキャッシュクリアでデータが
// 消えるため、復帰可能な身元(メール)を紐づけて初めて真の耐久性が生まれる。
//
// 現在の端末(既に進捗がある側)を保護する: 匿名セッションにメールを
// 紐づける。確認メール内のリンクをクリックするまでは反映されない。
// (auth.updateUser は既存のuser_idを維持したまま email を追加する)
export async function linkEmailToCurrentSession(email: string): Promise<string | null> {
  if (!supabase) return "unconfigured";
  const { error } = await supabase.auth.updateUser(
    { email },
    { emailRedirectTo: window.location.origin },
  );
  return error ? error.message : null;
}

// 別の端末で、既にメールを紐づけたアカウントにサインインする(マジックリンク)。
// この端末に既存の進捗があっても、次回同期時にログ単位マージ(P4)で
// 安全に統合される(データは失われない)。
export async function signInWithEmailLink(email: string): Promise<string | null> {
  if (!supabase) return "unconfigured";
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  });
  return error ? error.message : null;
}

/** 現在のセッションに紐づいているメールアドレス(未紐づけなら null) */
export async function getLinkedEmail(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getUser();
  return data.user?.email ?? null;
}

export interface CommunityFood {
  barcode: string;
  name: string;
  protein: number;
  fat: number;
  carb: number;
  calories: number;
}

// 誰でも上書き登録できる共有DBなので、負の値・非数・桁違いの異常値が
// 混入しうる(いたずら/入力ミス)。そのまま通すと全ユーザーの記録と
// コンディション計算(EXP補正)を汚染するため、参照時・登録時の両方で
// 常識的な範囲にクランプする。上限は「1食分としてありえない」水準で判定。
const NUTRITION_LIMITS = { protein: 300, fat: 300, carb: 500, calories: 3000 } as const;

function clampNutrient(value: unknown, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.min(max, Math.max(0, Math.round(n * 10) / 10));
}

function sanitizeFood(food: CommunityFood): CommunityFood {
  return {
    barcode: food.barcode,
    name: normalizeName(String(food.name ?? "")),
    protein: clampNutrient(food.protein, NUTRITION_LIMITS.protein),
    fat: clampNutrient(food.fat, NUTRITION_LIMITS.fat),
    carb: clampNutrient(food.carb, NUTRITION_LIMITS.carb),
    calories: clampNutrient(food.calories, NUTRITION_LIMITS.calories),
  };
}

export async function lookupCommunityFood(barcode: string): Promise<CommunityFood | null> {
  if (!supabase) return null;
  const { data } = await supabase
    .from("community_foods")
    .select("barcode,name,protein,fat,carb,calories")
    .eq("barcode", barcode)
    .single();
  return data ? sanitizeFood(data) : null;
}

// 誰でも上書き登録できる Wikipedia 的な共有DB。表記ゆれを完全には防げない
// ので、せめて空白まわりだけは投稿のたびに正規化しておく。
function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

export async function registerCommunityFood(food: CommunityFood): Promise<void> {
  if (!supabase) return;
  // 書き込みには認証済みセッションが要る(RLS: community_foods_write/amend)。
  // 匿名サインインが無効化されている環境ではここが静かに失敗し、以降の
  // upsert はRLSに弾かれる。呼び出し側は元々 catch 済みなので記録自体は続行する。
  await ensureSession();
  await supabase
    .from("community_foods")
    .upsert(sanitizeFood(food), { onConflict: "barcode" });
}
