-- Run this once in Supabase (SQL Editor > New query > paste all > Run). Contains updates 007 (seats) and 008 (friends).

-- One report per person per venue per event date: where you sat, what you saw, and how the view was.
-- Kept separate from the venue rating because people go to the same arena many times, in different seats.
create table if not exists public.seat_reports (
  id          bigint generated always as identity primary key,
  place_id    bigint not null references public.places (id) on delete cascade,
  user_id     uuid not null references auth.users (id) on delete cascade,
  section     text not null check (char_length(section) between 1 and 16),
  row_label   text check (char_length(row_label) <= 8),
  seat_label  text check (char_length(seat_label) <= 8),
  event_kind  text not null check (event_kind in ('hockey', 'basketball', 'soccer', 'baseball', 'football', 'concert', 'other')),
  event_name  text check (char_length(event_name) <= 80),
  event_date  date not null,
  view        numeric(2, 1) not null check (view between 1 and 5 and view * 2 = floor(view * 2)),
  value       numeric(2, 1) check (value between 1 and 5 and value * 2 = floor(value * 2)),
  price       numeric(8, 2) check (price >= 0 and price <= 20000),
  photo_path  text check (char_length(photo_path) < 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, place_id, event_date)
);
create index if not exists seat_reports_place_idx on public.seat_reports (place_id, section);

drop trigger if exists seat_reports_touch on public.seat_reports;
create trigger seat_reports_touch before update on public.seat_reports for each row execute function public.touch_updated_at();

-- Only for sports venues, no future games, and tidy section names ("sec 312" -> "312")
create or replace function public.check_seat_report()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_category public.place_category;
begin
  select category into v_category from public.places where id = new.place_id;
  if v_category is distinct from 'sports' then
    raise exception 'Seat reports are for sports venues';
  end if;
  if new.event_date > current_date + 1 then
    raise exception 'That date is in the future. Add your seat after the game.';
  end if;
  if new.event_date < date '2000-01-01' then
    raise exception 'That date looks too far back';
  end if;
  new.section := upper(regexp_replace(trim(new.section), '^(sec(tion)?\.?\s*)', '', 'i'));
  new.row_label := nullif(upper(trim(new.row_label)), '');
  new.seat_label := nullif(upper(trim(new.seat_label)), '');
  new.event_name := nullif(trim(new.event_name), '');
  if new.photo_path is not null and new.photo_path not like new.place_id::text || '/' || new.user_id::text || '/%' then
    raise exception 'Photo must be in your own folder';
  end if;
  return new;
end $$;
drop trigger if exists seat_reports_check on public.seat_reports;
create trigger seat_reports_check before insert or update on public.seat_reports for each row execute function public.check_seat_report();

-- Private: you see and manage your own reports; everyone else sees the combined section guide
alter table public.seat_reports enable row level security;
drop policy if exists "read own seat reports" on public.seat_reports;
create policy "read own seat reports" on public.seat_reports for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "add own seat report" on public.seat_reports;
create policy "add own seat report" on public.seat_reports for insert to authenticated
  with check (user_id = (select auth.uid()) and exists (select 1 from public.places p where p.id = place_id and p.status = 'approved'));
drop policy if exists "edit own seat report" on public.seat_reports;
create policy "edit own seat report" on public.seat_reports for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "delete own seat report" on public.seat_reports;
create policy "delete own seat report" on public.seat_reports for delete to authenticated using (user_id = (select auth.uid()));

-- Section guide for one venue: per section, the average view, value and price, how many reports,
-- what was on, and up to 6 photos from those seats. Never who sat where or when.
create or replace function public.get_section_guide(p_place_id bigint)
returns table (section text, n integer, avg_view numeric, avg_value numeric, avg_price numeric, kinds jsonb, photos text[])
language sql stable security definer set search_path = '' as $$
  select s.section,
         count(*)::integer,
         round(avg(s.view), 2),
         round(avg(s.value), 2),
         round(avg(s.price)),
         (select jsonb_object_agg(k, c) from (select event_kind as k, count(*) as c from public.seat_reports x
            where x.place_id = p_place_id and x.section = s.section group by event_kind) kk),
         (array(select x.photo_path from public.seat_reports x
            where x.place_id = p_place_id and x.section = s.section and x.photo_path is not null
            order by x.event_date desc limit 6))
  from public.seat_reports s
  join public.places p on p.id = s.place_id and p.status = 'approved'
  where s.place_id = p_place_id
  group by s.section;
$$;
revoke all on function public.get_section_guide(bigint) from public;
grant execute on function public.get_section_guide(bigint) to anon, authenticated;

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
