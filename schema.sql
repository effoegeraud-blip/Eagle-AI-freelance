create table if not exists public.profiles (
  id uuid primary key references auth.users on delete cascade,
  email text,
  is_pro boolean not null default false,
  pro_since timestamptz
);
create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users on delete cascade,
  title text not null,
  description text not null default '',
  budget text,
  status text not null default 'lead' check (status in ('lead','proposal','active','done')),
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
alter table public.missions enable row level security;
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
create policy "own missions all" on public.missions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- is_pro n'est modifiable que par le serveur (service_role), jamais par le client.

create or replace function public.handle_new_user() returns trigger language plpgsql security definer as $$
begin insert into public.profiles (id, email) values (new.id, new.email); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();
