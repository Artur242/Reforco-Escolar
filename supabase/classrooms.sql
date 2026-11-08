create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    full_name text not null default 'Usuário',
    role text not null default 'student' check (role in ('student', 'teacher')),
    created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "users can view profiles" on public.profiles;
create policy "users can view profiles"
on public.profiles for select to authenticated
using (true);

drop policy if exists "users can create own profile" on public.profiles;
create policy "users can create own profile"
on public.profiles for insert to authenticated
with check (id = auth.uid() and role = 'student');

drop policy if exists "users can update own profile" on public.profiles;
create policy "users can update own profile"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid() and role = 'student');

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id, full_name, role)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', 'Usuário'), 'student')
    on conflict (id) do update
        set full_name = excluded.full_name;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute procedure public.handle_new_user();

create table if not exists public.classrooms (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.profiles(id) on delete cascade,
    name text not null check (char_length(trim(name)) between 2 and 80),
    subject text not null check (char_length(trim(subject)) between 2 and 50),
    join_code text not null unique default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    created_at timestamptz not null default now()
);

create table if not exists public.classroom_members (
    classroom_id uuid not null references public.classrooms(id) on delete cascade,
    student_id uuid not null references public.profiles(id) on delete cascade,
    joined_at timestamptz not null default now(),
    primary key (classroom_id, student_id)
);

create table if not exists public.classroom_messages (
    id uuid primary key default gen_random_uuid(),
    classroom_id uuid not null references public.classrooms(id) on delete cascade,
    author_id uuid not null references public.profiles(id) on delete cascade,
    body text not null check (char_length(trim(body)) between 1 and 300),
    created_at timestamptz not null default now()
);

alter table public.classrooms
    add column if not exists access_mode text not null default 'code'
    check (access_mode in ('code', 'approval', 'restricted'));

alter table public.classroom_members
    add column if not exists status text not null default 'approved'
    check (status in ('pending', 'approved', 'denied'));

alter table public.classrooms enable row level security;
alter table public.classroom_members enable row level security;
alter table public.classroom_messages enable row level security;

create or replace function public.is_classroom_member(target_classroom_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from public.classroom_members
        where classroom_id = target_classroom_id and student_id = auth.uid() and status = 'approved'
    )
    or exists (
        select 1 from public.classrooms
        where id = target_classroom_id and teacher_id = auth.uid()
    );
$$;

drop policy if exists "users can view their classrooms" on public.classrooms;
create policy "users can view their classrooms"
on public.classrooms for select to authenticated
using (
    teacher_id = auth.uid()
    or public.is_classroom_member(id)
);

drop policy if exists "teachers can create classrooms" on public.classrooms;
create policy "teachers can create classrooms"
on public.classrooms for insert to authenticated
with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher')
);

drop policy if exists "teachers can update their classrooms" on public.classrooms;
create policy "teachers can update their classrooms"
on public.classrooms for update to authenticated
using (teacher_id = auth.uid())
with check (teacher_id = auth.uid());

drop policy if exists "members can view memberships" on public.classroom_members;
create policy "members can view memberships"
on public.classroom_members for select to authenticated
using (
    student_id = auth.uid()
    or public.is_classroom_member(classroom_id)
);

drop policy if exists "students can leave classrooms" on public.classroom_members;
create policy "students can leave classrooms"
on public.classroom_members for delete to authenticated
using (student_id = auth.uid());

drop policy if exists "members can view messages" on public.classroom_messages;
create policy "members can view messages"
on public.classroom_messages for select to authenticated
using (
    exists (
        select 1 from public.classrooms c
        where c.id = classroom_id
        and public.is_classroom_member(c.id)
    )
);

drop policy if exists "members can send messages" on public.classroom_messages;
create policy "members can send messages"
on public.classroom_messages for insert to authenticated
with check (
    author_id = auth.uid()
    and exists (
        select 1 from public.classrooms c
        where c.id = classroom_id
        and public.is_classroom_member(c.id)
    )
);

create or replace function public.join_classroom(classroom_code text)
returns public.classrooms
language plpgsql
security definer
set search_path = public
as $$
declare
    selected_classroom public.classrooms;
begin
    if auth.uid() is null then
        raise exception 'Usuário não autenticado';
    end if;

    select * into selected_classroom
    from public.classrooms
    where join_code = upper(trim(classroom_code));

    if not found then
        raise exception 'Código de sala inválido';
    end if;

    insert into public.classroom_members (classroom_id, student_id)
    values (selected_classroom.id, auth.uid())
    on conflict do nothing;

    return selected_classroom;
end;
$$;

grant execute on function public.join_classroom(text) to authenticated;

do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'classroom_messages'
    ) then
        alter publication supabase_realtime add table public.classroom_messages;
    end if;
end;
$$;

-- Controle de acesso futuro: código aberto, aprovação do professor ou lista restrita.
alter table public.classrooms
    add column if not exists access_mode text not null default 'code'
    check (access_mode in ('code', 'approval', 'restricted'));

alter table public.classroom_members
    add column if not exists status text not null default 'approved'
    check (status in ('pending', 'approved', 'denied'));

create table if not exists public.classroom_access_requests (
    id uuid primary key default gen_random_uuid(),
    classroom_id uuid not null references public.classrooms(id) on delete cascade,
    student_id uuid not null references public.profiles(id) on delete cascade,
    status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
    created_at timestamptz not null default now(),
    reviewed_at timestamptz,
    unique (classroom_id, student_id)
);

create table if not exists public.agenda_events (
    id uuid primary key default gen_random_uuid(),
    classroom_id uuid references public.classrooms(id) on delete cascade,
    created_by uuid not null references public.profiles(id) on delete cascade,
    title text not null check (char_length(trim(title)) between 2 and 120),
    description text,
    event_type text not null default 'class' check (event_type in ('class', 'deadline', 'activity')),
    starts_at timestamptz not null,
    ends_at timestamptz,
    created_at timestamptz not null default now(),
    check (ends_at is null or ends_at >= starts_at)
);

create table if not exists public.assignments (
    id uuid primary key default gen_random_uuid(),
    classroom_id uuid not null references public.classrooms(id) on delete cascade,
    created_by uuid not null references public.profiles(id) on delete cascade,
    title text not null check (char_length(trim(title)) between 2 and 120),
    description text,
    due_at timestamptz,
    max_score numeric(5,2) not null default 10 check (max_score > 0),
    created_at timestamptz not null default now()
);

create table if not exists public.assignment_submissions (
    id uuid primary key default gen_random_uuid(),
    assignment_id uuid not null references public.assignments(id) on delete cascade,
    student_id uuid not null references public.profiles(id) on delete cascade,
    submitted_at timestamptz,
    score numeric(5,2),
    feedback text,
    unique (assignment_id, student_id),
    check (score is null or score >= 0)
);

create table if not exists public.attendance (
    id uuid primary key default gen_random_uuid(),
    classroom_id uuid not null references public.classrooms(id) on delete cascade,
    student_id uuid not null references public.profiles(id) on delete cascade,
    attendance_date date not null,
    present boolean not null default false,
    recorded_by uuid not null references public.profiles(id) on delete cascade,
    unique (classroom_id, student_id, attendance_date)
);

create table if not exists public.achievements (
    id uuid primary key default gen_random_uuid(),
    name text not null unique,
    description text not null,
    icon text not null default '★'
);

create table if not exists public.student_achievements (
    student_id uuid not null references public.profiles(id) on delete cascade,
    achievement_id uuid not null references public.achievements(id) on delete cascade,
    awarded_by uuid references public.profiles(id) on delete set null,
    awarded_at timestamptz not null default now(),
    primary key (student_id, achievement_id)
);

create table if not exists public.teacher_contents (
    id uuid primary key default gen_random_uuid(),
    teacher_id uuid not null references public.profiles(id) on delete cascade,
    title text not null check (char_length(trim(title)) between 2 and 120),
    subject text not null check (char_length(trim(subject)) between 2 and 50),
    content_type text not null check (content_type in ('material', 'summary')),
    description text not null,
    created_at timestamptz not null default now()
);

alter table public.teacher_contents
    drop constraint if exists teacher_contents_content_type_check;
alter table public.teacher_contents
    add constraint teacher_contents_content_type_check
    check (content_type in ('material', 'summary', 'exercise', 'guide', 'activity'));

alter table public.teacher_contents add column if not exists attachment_url text;
alter table public.teacher_contents add column if not exists attachment_name text;
alter table public.teacher_contents alter column description drop not null;

insert into storage.buckets (id, name, public)
values ('teacher-contents', 'teacher-contents', true)
on conflict (id) do update set public = true;

drop policy if exists "authenticated users can view teacher attachments" on storage.objects;
create policy "authenticated users can view teacher attachments"
on storage.objects for select to authenticated
using (bucket_id = 'teacher-contents');

drop policy if exists "teachers can upload teacher attachments" on storage.objects;
create policy "teachers can upload teacher attachments"
on storage.objects for insert to authenticated
with check (
    bucket_id = 'teacher-contents'
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher')
);

drop policy if exists "teachers can delete own teacher attachments" on storage.objects;
create policy "teachers can delete own teacher attachments"
on storage.objects for delete to authenticated
using (bucket_id = 'teacher-contents' and owner_id = auth.uid()::text);

alter table public.teacher_contents enable row level security;

drop policy if exists "students can view teacher contents" on public.teacher_contents;
create policy "students can view teacher contents"
on public.teacher_contents for select to authenticated using (true);

drop policy if exists "teachers can manage own contents" on public.teacher_contents;
create policy "teachers can manage own contents"
on public.teacher_contents for all to authenticated
using (teacher_id = auth.uid())
with check (
    teacher_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher')
);

alter table public.classroom_access_requests enable row level security;
alter table public.agenda_events enable row level security;
alter table public.assignments enable row level security;
alter table public.assignment_submissions enable row level security;
alter table public.attendance enable row level security;
alter table public.achievements enable row level security;
alter table public.student_achievements enable row level security;

create or replace function public.is_classroom_teacher(target_classroom_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
    select exists (
        select 1 from public.classrooms
        where id = target_classroom_id and teacher_id = auth.uid()
    );
$$;

create or replace function public.join_classroom(classroom_code text)
returns public.classrooms
language plpgsql
security definer
set search_path = public
as $$
declare
    selected_classroom public.classrooms;
    membership_status text;
begin
    if auth.uid() is null then
        raise exception 'Usuário não autenticado';
    end if;

    select * into selected_classroom
    from public.classrooms
    where join_code = upper(trim(classroom_code));

    if not found then
        raise exception 'Código de sala inválido';
    end if;

    if selected_classroom.access_mode = 'restricted' then
        raise exception 'Esta sala exige convite do professor';
    end if;

    membership_status := case
        when selected_classroom.access_mode = 'approval' then 'pending'
        else 'approved'
    end;

    insert into public.classroom_members (classroom_id, student_id, status)
    values (selected_classroom.id, auth.uid(), membership_status)
    on conflict (classroom_id, student_id) do update
        set status = excluded.status;

    insert into public.classroom_access_requests (classroom_id, student_id, status)
    values (selected_classroom.id, auth.uid(), membership_status)
    on conflict (classroom_id, student_id) do update
        set status = excluded.status, created_at = now();

    return selected_classroom;
end;
$$;

create or replace function public.set_classroom_member(
    target_classroom_id uuid,
    target_student_id uuid,
    new_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
    if not public.is_classroom_teacher(target_classroom_id) then
        raise exception 'Somente o professor da sala pode alterar seus membros';
    end if;
    if new_status not in ('approved', 'denied', 'pending') then
        raise exception 'Status de matrícula inválido';
    end if;

    insert into public.classroom_members (classroom_id, student_id, status)
    values (target_classroom_id, target_student_id, new_status)
    on conflict (classroom_id, student_id) do update
        set status = excluded.status;

    insert into public.classroom_access_requests (classroom_id, student_id, status, reviewed_at)
    values (target_classroom_id, target_student_id, new_status, now())
    on conflict (classroom_id, student_id) do update
        set status = excluded.status, reviewed_at = now();
end;
$$;

create or replace function public.set_user_role(target_user_id uuid, new_role text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
    updated_profile public.profiles;
begin
    if not exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'teacher'
    ) then
        raise exception 'Somente um professor pode alterar tipos de conta';
    end if;
    if new_role not in ('student', 'teacher') then
        raise exception 'Tipo de conta inválido';
    end if;

    update public.profiles
    set role = new_role
    where id = target_user_id
    returning * into updated_profile;

    if not found then
        raise exception 'Usuário não encontrado';
    end if;
    return updated_profile;
end;
$$;

grant execute on function public.join_classroom(text) to authenticated;
grant execute on function public.set_classroom_member(uuid, uuid, text) to authenticated;
grant execute on function public.set_user_role(uuid, text) to authenticated;

drop policy if exists "users can view access requests" on public.classroom_access_requests;
create policy "users can view access requests"
on public.classroom_access_requests for select to authenticated
using (student_id = auth.uid() or public.is_classroom_teacher(classroom_id));

drop policy if exists "users can view agenda events" on public.agenda_events;
create policy "users can view agenda events"
on public.agenda_events for select to authenticated
using (
    created_by = auth.uid()
    or classroom_id is null
    or public.is_classroom_member(classroom_id)
);

drop policy if exists "teachers can manage agenda events" on public.agenda_events;
create policy "teachers can manage agenda events"
on public.agenda_events for all to authenticated
using (created_by = auth.uid() or (classroom_id is not null and public.is_classroom_teacher(classroom_id)))
with check (created_by = auth.uid() or (classroom_id is not null and public.is_classroom_teacher(classroom_id)));

drop policy if exists "members can view assignments" on public.assignments;
create policy "members can view assignments"
on public.assignments for select to authenticated
using (public.is_classroom_member(classroom_id));

drop policy if exists "teachers can manage assignments" on public.assignments;
create policy "teachers can manage assignments"
on public.assignments for all to authenticated
using (public.is_classroom_teacher(classroom_id))
with check (public.is_classroom_teacher(classroom_id) and created_by = auth.uid());

drop policy if exists "students can view submissions" on public.assignment_submissions;
create policy "students can view submissions"
on public.assignment_submissions for select to authenticated
using (
    student_id = auth.uid()
    or exists (
        select 1 from public.assignments a
        where a.id = assignment_id and public.is_classroom_teacher(a.classroom_id)
    )
);

drop policy if exists "students can submit assignments" on public.assignment_submissions;
create policy "students can submit assignments"
on public.assignment_submissions for insert to authenticated
with check (student_id = auth.uid());

drop policy if exists "teachers can grade submissions" on public.assignment_submissions;
create policy "teachers can grade submissions"
on public.assignment_submissions for update to authenticated
using (exists (
    select 1 from public.assignments a
    where a.id = assignment_id and public.is_classroom_teacher(a.classroom_id)
));

drop policy if exists "teachers can manage submissions" on public.assignment_submissions;
create policy "teachers can manage submissions"
on public.assignment_submissions for all to authenticated
using (exists (
    select 1 from public.assignments a
    where a.id = assignment_id and public.is_classroom_teacher(a.classroom_id)
))
with check (exists (
    select 1 from public.assignments a
    where a.id = assignment_id and public.is_classroom_teacher(a.classroom_id)
));

drop policy if exists "members can view attendance" on public.attendance;
create policy "members can view attendance"
on public.attendance for select to authenticated
using (student_id = auth.uid() or public.is_classroom_teacher(classroom_id));

drop policy if exists "teachers can manage attendance" on public.attendance;
create policy "teachers can manage attendance"
on public.attendance for all to authenticated
using (public.is_classroom_teacher(classroom_id))
with check (public.is_classroom_teacher(classroom_id) and recorded_by = auth.uid());

drop policy if exists "students can view achievements" on public.achievements;
create policy "students can view achievements"
on public.achievements for select to authenticated
using (true);

drop policy if exists "users can view own achievements" on public.student_achievements;
create policy "users can view own achievements"
on public.student_achievements for select to authenticated
using (student_id = auth.uid());

drop policy if exists "teachers can award achievements" on public.student_achievements;
create policy "teachers can award achievements"
on public.student_achievements for insert to authenticated
with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher')
);

insert into public.achievements (name, description, icon)
values
    ('Primeiro passo', 'Concluiu a primeira tarefa', '🏅'),
    ('Presença nota 10', 'Participou de 10 aulas', '⭐'),
    ('Foco nos estudos', 'Concluiu 5 tarefas', '🎯')
on conflict (name) do nothing;
