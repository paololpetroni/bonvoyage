-- Bonvoyage database update 007: seat reports and section guides for sports venues
-- Run once in Supabase: SQL Editor > New query > paste this whole file > Run. Safe to re-run.

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
