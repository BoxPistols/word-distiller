-- 蒸留器 corpus テーブル
-- Supabase SQL Editorで実行してください

create table if not exists corpus (
  id          uuid primary key default gen_random_uuid(),
  text        text not null,
  input       text default '',
  verdict     text not null check (verdict in ('accepted', 'rejected')),
  reason      text default '',
  tags        text[] default '{}',
  created_at  timestamptz default now()
);

-- インデックス
create index if not exists corpus_verdict_idx    on corpus (verdict);
create index if not exists corpus_created_at_idx on corpus (created_at desc);

-- RLS（Row Level Security）は無効にしてservice keyで操作
alter table corpus disable row level security;
