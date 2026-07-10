# アカウント同期 設計方針（A-2 根本対応）

> 決定日: 2026-07-09 ／ 対象: ISSUES.md A-2「localStorage のみの永続化・データ消失」
> ステータス: **方針確定（実装前）**。オーナー判断（アンケート）で以下を決定:
> 1. 耐久性モデル = **匿名認証 + メール連携**
> 2. データ形式 = **1ユーザー=1行の JSON（jsonb）**
> 3. 競合解決 = **LWW + 進捗ガード（段階的。将来ログ単位マージへ昇格）**

## 0. 最重要の前提（設計の出発点）

**匿名認証だけでは A-2 は解決しない。** Supabase の匿名セッショントークンは
localStorage に保存されるため、キャッシュクリア/機種変で身元ごと消え、クラウドに
データがあっても取り戻せない。したがって:

- **匿名認証** = 摩擦ゼロで始める土台 + 同期インフラを載せる器。単独では永続性を保証しない。
- **真の耐久性** = ユーザーが復帰可能な身元（メールのマジックリンク）を紐づけたときに生まれる。
- **JSON バックアップ書き出し/読み込み**（実装済み）= アカウント不要の最終フォールバックとして共存。

この3層（匿名で即開始 → メール連携で耐久化 → 手動バックアップで保険）を重ねる。

## 1. データモデル（Supabase）

### テーブル `game_saves`（1ユーザー=1行）

| 列 | 型 | 説明 |
|----|----|----|
| `user_id` | `uuid` PK | `references auth.users(id) on delete cascade` |
| `state` | `jsonb` | ゲーム状態の耐久フィールドのみ（下記 `serializeForSync`） |
| `schema_version` | `int` | クライアントの `STORE_VERSION`。将来のマイグレーション判定用 |
| `revision` | `bigint` | プッシュのたび +1 する単調カウンタ。楽観的同時実行制御に使う |
| `total_exp` | `bigint` | 進捗ガード用に非正規化（jsonb を開かず比較・クエリできる） |
| `log_count` | `int` | 同上（totalExp 同点時のタイブレーク用） |
| `updated_at` | `timestamptz` | `default now()`。表示・順序づけ用 |
| `updated_by` | `text` | 端末ごとの `clientId`。同一端末か他端末かの判別 |

### RLS（Row Level Security）

```sql
alter table game_saves enable row level security;
create policy "own save" on game_saves
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
```

→ 各ユーザーは自分の行のみ読み書き可能。

### 併せて対応: `community_foods` の堅牢化（B-2 の根本対応）

現状はクライアント側クランプのみ（`src/lib/supabase.ts`）。サーバー側でも:
```sql
-- 異常値をDBレベルでも弾く（B-2 の本丸）。P1 で NOT VALID 追加（既存行を壊さない）
alter table community_foods
  add constraint community_foods_pfc_sane check (
    protein between 0 and 300 and fat between 0 and 300 and
    carb between 0 and 500 and calories between 0 and 3000
  ) not valid;

-- RLS の「書き込みは認証済みのみ」は匿名認証(P2)が入ってから締める。
-- P1 で認証必須にすると、認証導入前は登録機能が壊れるため P2 に回す。
alter table community_foods enable row level security;             -- ← P2
create policy "read"  on community_foods for select using (true);  -- ← P2
create policy "write" on community_foods for insert with check (auth.uid() is not null); -- ← P2
create policy "amend" on community_foods for update using (auth.uid() is not null);      -- ← P2
```
> **シーケンス注意**: 値の健全性ガード（CHECK）は影響が無いので **P1** で入れる。
> 書き込み者を認証済みに限る RLS は、匿名認証が動く **P2** で auth と同時に締める。

## 2. クライアント同期層（`src/lib/sync.ts`）

### 同期する状態 / しない状態

`serializeForSync(state)` で**耐久フィールドだけ**を抽出する。除外:
- `lastReward` / `lastPenalty`（一過性の表示用トースト）
- `sleepPopupDate` / `lastDailyCheckDate`（端末ローカルの当日フラグ）

同期のブックキーピングは**同期ブロブに混ぜない**別キーで持つ:
- `lastSyncedRevision`（number）: 最後に取り込んだ remote の revision
- `clientId`（uuid）: インストールごとに固定。`updated_by` に使う

### ライフサイクル

1. **起動時**: `auth.getSession()` → 無ければ `signInAnonymously()`（既定ON。設定でOFF可）。
   セッション確定後に remote を**プル**。
2. **起動時のプル/マージ**（進捗を絶対に失わない判定順）:
   - remote 行なし → local を**プッシュ**（新規作成）
   - remote あり & local が実質空（プロフィール無し or totalExp0 かつログ0）→ remote を**採用**
   - `remote.revision == lastSyncedRevision` → 同期済み。local に未反映があれば**プッシュ**
   - `remote.revision > lastSyncedRevision` & local に未同期変更なし → **早送りプル**（remote 採用）
   - **分岐（両方が最終同期後に変化）** → **進捗ガード**: `total_exp` が大きい方を採用、
     同点なら `log_count` が多い方。負けた側は上書きし両端末を収束させる。
     ユーザーには非ブロッキングのトースト「別の端末の記録と同期しました」。
3. **変更時**: 意味のある変更をデバウンス（約2–3秒）して**プッシュ**:
   - 楽観ロック: `update ... where user_id=me and revision=lastSyncedRevision`
   - 0行更新（＝他端末が先に書いた）→ 再プル + 進捗ガード → 再プッシュ
   - 成功時: `revision+1`、`lastSyncedRevision` を更新
4. **メール連携**（設定画面）:
   - 「メールで引き継ぎ設定」→ `auth.updateUser({ email })`（匿名ユーザーを永続化）→ マジックリンク検証。
   - 別端末では同じメールでマジックリンク → 同一 `user_id` にサインイン → プルで復元。
   - 別端末に既存の匿名進捗があれば進捗ガードで安全に統合。

### オフライン・失敗時の安全性

- **local(localStorage) が常にソース・オブ・トゥルース**。クラウドはミラー。
- プッシュ失敗（オフライン等）は握りつぶし、`lastSyncedRevision` を進めない
  → 次回の成功プッシュで全差分が乗る。`online` イベントで再試行。
- 同期が万一壊れても local + JSON エクスポートで完全復旧できる（非破壊設計）。

## 3. 純関数として切り出してテストする部分

ネットワークは薄く保ち、判断ロジックは純関数に:
- `serializeForSync(state) -> DurableState`（除外フィールドの確定）
- `progressOf(state) -> { totalExp, logCount }`
- `chooseWinner(local, remote) -> "local" | "remote"`（進捗ガードの核）
- `decideSyncAction(localMeta, remoteMeta) -> "push" | "pull" | "merge" | "noop"`

これらに単体テストを付ける（既存 domain/store テストと同じ方針）。

## 4. 実装フェーズ（小さいPRに分割）

- [x] **P1: スキーマ** ✅ 実装済み（SQL のみ・クライアント無変更＝安全）
  `game_saves` + RLS、`community_foods` の CHECK 制約（B-2 根本対応）。
  → `supabase/migrations/20260710_0001_game_saves_and_food_check.sql`
- [x] **P2: 同期コア** ✅ 実装済み
  - `domain/sync.ts`: 判断ロジックの純関数（`serializeForSync` / `progressOf` /
    `isDirty` / `chooseWinner` / `decideSyncAction`）+ `DURABLE_STATE_KEYS`
    （何を同期するかの単一の正）。テスト14件（`domain/sync.test.ts`）。
  - `lib/supabase.ts`: `ensureSession()`（匿名サインイン）を追加。
    `community_foods` の書き込みにも使うため、循環import回避の都合でここに置く。
  - `lib/sync.ts`: `game_saves` テーブルとの通信のみを担う薄いアダプタ
    （`fetchRemoteSave` / `pushRemoteSave`(挿入衝突に自己修復) /
    `forceOverwriteRemoteSave`）。
  - `store/cloudSync.ts`: 起動時プル・デバウンスプッシュ(2.5秒)・進捗ガードの
    配線。自分自身の書き込み(hydrate/markSynced)による無限ループは
    `applyingFromSync` フラグで防止。
  - `store/useGameStore.ts`: `syncEnabled` / `lastSyncedRevision` /
    `lastSyncedProgress` / `syncNotice` を追加（`STORE_VERSION` を 1→2 に
    上げて既存ユーザーの `migrate` を確実に発火させた — 上げ忘れると
    zustand persist は version 一致時に migrate を呼ばず、新フィールドが
    `undefined` のまま実行時エラーになる）。
  - `community_foods` の RLS 認証必須化（P1で先送りしていた分）
    → `supabase/migrations/20260710_0002_community_foods_rls.sql`。
    バーコード登録は同期のON/OFFに関わらず `ensureSession()` を呼ぶよう変更
    （同期を切っていてもコミュニティDB登録は動く必要があるため）。
  - 設定画面に「クラウド同期」トグル（Supabase未設定時は非表示）。
    「データをリセット」は `pushFreshStateAfterReset()` で remote も上書きし、
    次回起動時の自動プルでリセットが巻き戻らないようにした
    （設計時点では未記載だった実装上の穴）。
  - 非ブロッキングの同期通知（`.sync-banner`、4秒で自動消滅）。
  - ⚠️ マイグレーションの**適用**と、Supabase ダッシュボードでの
    **Anonymous Sign-Ins の有効化**が必要（未実施ならログイン不要のまま
    ローカルのみで動作し続けるだけで、実害はない）。
- [ ] **P3: メール連携UI**
  「メールで引き継ぎ」設定と、別端末からの引き継ぎフロー。
- **P4（後日）: ログ単位マージへ昇格**
  D-2 の純粋リデューサ（logWorkout の domain 抽出）が入ったら、ログを UUID で
  union → 派生状態を再計算する真のマージに置き換える。**多端末の正確性は
  リデューサと表裏一体**なので、D-2 を先行させると P4 が自然に載る。

## 5. 既知のトレードオフ（今回の割り切り）

- LWW+進捗ガードは、**2端末で同時にオフライン編集**した場合に「進捗の少ない側の
  ユニークなログ」を失いうる。対象ユーザー（習慣化前の初心者・ほぼ単一端末）では
  稀。完全な保全は P4 のログマージで担保する。
- 匿名ユーザーを全員に自動発行するため匿名アカウントが増える（Supabase 上は軽量）。
  気になれば「設定で同期ON時のみ発行」に変更可能。
