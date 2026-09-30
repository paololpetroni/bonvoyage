-- Bonvoyage database update 006: travelers like you, popular cities
-- Run once in Supabase: SQL Editor > New query > paste this whole file > Run. Safe to re-run.

create index if not exists ratings_user_idx on public.ratings (user_id);

-- Travelers like you: people whose ratings rise and fall with yours on places you both rated.
-- For each requested place, predicts your score from theirs. Only combined numbers are returned,
-- never who the matching travelers are, and only when at least 2 of them rated the place.
create or replace function public.get_taste_matches(p_place_ids bigint[])
returns table (place_id bigint, predicted numeric, neighbours integer, neighbour_avg numeric)
language sql stable security definer set search_path = '' as $$
  with mine as (
    select r.place_id, r.overall::numeric as o from public.ratings r where r.user_id = auth.uid()
  ),
  my_mean as (select avg(o) as m, count(*) as c from mine),
  others as (
    select r.user_id, r.place_id, r.overall::numeric as o
    from public.ratings r where auth.uid() is not null and r.user_id <> auth.uid()
  ),
  other_means as (select user_id, avg(o) as m from others group by user_id),
  pairs as (
    select ot.user_id, mi.o - (select m from my_mean) as a, ot.o - om.m as b
    from others ot
    join mine mi on mi.place_id = ot.place_id
    join other_means om on om.user_id = ot.user_id
  ),
  agreement as (
    select user_id, count(*) as overlap, sum(a * b) as num, sqrt(sum(a * a)) * sqrt(sum(b * b)) as den
    from pairs group by user_id having count(*) >= 3
  ),
  neighbours as (
    -- Agreement shrunk toward zero when the overlap is small, so 3 lucky matches don't dominate
    select user_id, (num / den) * overlap / (overlap + 5.0) as sim
    from agreement where den > 0 and num > 0
    order by 2 desc limit 40
  )
  select ot.place_id,
         round((select m from my_mean) + sum(nb.sim * (ot.o - om.m)) / sum(nb.sim), 2),
         count(*)::integer,
         round(avg(ot.o), 2)
  from others ot
  join neighbours nb on nb.user_id = ot.user_id
  join other_means om on om.user_id = ot.user_id
  where ot.place_id = any (p_place_ids)
    and (select c from my_mean) >= 3
  group by ot.place_id
  having count(*) >= 2;
$$;
revoke all on function public.get_taste_matches(bigint[]) from public, anon;
grant execute on function public.get_taste_matches(bigint[]) to authenticated;

-- How many travelers currently look like you (shown on your profile)
create or replace function public.count_taste_matches()
returns integer
language sql stable security definer set search_path = '' as $$
  with mine as (select place_id, overall::numeric as o from public.ratings where user_id = auth.uid()),
  my_mean as (select avg(o) as m from mine),
  others as (select user_id, place_id, overall::numeric as o from public.ratings where auth.uid() is not null and user_id <> auth.uid()),
  other_means as (select user_id, avg(o) as m from others group by user_id),
  agreement as (
    select ot.user_id, count(*) as overlap,
           sum((mi.o - (select m from my_mean)) * (ot.o - om.m)) as num
    from others ot join mine mi on mi.place_id = ot.place_id join other_means om on om.user_id = ot.user_id
    group by ot.user_id having count(*) >= 3
  )
  select count(*)::integer from agreement where num > 0;
$$;
revoke all on function public.count_taste_matches() from public, anon;
grant execute on function public.count_taste_matches() to authenticated;

-- Cities with the most activity, for the home page
create or replace function public.get_popular_cities(p_limit integer default 8)
returns table (city text, places integer, ratings integer, lat double precision, lon double precision)
language sql stable security definer set search_path = '' as $$
  select p.city, count(distinct p.id)::integer, count(r.id)::integer, avg(p.lat), avg(p.lon)
  from public.places p
  left join public.ratings r on r.place_id = p.id
  where p.status = 'approved' and p.city <> 'Unknown'
  group by p.city
  order by count(r.id) desc, count(distinct p.id) desc
  limit least(greatest(p_limit, 1), 20);
$$;
revoke all on function public.get_popular_cities(integer) from public;
grant execute on function public.get_popular_cities(integer) to anon, authenticated;
