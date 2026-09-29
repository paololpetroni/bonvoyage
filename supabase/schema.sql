-- Bonvoyage database schema (Phase 1)
-- Run once in the Supabase dashboard: SQL Editor > New query > paste this whole file > Run.
-- Safe to re-run: it only creates things that don't exist yet.

-- ---------------------------------------------------------------------------
-- Types
-- ---------------------------------------------------------------------------
do $$ begin
  create type public.place_category as enum ('restaurants', 'bars', 'hotels', 'sports', 'sights');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.place_status as enum ('approved', 'pending', 'rejected', 'closed');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Profiles: one per account, created automatically at sign-up
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  display_name        text check (char_length(display_name) <= 40),
  home_city           text check (char_length(home_city) <= 60),
  taste               jsonb not null default '{}'::jsonb,   -- per category: { restaurants: { spicy: 2, sweet: -2, ... } }
  weights             jsonb not null default '{}'::jsonb,   -- per category: { hotels: { comfort: 9, pool: 2, ... } }
  budgets             jsonb not null default '{}'::jsonb,   -- per category: { hotels: 350, ... }
  learn_from_ratings  boolean not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Places: imported from OpenStreetMap (source 'osm') or added by users (source 'user', starts as pending)
-- ---------------------------------------------------------------------------
create table if not exists public.places (
  id            bigint generated always as identity primary key,
  osm_type      text check (osm_type in ('node', 'way', 'relation')),
  osm_id        bigint,
  city          text not null,
  category      public.place_category not null,
  type          text,                          -- e.g. 'Thai', 'Brewery taproom', 'Boutique'
  name          text not null check (char_length(name) between 1 and 120),
  address       text,
  neighbourhood text,
  lat           double precision,
  lon           double precision,
  status        public.place_status not null default 'pending',
  source        text not null default 'user' check (source in ('osm', 'user')),
  created_by    uuid references auth.users (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (osm_type, osm_id)
);
create index if not exists places_city_category_idx on public.places (city, category) where status = 'approved';
create index if not exists places_created_by_idx on public.places (created_by);

-- ---------------------------------------------------------------------------
-- Ratings: one per place per account (editable)
-- ---------------------------------------------------------------------------
create table if not exists public.ratings (
  id          bigint generated always as identity primary key,
  user_id     uuid not null references auth.users (id) on delete cascade,
  place_id    bigint not null references public.places (id) on delete cascade,
  overall     numeric(2, 1) not null check (overall between 1 and 5 and overall * 2 = floor(overall * 2)),
  criteria    jsonb not null default '{}'::jsonb,  -- { comfort: 4.5, pool: null (doesn't have one), ... }
  tags        text[] not null default '{}',        -- { spicy, smoky }
  spend       numeric(8, 2) check (spend >= 0),
  visited_on  date,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, place_id)
);
create index if not exists ratings_place_idx on public.ratings (place_id);

-- ---------------------------------------------------------------------------
-- Keep updated_at current
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists profiles_touch on public.profiles;
create trigger profiles_touch before update on public.profiles for each row execute function public.touch_updated_at();
drop trigger if exists places_touch on public.places;
create trigger places_touch before update on public.places for each row execute function public.touch_updated_at();
drop trigger if exists ratings_touch on public.ratings;
create trigger ratings_touch before update on public.ratings for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Create a profile automatically for every new account
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row-level security: who can read and write what
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.places   enable row level security;
alter table public.ratings  enable row level security;

-- Profiles: you see and edit only your own
drop policy if exists "read own profile" on public.profiles;
create policy "read own profile" on public.profiles for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "update own profile" on public.profiles;
create policy "update own profile" on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

-- Places: everyone sees approved places; you also see the ones you added
drop policy if exists "read approved places" on public.places;
create policy "read approved places" on public.places for select to anon, authenticated
  using (status = 'approved' or created_by = (select auth.uid()));
-- Signed-in users can suggest a place; it waits for review
drop policy if exists "suggest a place" on public.places;
create policy "suggest a place" on public.places for insert to authenticated
  with check (created_by = (select auth.uid()) and status = 'pending' and source = 'user');

-- Ratings: private. You see and manage only your own; everyone else sees combined scores (get_place_scores below)
drop policy if exists "read own ratings" on public.ratings;
create policy "read own ratings" on public.ratings for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "add own rating" on public.ratings;
create policy "add own rating" on public.ratings for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and exists (select 1 from public.places p where p.id = place_id and (p.status = 'approved' or p.created_by = (select auth.uid())))
  );
drop policy if exists "edit own rating" on public.ratings;
create policy "edit own rating" on public.ratings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "delete own rating" on public.ratings;
create policy "delete own rating" on public.ratings for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Combined scores per place, without exposing anyone's individual ratings
-- ---------------------------------------------------------------------------
create or replace function public.get_place_scores(p_city text, p_category public.place_category)
returns table (place_id bigint, n integer, avg_overall numeric)
language sql stable security definer set search_path = '' as $$
  select r.place_id, count(*)::integer, round(avg(r.overall), 2)
  from public.ratings r
  join public.places p on p.id = r.place_id
  where p.city = p_city and p.category = p_category and p.status = 'approved'
  group by r.place_id;
$$;
revoke all on function public.get_place_scores(text, public.place_category) from public;
grant execute on function public.get_place_scores(text, public.place_category) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Delete my account (profile and ratings go with it via cascade)
-- ---------------------------------------------------------------------------
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = auth.uid();
end $$;
revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
