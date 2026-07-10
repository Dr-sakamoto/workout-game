-- P2: 匿名認証がクライアントに入ったので、community_foods の書き込みを
-- 認証済みユーザーに限定する(P1では匿名認証が無い状態でRLSを締めると登録機能
-- が壊れるため、値ガードのCHECK制約だけ先行させて見送っていた)。
--
-- 読み取りは引き続き誰でも可(Wikipedia型の共有DBとして閲覧は公開のまま)。
-- 適用方法: supabase db push、もしくはSupabase MCPのapply_migration/SQLエディタ。

alter table public.community_foods enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_foods' and policyname = 'community_foods_read'
  ) then
    create policy community_foods_read on public.community_foods
      for select using (true);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_foods' and policyname = 'community_foods_write'
  ) then
    create policy community_foods_write on public.community_foods
      for insert with check (auth.uid() is not null);
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'community_foods' and policyname = 'community_foods_amend'
  ) then
    create policy community_foods_amend on public.community_foods
      for update using (auth.uid() is not null);
  end if;
end $$;
