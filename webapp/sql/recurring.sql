-- Aportaciones periódicas automáticas — ejecutar en Supabase

create table if not exists recurring_contributions (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade,
  ticker text not null,
  asset_type text not null default 'fund',
  amount_eur numeric not null,
  frequency text not null,
  start_date date not null,
  end_date date,
  next_date date not null,
  active boolean not null default true,
  notes text,
  created_at timestamptz default now()
);

alter table recurring_contributions enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'recurring_contributions' and policyname = 'owner') then
    create policy "owner" on recurring_contributions
      for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
  end if;
end $$;

-- Columna opcional en transactions para la fecha real del precio usado
alter table transactions add column if not exists price_date date;
