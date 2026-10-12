alter table public.profiles
  add column base_country_code text,
  add column markets_served text[] not null default '{}';

create function public.is_valid_profile_geography(
  base_country_code text,
  markets_served text[]
)
returns boolean
language plpgsql
immutable
parallel safe
set search_path = ''
as $$
declare
  valid_codes constant text[] := string_to_array(
    'AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW',
    ' '
  );
  code text;
begin
  if base_country_code is not null
     and not (base_country_code = any(valid_codes)) then
    return false;
  end if;

  if markets_served is null
     or cardinality(markets_served) > 20
     or (array_ndims(markets_served) is not null and array_ndims(markets_served) <> 1) then
    return false;
  end if;

  if cardinality(markets_served) <> (
    select count(distinct market_code) from unnest(markets_served) as market(market_code)
  ) then
    return false;
  end if;

  foreach code in array markets_served loop
    if code is null or not (code = any(valid_codes)) then
      return false;
    end if;
  end loop;

  return true;
end;
$$;

revoke all on function public.is_valid_profile_geography(text, text[])
  from public, anon, authenticated, service_role;
grant execute on function public.is_valid_profile_geography(text, text[])
  to authenticated, service_role;

alter table public.profiles
  add constraint profiles_geography_valid
  check (public.is_valid_profile_geography(base_country_code, markets_served));

revoke all on function public.get_my_profile() from public, anon, authenticated;
drop function public.get_my_profile();

create function public.get_my_profile()
returns table (
  id uuid,
  display_name text,
  professional_summary text,
  what_i_contribute text,
  what_i_am_exploring text,
  profile_visibility text,
  onboarding_completed boolean,
  created_at timestamptz,
  updated_at timestamptz,
  base_country_code text,
  markets_served text[]
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.display_name, p.professional_summary, p.what_i_contribute,
         p.what_i_am_exploring, p.profile_visibility, p.onboarding_completed,
         p.created_at, p.updated_at, p.base_country_code, p.markets_served
  from public.profiles p
  where p.id = auth.uid()
$$;

revoke all on function public.get_my_profile() from public, anon;
grant execute on function public.get_my_profile() to authenticated;

create or replace view public.discoverable_profiles
with (security_barrier = true)
as
  select p.id, p.display_name, p.professional_summary,
         p.what_i_contribute, p.what_i_am_exploring,
         p.base_country_code, p.markets_served
  from public.profiles p
  where p.profile_visibility = 'members'
    and p.onboarding_completed = true;

comment on view public.discoverable_profiles is
  'Safe member-facing profile projection. Intentionally excludes onboarding state, preferences, email and private evidence.';

revoke all on public.discoverable_profiles from anon, authenticated;
grant select on public.discoverable_profiles to authenticated;

grant insert (base_country_code, markets_served) on public.profiles to authenticated;
grant update (base_country_code, markets_served) on public.profiles to authenticated;
