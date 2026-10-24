-- OS Fiscal Bot: base compartilhada, perfis e histórico.
-- Execute no SQL Editor do Supabase antes de preencher config.js.
create extension if not exists pgcrypto;

create table if not exists public.osfiscal_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'employee' check (role in ('admin','manager','employee')),
  employee_legacy_id text,
  created_at timestamptz not null default now()
);

create table if not exists public.osfiscal_employees (
  legacy_id text primary key,
  name text not null,
  role_name text,
  phone text,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.osfiscal_orders (
  legacy_id text primary key,
  employee_legacy_id text not null,
  code text not null,
  service_date date,
  due_date date,
  description text not null,
  location text,
  notes text,
  status text not null default 'waiting' check (status in ('waiting','received','progress','done')),
  tracking_token text not null unique,
  signed boolean not null default false,
  before_photo boolean not null default false,
  after_photo boolean not null default false,
  legacy_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  waiting_alerted_at timestamptz
);
alter table public.osfiscal_orders add column if not exists waiting_alerted_at timestamptz;

create table if not exists public.osfiscal_events (
  id text primary key,
  order_legacy_id text not null references public.osfiscal_orders(legacy_id) on delete cascade,
  employee_legacy_id text,
  action text not null,
  detail text,
  actor text,
  created_at timestamptz not null default now()
);
create index if not exists osfiscal_orders_employee_idx on public.osfiscal_orders(employee_legacy_id);
create index if not exists osfiscal_orders_status_idx on public.osfiscal_orders(status);
create index if not exists osfiscal_events_order_date_idx on public.osfiscal_events(order_legacy_id, created_at desc);

alter table public.osfiscal_profiles enable row level security;
alter table public.osfiscal_employees enable row level security;
alter table public.osfiscal_orders enable row level security;
alter table public.osfiscal_events enable row level security;

create or replace function public.osfiscal_my_role() returns text
language sql stable security definer set search_path = public
as $$ select role from public.osfiscal_profiles where user_id = auth.uid() $$;
create or replace function public.osfiscal_my_employee_id() returns text
language sql stable security definer set search_path = public
as $$ select employee_legacy_id from public.osfiscal_profiles where user_id = auth.uid() $$;

-- Cada conta nova recebe perfil employee; admin deve promover encarregados no painel SQL.
create or replace function public.osfiscal_create_profile() returns trigger
language plpgsql security definer set search_path = public
as $$ begin
  insert into public.osfiscal_profiles(user_id,email,display_name,role)
  values(new.id,new.email,coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),'employee')
  on conflict(user_id) do nothing;
  return new;
end; $$;
drop trigger if exists osfiscal_auth_user_created on auth.users;
create trigger osfiscal_auth_user_created after insert on auth.users
for each row execute procedure public.osfiscal_create_profile();

-- Profile: usuário lê seu próprio perfil; admin/manager pode ler perfis para gestão.
drop policy if exists profile_read_self_or_manager on public.osfiscal_profiles;
create policy profile_read_self_or_manager on public.osfiscal_profiles for select to authenticated
using (user_id = auth.uid() or public.osfiscal_my_role() in ('admin','manager'));
drop policy if exists profile_update_manager on public.osfiscal_profiles;
create policy profile_update_manager on public.osfiscal_profiles for update to authenticated
using (public.osfiscal_my_role() in ('admin','manager')) with check (public.osfiscal_my_role() in ('admin','manager'));

-- Cadastro de funcionários somente por gestão.
drop policy if exists employees_manager_all on public.osfiscal_employees;
create policy employees_manager_all on public.osfiscal_employees for all to authenticated
using (public.osfiscal_my_role() in ('admin','manager')) with check (public.osfiscal_my_role() in ('admin','manager'));
drop policy if exists employees_assigned_read on public.osfiscal_employees;
create policy employees_assigned_read on public.osfiscal_employees for select to authenticated
using (legacy_id = public.osfiscal_my_employee_id());

-- Gestão vê/edita todas as OS; funcionário vê apenas as atribuídas ao seu cadastro.
drop policy if exists orders_manager_all on public.osfiscal_orders;
create policy orders_manager_all on public.osfiscal_orders for all to authenticated
using (public.osfiscal_my_role() in ('admin','manager')) with check (public.osfiscal_my_role() in ('admin','manager'));
drop policy if exists orders_employee_read on public.osfiscal_orders;
create policy orders_employee_read on public.osfiscal_orders for select to authenticated
using (employee_legacy_id = public.osfiscal_my_employee_id());

-- Histórico visível para gestão e para o funcionário vinculado à OS.
drop policy if exists events_manager_all on public.osfiscal_events;
create policy events_manager_all on public.osfiscal_events for all to authenticated
using (public.osfiscal_my_role() in ('admin','manager')) with check (public.osfiscal_my_role() in ('admin','manager'));
drop policy if exists events_employee_read on public.osfiscal_events;
create policy events_employee_read on public.osfiscal_events for select to authenticated
using (employee_legacy_id = public.osfiscal_my_employee_id());

-- Funcionário pode alterar apenas o status da própria OS; o servidor registra o evento.
create or replace function public.employee_update_order_status(p_order_legacy_id text, p_status text)
returns void language plpgsql security definer set search_path = public
as $$
declare v_employee text; v_code text; v_old_status text;
begin
  if p_status not in ('received','progress','done') then raise exception 'Status inválido'; end if;
  v_employee := public.osfiscal_my_employee_id();
  if v_employee is null then raise exception 'Usuário sem funcionário vinculado'; end if;
  select employee_legacy_id, code, status into v_employee, v_code, v_old_status
    from public.osfiscal_orders where legacy_id = p_order_legacy_id and employee_legacy_id = public.osfiscal_my_employee_id() for update;
  if not found then raise exception 'OS não encontrada ou não atribuída a este funcionário'; end if;
  if (p_status = 'received' and v_old_status <> 'waiting') or
     (p_status = 'progress' and v_old_status not in ('received','progress')) or
     (p_status = 'done' and v_old_status not in ('received','progress')) then
    raise exception 'Transição de status inválida';
  end if;
  update public.osfiscal_orders set status = p_status, updated_at = now() where legacy_id = p_order_legacy_id;
  insert into public.osfiscal_events(id,order_legacy_id,employee_legacy_id,action,detail,actor)
  values(gen_random_uuid()::text,p_order_legacy_id,v_employee,
    case p_status when 'received' then 'Recebimento confirmado' when 'progress' then 'Serviço iniciado' else 'OS concluída' end,
    'Atualizado pelo funcionário', auth.uid()::text);
end; $$;
grant execute on function public.employee_update_order_status(text,text) to authenticated;
    
