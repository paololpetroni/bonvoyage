-- Bonvoyage database update 008: usernames, friends, and score counts for charts
-- Run once in Supabase: SQL Editor > New query > paste this whole file > Run. Safe to re-run.

-- ---------------------------------------------------------------------------
-- Usernames (@paolo): how friends find each other. Lowercase letters, numbers, underscores.
-- ---------------------------------------------------------------------------
alter table public.profiles add column if not exists handle text;
do $$ begin
  alter table public.profiles add constraint profiles_handle_format check (handle ~ '^[a-z0-9_]{3,20}$');
exception when duplicate_object then null; end $$;
create unique index if not exists profiles_handle_key on public.profiles (handle);

-- ---------------------------------------------------------------------------
-- Friendships: a request from one person to another, accepted or still pending
-- ---------------------------------------------------------------------------
create table if not exists public.friendships (
  id           bigint generated always as identity primary key,
  requester    uuid not null references auth.users (id) on delete cascade,
  addressee    uuid not null references auth.users (id) on delete cascade,
  status       text not null default 'pending' check (status in ('pending', 'accepted')),
  created_at   timestamptz not null default now(),
  accepted_at  timestamptz,
  check (requester <> addressee)
);
create unique index if not exists friendships_pair_key on public.friendships (least(requester, addressee), greatest(requester, addressee));
create index if not exists friendships_addressee_idx on public.friendships (addressee);

alter table public.friendships enable row level security;
drop policy if exists "see own friendships" on public.friendships;
create policy "see own friendships" on public.friendships for select to authenticated
  using ((select auth.uid()) in (requester, addressee));
drop policy if exists "remove own friendships" on public.friendships;
create policy "remove own friendships" on public.friendships for delete to authenticated
  using ((select auth.uid()) in (requester, addressee));
-- Requests and accepting go through the functions below, which check the rules

-- Are two people friends?
create or replace function public.are_friends(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.friendships f
    where f.status = 'accepted' and least(f.requester, f.addressee) = least(a, b) and greatest(f.requester, f.addressee) = greatest(a, b)
  );
$$;
revoke all on function public.are_friends(uuid, uuid) from public, anon, authenticated;

-- Send a friend request by exact username. If they already asked you, this accepts it instead.
create or replace function public.request_friend(p_handle text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_me uuid := auth.uid();
  v_them uuid;
  v_row public.friendships;
  v_recent integer;
begin
  if v_me is null then raise exception 'Sign in first'; end if;
  select id into v_them from public.profiles where handle = lower(trim(both '@' from trim(p_handle)));
  if v_them is null then raise exception 'No one has the username @%', lower(trim(both '@' from trim(p_handle))); end if;
  if v_them = v_me then raise exception 'That''s you'; end if;
  select * into v_row from public.friendships
    where least(requester, addressee) = least(v_me, v_them) and greatest(requester, addressee) = greatest(v_me, v_them);
  if found then
    if v_row.status = 'accepted' then return 'already_friends'; end if;
    if v_row.addressee = v_me then
      update public.friendships set status = 'accepted', accepted_at = now() where id = v_row.id;
      return 'accepted';
    end if;
    return 'already_requested';
  end if;
  select count(*) into v_recent from public.friendships where requester = v_me and created_at > now() - interval '1 day';
  if v_recent >= 30 then raise exception 'You''ve sent a lot of requests today. Try again tomorrow.'; end if;
  insert into public.friendships (requester, addressee) values (v_me, v_them);
  return 'requested';
end $$;
revoke all on function public.request_friend(text) from public, anon;
grant execute on function public.request_friend(text) to authenticated;

-- Accept a request someone sent you
create or replace function public.accept_friend(p_id bigint)
returns void language plpgsql security definer set search_path = '' as $$
begin
  update public.friendships set status = 'accepted', accepted_at = now()
  where id = p_id and addressee = auth.uid() and status = 'pending';
  if not found then raise exception 'That request isn''t waiting for you'; end if;
end $$;
revoke all on function public.accept_friend(bigint) from public, anon;
grant execute on function public.accept_friend(bigint) to authenticated;

-- Your friends and requests, with names (profiles stay private otherwise)
create or replace function public.get_my_friends()
returns table (friendship_id bigint, friend_id uuid, display_name text, handle text, status text, direction text, since timestamptz, ratings integer)
language sql stable security definer set search_path = '' as $$
  select f.id,
         case when f.requester = auth.uid() then f.addressee else f.requester end as other,
         p.display_name, p.handle, f.status,
         case when f.requester = auth.uid() then 'sent' else 'received' end,
         coalesce(f.accepted_at, f.created_at),
         case when f.status = 'accepted' then (select count(*)::integer from public.ratings r where r.user_id = p.id) else null end
  from public.friendships f
  join public.profiles p on p.id = case when f.requester = auth.uid() then f.addressee else f.requester end
  where auth.uid() in (f.requester, f.addressee)
  order by f.status, coalesce(f.accepted_at, f.created_at) desc;
$$;
revoke all on function public.get_my_friends() from public, anon;
grant execute on function public.get_my_friends() to authenticated;

-- A friend's ratings, for their list. Only works for accepted friends.
drop function if exists public.get_friend_ratings(uuid);
create or replace function public.get_friend_ratings(p_friend uuid)
returns table (place_id bigint, name text, category public.place_category, type text, city text, lat double precision, lon double precision, overall numeric, tags text[], updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select pl.id, pl.name, pl.category, pl.type, pl.city, pl.lat, pl.lon, r.overall, r.tags, r.updated_at
  from public.ratings r
  join public.places pl on pl.id = r.place_id and pl.status = 'approved'
  where r.user_id = p_friend and public.are_friends(auth.uid(), p_friend);
$$;
revoke all on function public.get_friend_ratings(uuid) from public, anon;
grant execute on function public.get_friend_ratings(uuid) to authenticated;

-- Which of your friends rated these places, and what they gave them
create or replace function public.get_friends_on_places(p_place_ids bigint[])
returns table (place_id bigint, friend_id uuid, display_name text, handle text, overall numeric)
language sql stable security definer set search_path = '' as $$
  select r.place_id, r.user_id, p.display_name, p.handle, r.overall
  from public.ratings r
  join public.profiles p on p.id = r.user_id
  where r.place_id = any (p_place_ids)
    and r.user_id <> auth.uid()
    and public.are_friends(auth.uid(), r.user_id);
$$;
revoke all on function public.get_friends_on_places(bigint[]) from public, anon;
grant execute on function public.get_friends_on_places(bigint[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Community details now include how many people gave each score (for the chart)
-- ---------------------------------------------------------------------------
create or replace function public.get_place_breakdown(p_place_id bigint)
returns jsonb
language sql stable security definer set search_path = '' as $$
  with r as (
    select r.* from public.ratings r
    join public.places p on p.id = r.place_id
    where r.place_id = p_place_id and p.status = 'approved'
  )
  select jsonb_build_object(
    'n', (select count(*) from r),
    'overall', (select round(avg(overall), 2) from r),
    'spend', (select round(avg(spend)) from r where spend is not null),
    'dist', coalesce((select jsonb_object_agg(o, c) from (select (overall * 2)::int::text as o, count(*) as c from r group by 1) s), '{}'::jsonb),
    'criteria', coalesce((
      select jsonb_object_agg(key, avg_v) from (
        select e.key, round(avg((e.value #>> '{}')::numeric), 2) as avg_v
        from r, jsonb_each(r.criteria) e where jsonb_typeof(e.value) = 'number' group by e.key
      ) s), '{}'::jsonb),
    'missing', coalesce((
      select jsonb_object_agg(key, c) from (
        select e.key, count(*) as c from r, jsonb_each(r.criteria) e where jsonb_typeof(e.value) = 'null' group by e.key
      ) s), '{}'::jsonb),
    'tags', coalesce((
      select jsonb_object_agg(t, c) from (
        select t, count(*) as c from r, unnest(r.tags) t group by t
      ) s), '{}'::jsonb)
  );
$$;
revoke all on function public.get_place_breakdown(bigint) from public;
grant execute on function public.get_place_breakdown(bigint) to anon, authenticated;
