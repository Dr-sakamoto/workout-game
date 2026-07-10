-- P1: アカウント同期の土台（SYNC_DESIGN.md）
--
-- このマイグレーションは「安全側」に振ってある:
--   1. game_saves は新規テーブル + RLS。既存挙動に一切影響しない。
--   2. community_foods は CHECK 制約(異常値ガード = B-2 の本丸)のみを NOT VALID で追加。
--      RLS の「認証必須化」は匿名認証(P2)が入るまで登録機能を壊すため、ここでは行わず
--      P2 のマイグレーションで auth と同時に締める。
--
-- 適用方法:
--   supabase db push        （Supabase CLI）
--   もしくは Supabase MCP の apply_migration / SQL エディタに貼り付け。

-- ────────────────────────────────────────────────────────────
-- 1) game_saves: 1ユーザー=1行の JSON セーブ（SYNC_DESIGN.md §1）
-- ────────────────────────────────────────────────────────────
create table if not exists public.game_saves (
  user_id        uuid        primary key references auth.users (id) on delete cascade,
  state          jsonb       not null,
  schema_version int         not null default 1,
  revision       bigint      not null default 0,  -- プッシュのたび+1（楽観ロック）
  total_exp      bigint      not null default 0,  -- 進捗ガード用の非正規化指標
  log_count      int         not null default 0,  -- totalExp 同点時のタイブレーク
  updated_at     timestamptz not null default now(),
  updated_by     text                             -- 端末ごとの clientId
);

comment on table public.game_saves is
  'ゲーム状態のクラウドミラー。1ユーザー1行。競合解決は revision + 進捗(total_exp)。';

-- 行レベルセキュリティ: 各ユーザーは自分の行だけ読み書きできる
alter table public.game_saves enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'game_saves' and policyname = 'own_save'
  ) then
    create policy own_save on public.game_saves
      for all
      using (auth.uid() = user_id)
      with check (auth.uid() = user_id);
  end if;
end $$;

-- updated_at を更新時に自動で進める（クライアントの取り違え防止）
create or replace function public.touch_game_saves_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_game_saves_touch on public.game_saves;
create trigger trg_game_saves_touch
  before update on public.game_saves
  for each row execute function public.touch_game_saves_updated_at();

-- ────────────────────────────────────────────────────────────
-- 2) community_foods: 異常値ガード（B-2 の根本対応）
--    共有DBに負の値・桁違いが混入すると全ユーザーの記録/EXP補正を汚染するため、
--    DBレベルでも常識的な範囲に弾く。既存行を壊さないよう NOT VALID で追加する。
--    （新規の insert/update にはこの時点から適用される）
-- ────────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'community_foods_pfc_sane'
  ) then
    alter table public.community_foods
      add constraint community_foods_pfc_sane check (
        protein  between 0 and 300 and
        fat      between 0 and 300 and
        carb     between 0 and 500 and
        calories between 0 and 3000
      ) not valid;
  end if;
end $$;

-- 既存行を掃除してから下記を実行すると、以後は制約が全行に保証される:
--   （必要に応じて）
--   update public.community_foods set protein = least(greatest(protein,0),300), ... ;
--   alter table public.community_foods validate constraint community_foods_pfc_sane;
