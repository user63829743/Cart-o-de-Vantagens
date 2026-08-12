-- MIGRAÇÃO ADITIVA: ÁREAS DE SÓCIOS E PARCEIROS
-- Não use DROP TABLE, TRUNCATE ou DELETE neste arquivo.
-- Este script preserva os registros existentes de members, partners e partner_leads.

begin;

-- 1) Perfis de acesso vinculados ao Supabase Auth.
create table if not exists public.user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  account_type text not null default 'member' check (account_type in ('admin', 'member', 'partner')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2) Novas colunas: somente acrescentadas às tabelas existentes.
alter table public.members
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists email text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.partner_leads
  add column if not exists auth_user_id uuid references auth.users(id) on delete set null,
  add column if not exists email text,
  add column if not exists status text not null default 'PENDENTE' check (status in ('PENDENTE', 'ATIVO', 'NEGADA')),
  add column if not exists updated_at timestamptz not null default now();

alter table public.partners
  add column if not exists lead_id text,
  add column if not exists owner_auth_id uuid references auth.users(id) on delete set null,
  add column if not exists status text not null default 'ATIVO' check (status in ('ATIVO', 'INATIVO')),
  add column if not exists updated_at timestamptz not null default now();

-- Mantém os cadastros antigos e apenas atribui um status inicial.
update public.partner_leads set status = 'PENDENTE' where status is null;
update public.partners set status = 'ATIVO' where status is null;

create unique index if not exists members_auth_user_id_unique
  on public.members(auth_user_id) where auth_user_id is not null;
create unique index if not exists partner_leads_auth_user_id_unique
  on public.partner_leads(auth_user_id) where auth_user_id is not null;
create unique index if not exists partners_lead_id_unique
  on public.partners(lead_id) where lead_id is not null;

-- 3) Solicitações enviadas por parceiros ativos.
create table if not exists public.partner_change_requests (
  id uuid primary key default gen_random_uuid(),
  partner_id text,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(trim(message)) >= 5),
  status text not null default 'PENDENTE' check (status in ('PENDENTE', 'APROVADA', 'RECUSADA')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 4) Funções auxiliares para atualização de data e verificação administrativa.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.is_club_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_profiles
    where id = auth.uid()
      and account_type = 'admin'
  );
$$;

-- Cria perfis automaticamente para contas futuras sem permitir autoatribuição de admin.
create or replace function public.handle_new_club_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  safe_type text;
  registration jsonb;
begin
  safe_type := case
    when new.raw_user_meta_data ->> 'account_type' in ('member', 'partner')
      then new.raw_user_meta_data ->> 'account_type'
    else 'member'
  end;
  registration := coalesce(new.raw_user_meta_data -> 'registration', '{}'::jsonb);

  insert into public.user_profiles (id, email, account_type)
  values (new.id, new.email, safe_type)
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now();

  -- O perfil completo é criado no servidor. Isso também funciona se a confirmação
  -- de e-mail estiver ativada e a sessão ainda não tiver sido aberta no navegador.
  if safe_type = 'member' and registration ? 'name' then
    insert into public.members (
      auth_user_id, email, name, rg, cpf, birth_date, phone, address
    ) values (
      new.id, new.email,
      registration ->> 'name', registration ->> 'rg', registration ->> 'cpf',
      nullif(registration ->> 'birth_date', '')::date,
      registration ->> 'phone', registration ->> 'address'
    ) on conflict (auth_user_id) where auth_user_id is not null do nothing;
  elsif safe_type = 'partner' and registration ? 'business' then
    insert into public.partner_leads (
      auth_user_id, email, status, responsible, business, category, phone, message,
      cnpj, razao_social, nome_fantasia, logradouro_numero, bairro, localidade, uf, cep
    ) values (
      new.id, new.email, 'PENDENTE',
      registration ->> 'responsible', registration ->> 'business', registration ->> 'category',
      registration ->> 'phone', registration ->> 'message', registration ->> 'cnpj',
      registration ->> 'razao_social', registration ->> 'nome_fantasia',
      registration ->> 'logradouro_numero', registration ->> 'bairro',
      registration ->> 'localidade', registration ->> 'uf', registration ->> 'cep'
    ) on conflict (auth_user_id) where auth_user_id is not null do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_clube_vantagens on auth.users;
create trigger on_auth_user_created_clube_vantagens
  after insert on auth.users
  for each row execute procedure public.handle_new_club_user();

drop trigger if exists set_members_updated_at on public.members;
create trigger set_members_updated_at
  before update on public.members
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_partner_leads_updated_at on public.partner_leads;
create trigger set_partner_leads_updated_at
  before update on public.partner_leads
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_partners_updated_at on public.partners;
create trigger set_partners_updated_at
  before update on public.partners
  for each row execute procedure public.set_updated_at();

drop trigger if exists set_partner_change_requests_updated_at on public.partner_change_requests;
create trigger set_partner_change_requests_updated_at
  before update on public.partner_change_requests
  for each row execute procedure public.set_updated_at();

-- 5) Permissões de tabela. As políticas RLS abaixo controlam o acesso aos registros.
grant select, insert, update, delete on public.user_profiles to authenticated;
grant select, insert, update, delete on public.partner_change_requests to authenticated;

-- 6) RLS. As políticas antigas dessas quatro tabelas são removidas e substituídas;
-- nenhum dado é removido.
alter table public.user_profiles enable row level security;
alter table public.members enable row level security;
alter table public.partner_leads enable row level security;
alter table public.partners enable row level security;
alter table public.partner_change_requests enable row level security;

do $$
declare
  target_table text;
  target_policy record;
begin
  foreach target_table in array array['user_profiles', 'members', 'partner_leads', 'partners', 'partner_change_requests']
  loop
    for target_policy in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = target_table
    loop
      execute format('drop policy if exists %I on public.%I', target_policy.policyname, target_table);
    end loop;
  end loop;
end;
$$;

create policy club_profiles_select on public.user_profiles
  for select to authenticated
  using (id = auth.uid() or public.is_club_admin());

create policy club_members_select on public.members
  for select to authenticated
  using (auth_user_id = auth.uid() or public.is_club_admin());

create policy club_members_insert on public.members
  for insert to authenticated
  with check (auth_user_id = auth.uid() or public.is_club_admin());

create policy club_members_update on public.members
  for update to authenticated
  using (public.is_club_admin())
  with check (public.is_club_admin());

create policy club_members_delete on public.members
  for delete to authenticated
  using (public.is_club_admin());

create policy club_leads_select on public.partner_leads
  for select to authenticated
  using (auth_user_id = auth.uid() or public.is_club_admin());

create policy club_leads_insert on public.partner_leads
  for insert to authenticated
  with check (auth_user_id = auth.uid() or public.is_club_admin());

create policy club_leads_update on public.partner_leads
  for update to authenticated
  using (public.is_club_admin())
  with check (public.is_club_admin());

create policy club_leads_delete on public.partner_leads
  for delete to authenticated
  using (public.is_club_admin());

create policy club_partners_select on public.partners
  for select
  using (status = 'ATIVO' or owner_auth_id = auth.uid() or public.is_club_admin());

create policy club_partners_insert on public.partners
  for insert to authenticated
  with check (public.is_club_admin());

create policy club_partners_update on public.partners
  for update to authenticated
  using (public.is_club_admin())
  with check (public.is_club_admin());

create policy club_partners_delete on public.partners
  for delete to authenticated
  using (public.is_club_admin());

create policy club_change_requests_select on public.partner_change_requests
  for select to authenticated
  using (auth_user_id = auth.uid() or public.is_club_admin());

create policy club_change_requests_insert on public.partner_change_requests
  for insert to authenticated
  with check (auth_user_id = auth.uid());

create policy club_change_requests_update on public.partner_change_requests
  for update to authenticated
  using (public.is_club_admin())
  with check (public.is_club_admin());

create policy club_change_requests_delete on public.partner_change_requests
  for delete to authenticated
  using (public.is_club_admin());

-- 7) Operações administrativas seguras para aprovar ou recusar uma parceria.
create or replace function public.approve_partner_lead(p_lead_id text, p_discount text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  lead_row public.partner_leads%rowtype;
begin
  if not public.is_club_admin() then
    raise exception 'Apenas administradores podem aprovar parcerias.';
  end if;

  if coalesce(trim(p_discount), '') = '' then
    raise exception 'É obrigatório informar o benefício oferecido.';
  end if;

  select * into lead_row
  from public.partner_leads
  where id::text = p_lead_id
  for update;

  if not found then
    raise exception 'Cadastro de interessado não encontrado.';
  end if;

  insert into public.partners (
    lead_id, owner_auth_id, name, category, discount, contact,
    cnpj, razao_social, nome_fantasia, logradouro_numero,
    bairro, localidade, uf, cep, status
  ) values (
    lead_row.id::text, lead_row.auth_user_id,
    coalesce(lead_row.nome_fantasia, lead_row.business), lead_row.category,
    trim(p_discount), lead_row.phone,
    lead_row.cnpj, lead_row.razao_social, lead_row.nome_fantasia,
    lead_row.logradouro_numero, lead_row.bairro, lead_row.localidade,
    lead_row.uf, lead_row.cep, 'ATIVO'
  )
  on conflict (lead_id) where lead_id is not null do update
    set name = excluded.name,
        category = excluded.category,
        discount = excluded.discount,
        contact = excluded.contact,
        cnpj = excluded.cnpj,
        razao_social = excluded.razao_social,
        nome_fantasia = excluded.nome_fantasia,
        logradouro_numero = excluded.logradouro_numero,
        bairro = excluded.bairro,
        localidade = excluded.localidade,
        uf = excluded.uf,
        cep = excluded.cep,
        owner_auth_id = excluded.owner_auth_id,
        status = 'ATIVO';

  update public.partner_leads
  set status = 'ATIVO'
  where id::text = lead_row.id::text;
end;
$$;

create or replace function public.reject_partner_lead(p_lead_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_club_admin() then
    raise exception 'Apenas administradores podem recusar parcerias.';
  end if;

  update public.partner_leads
  set status = 'NEGADA'
  where id::text = p_lead_id;

  if not found then
    raise exception 'Cadastro de interessado não encontrado.';
  end if;
end;
$$;

-- Permite executar as funções depois de elas terem sido criadas.
grant execute on function public.approve_partner_lead(text, text) to authenticated;
grant execute on function public.reject_partner_lead(text) to authenticated;

commit;

-- PASSO OBRIGATÓRIO APÓS A MIGRAÇÃO:
-- Em uma nova consulta do SQL Editor, substitua o e-mail e execute a linha abaixo
-- para marcar a conta administrativa que já existe no Supabase.
--
-- insert into public.user_profiles (id, email, account_type)
-- select id, email, 'admin'
-- from auth.users
-- where email = 'SEU_EMAIL_DE_ADMIN@EXEMPLO.COM'
-- on conflict (id) do update set account_type = 'admin', email = excluded.email, updated_at = now();
