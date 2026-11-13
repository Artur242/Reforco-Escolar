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
    created_at timestamptz not null default now()
);

drop function if exists public.join_classroom(text);
alter table public.classrooms drop column if exists join_code;

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
    add column if not exists access_mode text not null default 'restricted';

alter table public.classroom_members
    add column if not exists status text not null default 'pending'
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

do $$
declare
    member_write_policy text;
begin
    for member_write_policy in
        select polname
        from pg_policy
        where polrelid = 'public.classroom_members'::regclass
          and polcmd in ('a', 'w', '*')
    loop
        execute format('drop policy %I on public.classroom_members', member_write_policy);
    end loop;
end;
$$;

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

-- O acesso individual pelo professor substitui o ingresso por código ou solicitação.
do $$
begin
    if not exists (
        select 1
        from pg_constraint
        where conrelid = 'public.classrooms'::regclass
          and conname = 'classrooms_access_mode_restricted_check'
    ) then
        update public.classroom_members
        set status = 'pending'
        where status = 'approved';

        update public.classrooms
        set access_mode = 'restricted'
        where access_mode <> 'restricted';

        alter table public.classrooms alter column access_mode set default 'restricted';
        alter table public.classrooms drop constraint if exists classrooms_access_mode_check;
        alter table public.classrooms
            add constraint classrooms_access_mode_restricted_check
            check (access_mode = 'restricted');
    end if;
end;
$$;

alter table public.classroom_members
    add column if not exists status text not null default 'pending'
    check (status in ('pending', 'approved', 'denied'));
alter table public.classroom_members alter column status set default 'pending';

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
    content_type text not null check (content_type in ('material', 'summary', 'activity')),
    description text not null,
    created_at timestamptz not null default now()
);

alter table public.teacher_contents
    drop constraint if exists teacher_contents_content_type_check;
update public.teacher_contents
set content_type = case
    when content_type = 'guide' then 'summary'
    when content_type = 'exercise' then 'activity'
    else content_type
end
where content_type in ('guide', 'exercise');
alter table public.teacher_contents
    add constraint teacher_contents_content_type_check
    check (content_type in ('material', 'summary', 'activity'));

alter table public.teacher_contents add column if not exists attachment_url text;
alter table public.teacher_contents add column if not exists attachment_name text;
alter table public.teacher_contents alter column description drop not null;
alter table public.teacher_contents add column if not exists activity_questions jsonb not null default '[]'::jsonb;
alter table public.teacher_contents
    drop constraint if exists teacher_contents_activity_questions_check;
alter table public.teacher_contents
    add constraint teacher_contents_activity_questions_check
    check (jsonb_typeof(activity_questions) = 'array');

create table if not exists public.teacher_content_links (
    summary_id uuid not null references public.teacher_contents(id) on delete cascade,
    activity_id uuid not null references public.teacher_contents(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (summary_id, activity_id),
    check (summary_id <> activity_id)
);

create table if not exists public.activity_responses (
    activity_id uuid not null references public.teacher_contents(id) on delete cascade,
    student_id uuid not null references public.profiles(id) on delete cascade,
    answers jsonb not null default '{}'::jsonb check (jsonb_typeof(answers) = 'object'),
    submitted_at timestamptz not null default now(),
    attempt_number integer not null default 1 check (attempt_number >= 1),
    score numeric(4,2) check (score is null or score between 0 and 10),
    grade_details jsonb not null default '{"questions":{}}'::jsonb check (jsonb_typeof(grade_details) = 'object'),
    graded_at timestamptz,
    graded_by uuid references public.profiles(id) on delete set null,
    retry_status text not null default 'not_requested' check (retry_status in ('not_requested', 'pending', 'approved', 'denied')),
    retry_requested_at timestamptz,
    retry_decided_at timestamptz,
    retry_decided_by uuid references public.profiles(id) on delete set null,
    primary key (activity_id, student_id, attempt_number)
);

alter table public.activity_responses
    add column if not exists attempt_number integer not null default 1;
alter table public.activity_responses
    add column if not exists score numeric(4,2);
alter table public.activity_responses
    add column if not exists grade_details jsonb not null default '{"questions":{}}'::jsonb;
alter table public.activity_responses
    add column if not exists graded_at timestamptz;
alter table public.activity_responses
    add column if not exists graded_by uuid references public.profiles(id) on delete set null;
alter table public.activity_responses
    add column if not exists retry_status text not null default 'not_requested';
alter table public.activity_responses
    add column if not exists retry_requested_at timestamptz;
alter table public.activity_responses
    add column if not exists retry_decided_at timestamptz;
alter table public.activity_responses
    add column if not exists retry_decided_by uuid references public.profiles(id) on delete set null;
alter table public.activity_responses
    drop constraint if exists activity_responses_attempt_number_check;
alter table public.activity_responses
    add constraint activity_responses_attempt_number_check check (attempt_number >= 1);
alter table public.activity_responses
    drop constraint if exists activity_responses_pkey;
alter table public.activity_responses
    add constraint activity_responses_pkey primary key (activity_id, student_id, attempt_number);
alter table public.activity_responses
    drop constraint if exists activity_responses_score_check;
alter table public.activity_responses
    add constraint activity_responses_score_check check (score is null or score between 0 and 10);
alter table public.activity_responses
    drop constraint if exists activity_responses_grade_details_check;
alter table public.activity_responses
    add constraint activity_responses_grade_details_check check (jsonb_typeof(grade_details) = 'object');
alter table public.activity_responses
    drop constraint if exists activity_responses_retry_status_check;
alter table public.activity_responses
    add constraint activity_responses_retry_status_check check (retry_status in ('not_requested', 'pending', 'approved', 'denied'));

create table if not exists public.activity_answer_keys (
    activity_id uuid not null references public.teacher_contents(id) on delete cascade,
    question_id text not null,
    correct_option integer check (correct_option is null or correct_option >= 0),
    weight numeric(6,2) not null default 1 check (weight >= 0 and weight <= 10),
    subquestion_weights jsonb not null default '[]'::jsonb check (jsonb_typeof(subquestion_weights) = 'array'),
    updated_at timestamptz not null default now(),
    primary key (activity_id, question_id)
);

alter table public.activity_answer_keys
    alter column correct_option drop not null;
alter table public.activity_answer_keys
    add column if not exists weight numeric(6,2) not null default 1;
alter table public.activity_answer_keys
    add column if not exists subquestion_weights jsonb not null default '[]'::jsonb;
update public.activity_answer_keys answer_key
   set weight = least(answer_key.weight, 10),
       subquestion_weights = coalesce((
           select jsonb_agg(
               case
                   when jsonb_typeof(item.value) = 'number'
                       then to_jsonb(least((item.value #>> '{}')::numeric, 10))
                   else item.value
               end
               order by item.ordinality
           )
             from jsonb_array_elements(answer_key.subquestion_weights) with ordinality as item(value, ordinality)
       ), '[]'::jsonb)
 where answer_key.weight > 10
    or exists (
        select 1
          from jsonb_array_elements(answer_key.subquestion_weights) as item(value)
         where jsonb_typeof(item.value) = 'number'
           and (item.value #>> '{}')::numeric > 10
    );
alter table public.activity_answer_keys
    drop constraint if exists activity_answer_keys_weight_check;
alter table public.activity_answer_keys
    add constraint activity_answer_keys_weight_check check (weight >= 0 and weight <= 10);
alter table public.activity_answer_keys
    drop constraint if exists activity_answer_keys_subquestion_weights_check;
alter table public.activity_answer_keys
    add constraint activity_answer_keys_subquestion_weights_check check (jsonb_typeof(subquestion_weights) = 'array');

alter table public.activity_answer_keys enable row level security;

drop policy if exists "activity teachers can view answer keys" on public.activity_answer_keys;
create policy "activity teachers can view answer keys"
on public.activity_answer_keys for select to authenticated
using (
    exists (
        select 1 from public.teacher_contents
        where id = activity_id
          and content_type = 'activity'
          and teacher_id = auth.uid()
    )
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher')
);

insert into public.activity_answer_keys (activity_id, question_id, correct_option)
select distinct on (response.activity_id, grade.key)
       response.activity_id,
       grade.key,
       (grade.value ->> 'correct_option')::integer
  from public.activity_responses response
 cross join lateral jsonb_each(coalesce(response.grade_details -> 'questions', '{}'::jsonb)) grade
 where jsonb_typeof(grade.value -> 'correct_option') = 'number'
   and grade.value ->> 'correct_option' ~ '^[0-9]+$'
 order by response.activity_id, grade.key, response.graded_at desc nulls last, response.attempt_number desc
on conflict (activity_id, question_id) do nothing;

create or replace function public.save_activity_answer_key(target_activity_id uuid, answer_keys jsonb)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    activity_questions jsonb;
    activity_question jsonb;
    answer_key record;
    correct_option_value integer;
    weight_value numeric;
    item_weight jsonb;
    item_weight_value numeric;
    question_count integer := 0;
    total_question_weight numeric := 0;
    total_item_weight numeric := 0;
begin
    if auth.uid() is null
       or not exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher')
       or jsonb_typeof(answer_keys) is distinct from 'object' then
        raise exception 'Somente o professor responsável pode salvar o gabarito.';
    end if;

    select content.activity_questions into activity_questions
      from public.teacher_contents content
     where content.id = target_activity_id
       and content.content_type = 'activity'
       and content.teacher_id = auth.uid();
    if not found then
        raise exception 'Atividade não encontrada ou sem permissão para alterar o gabarito.';
    end if;

    for activity_question in
        select q.question
          from jsonb_array_elements(activity_questions) as q(question)
    loop
        question_count := question_count + 1;
        if not (answer_keys ? (activity_question ->> 'id'))
           or jsonb_typeof(answer_keys -> (activity_question ->> 'id')) is distinct from 'object' then
            raise exception 'Defina o peso e os critérios de todas as questões.';
        end if;

        if jsonb_typeof(answer_keys -> (activity_question ->> 'id') -> 'weight') is distinct from 'number' then
            raise exception 'O peso de cada questão deve ser um número entre 0 e 10.';
        end if;
        weight_value := (answer_keys -> (activity_question ->> 'id') ->> 'weight')::numeric;
        if weight_value < 0 or weight_value > 10 then
            raise exception 'O peso de cada questão deve estar entre 0 e 10.';
        end if;
        total_question_weight := total_question_weight + weight_value;

        if activity_question ->> 'type' = 'objective' then
            if jsonb_typeof(answer_keys -> (activity_question ->> 'id') -> 'correct_option') is distinct from 'number'
               or (answer_keys -> (activity_question ->> 'id') ->> 'correct_option') !~ '^[0-9]+$' then
                raise exception 'Marque a alternativa correta de todas as questões objetivas.';
            end if;
            correct_option_value := ((answer_keys -> (activity_question ->> 'id') ->> 'correct_option')::numeric)::integer;
            if correct_option_value >= jsonb_array_length(activity_question -> 'options') then
                raise exception 'Uma das alternativas selecionadas não existe mais.';
            end if;
        elsif activity_question ->> 'type' = 'subjective' then
            total_item_weight := 0;
            if jsonb_typeof(answer_keys -> (activity_question ->> 'id') -> 'subquestion_weights') is distinct from 'array' then
                raise exception 'Defina o peso de cada item das questões subjetivas.';
            end if;
            if jsonb_array_length(answer_keys -> (activity_question ->> 'id') -> 'subquestion_weights')
               <> jsonb_array_length(coalesce(activity_question -> 'subquestions', '[]'::jsonb)) then
                raise exception 'Defina o peso de cada item das questões subjetivas.';
            end if;
            if answer_keys -> (activity_question ->> 'id') ? 'correct_option'
               and jsonb_typeof(answer_keys -> (activity_question ->> 'id') -> 'correct_option') <> 'null' then
                raise exception 'Questões subjetivas não podem ter alternativa correta.';
            end if;
            for item_weight in
                select item.value
                  from jsonb_array_elements(answer_keys -> (activity_question ->> 'id') -> 'subquestion_weights') as item(value)
            loop
                if jsonb_typeof(item_weight) is distinct from 'number' then
                    raise exception 'O peso de cada item deve ser um número entre 0 e 10.';
                end if;
                item_weight_value := item_weight::text::numeric;
                if item_weight_value < 0 or item_weight_value > 10 then
                    raise exception 'O peso de cada item deve estar entre 0 e 10.';
                end if;
                total_item_weight := total_item_weight + item_weight_value;
            end loop;
            if total_item_weight <= 0 then
                raise exception 'Defina um peso maior que zero em pelo menos um item de cada questão subjetiva.';
            end if;
        end if;
    end loop;

    for answer_key in select key, value from jsonb_each(answer_keys)
    loop
        if not exists (
            select 1
              from jsonb_array_elements(activity_questions) as q(question)
             where q.question ->> 'id' = answer_key.key
        ) then
            raise exception 'O gabarito contém uma questão inválida.';
        end if;
    end loop;

    if question_count = 0 then
        raise exception 'Esta atividade não possui questões para configurar.';
    end if;
    if total_question_weight <= 0 then
        raise exception 'Defina um peso maior que zero em pelo menos uma questão.';
    end if;

    delete from public.activity_answer_keys
     where activity_id = target_activity_id;

    insert into public.activity_answer_keys (activity_id, question_id, correct_option, weight, subquestion_weights)
    select target_activity_id,
           key,
           case when value ? 'correct_option' then (value ->> 'correct_option')::numeric::integer else null end,
           (value ->> 'weight')::numeric,
           coalesce(value -> 'subquestion_weights', '[]'::jsonb)
      from jsonb_each(answer_keys);
end;
$$;

revoke all on function public.save_activity_answer_key(uuid, jsonb) from public;
grant execute on function public.save_activity_answer_key(uuid, jsonb) to authenticated;

alter table public.activity_responses enable row level security;

drop policy if exists "students can view own activity responses" on public.activity_responses;
create policy "students can view own activity responses"
on public.activity_responses for select to authenticated
using (student_id = auth.uid());

drop policy if exists "activity teachers can view responses" on public.activity_responses;
create policy "activity teachers can view responses"
on public.activity_responses for select to authenticated
using (exists (
    select 1 from public.teacher_contents
    where id = activity_id
      and content_type = 'activity'
      and teacher_id = auth.uid()
      and exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher')
));

drop policy if exists "students can submit own activity responses" on public.activity_responses;
create policy "students can submit own activity responses"
on public.activity_responses for insert to authenticated
with check (
    student_id = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'student')
    and exists (
        select 1 from public.teacher_contents
        where id = activity_id and content_type = 'activity'
    )
);

drop policy if exists "students can update own activity responses" on public.activity_responses;

drop policy if exists "activity teachers can grade responses" on public.activity_responses;
create policy "activity teachers can grade responses"
on public.activity_responses for update to authenticated
using (
    exists (
        select 1 from public.teacher_contents
        where id = activity_id
          and content_type = 'activity'
          and teacher_id = auth.uid()
    )
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher')
)
with check (
    exists (
        select 1 from public.teacher_contents
        where id = activity_id
          and content_type = 'activity'
          and teacher_id = auth.uid()
    )
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher')
    and graded_by = auth.uid()
);

create or replace function public.submit_activity_response(target_activity_id uuid, response_answers jsonb)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
    next_attempt integer;
    latest_retry_status text;
begin
    if auth.uid() is null
       or jsonb_typeof(response_answers) is distinct from 'object'
       or not exists (
           select 1 from public.profiles
           where id = auth.uid() and role = 'student'
       )
       or not exists (
           select 1 from public.teacher_contents
           where id = target_activity_id and content_type = 'activity'
       ) then
        raise exception 'Não foi possível validar o envio da atividade.';
    end if;

    perform pg_advisory_xact_lock(hashtextextended(auth.uid()::text || ':' || target_activity_id::text, 0));

    select coalesce(max(attempt_number), 0) + 1
      into next_attempt
      from public.activity_responses
     where activity_id = target_activity_id
       and student_id = auth.uid();

    if next_attempt > 1 then
        select retry_status
          into latest_retry_status
          from public.activity_responses
         where activity_id = target_activity_id
           and student_id = auth.uid()
         order by attempt_number desc
         limit 1;
        if latest_retry_status is distinct from 'approved' then
            raise exception 'É necessário solicitar e receber autorização do professor para refazer esta atividade.';
        end if;
    end if;

    insert into public.activity_responses (activity_id, student_id, answers, attempt_number)
    values (target_activity_id, auth.uid(), response_answers, next_attempt);

    return next_attempt;
end;
$$;

revoke all on function public.submit_activity_response(uuid, jsonb) from public;
grant execute on function public.submit_activity_response(uuid, jsonb) to authenticated;

create or replace function public.request_activity_retry(target_activity_id uuid)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
    latest_attempt public.activity_responses;
begin
    if auth.uid() is null
       or not exists (select 1 from public.profiles where id = auth.uid() and role = 'student') then
        raise exception 'Somente alunos autenticados podem solicitar nova tentativa.';
    end if;

    select * into latest_attempt
      from public.activity_responses
     where activity_id = target_activity_id
       and student_id = auth.uid()
     order by attempt_number desc
     limit 1
     for update;

    if not found or latest_attempt.score is null then
        raise exception 'A tentativa precisa estar avaliada antes de solicitar outra.';
    end if;
    if latest_attempt.retry_status = 'pending' then
        raise exception 'Sua solicitação já está aguardando análise do professor.';
    end if;
    if latest_attempt.retry_status = 'approved' then
        raise exception 'O professor já autorizou uma nova tentativa.';
    end if;

    update public.activity_responses
       set retry_status = 'pending',
           retry_requested_at = now(),
           retry_decided_at = null,
           retry_decided_by = null
     where activity_id = target_activity_id
       and student_id = auth.uid()
       and attempt_number = latest_attempt.attempt_number;
end;
$$;

create or replace function public.decide_activity_retry(
    target_activity_id uuid,
    target_student_id uuid,
    target_attempt_number integer,
    allow_retry boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
    if auth.uid() is null
       or not exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher')
       or not exists (
           select 1 from public.teacher_contents
           where id = target_activity_id and teacher_id = auth.uid() and content_type = 'activity'
       ) then
        raise exception 'Somente o professor responsável pode analisar esta solicitação.';
    end if;

    update public.activity_responses
       set retry_status = case when allow_retry then 'approved' else 'denied' end,
           retry_decided_at = now(),
           retry_decided_by = auth.uid()
     where activity_id = target_activity_id
       and student_id = target_student_id
       and attempt_number = target_attempt_number
       and retry_status = 'pending'
       and attempt_number = (
           select max(attempt_number)
             from public.activity_responses
            where activity_id = target_activity_id
              and student_id = target_student_id
       );

    if not found then
        raise exception 'A solicitação não está mais pendente ou não é a tentativa mais recente.';
    end if;
end;
$$;

revoke all on function public.request_activity_retry(uuid) from public;
revoke all on function public.decide_activity_retry(uuid, uuid, integer, boolean) from public;
grant execute on function public.request_activity_retry(uuid) to authenticated;
grant execute on function public.decide_activity_retry(uuid, uuid, integer, boolean) to authenticated;

drop policy if exists "teachers can create teacher content links" on public.teacher_content_links;
do $$
begin
    if exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'teacher_content_links'
          and column_name = 'exercise_id'
    ) and not exists (
        select 1 from information_schema.columns
        where table_schema = 'public'
          and table_name = 'teacher_content_links'
          and column_name = 'activity_id'
    ) then
        alter table public.teacher_content_links rename column exercise_id to activity_id;
    end if;
end
$$;

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
drop policy if exists "teachers can delete teacher attachments" on storage.objects;
create policy "teachers can delete teacher attachments"
on storage.objects for delete to authenticated
using (
    bucket_id = 'teacher-contents'
    and exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher')
);

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

drop policy if exists "teachers can delete any teacher contents" on public.teacher_contents;
create policy "teachers can delete any teacher contents"
on public.teacher_contents for delete to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher'));

alter table public.teacher_content_links enable row level security;

drop policy if exists "authenticated users can view teacher content links" on public.teacher_content_links;
create policy "authenticated users can view teacher content links"
on public.teacher_content_links for select to authenticated
using (true);

drop policy if exists "teachers can create teacher content links" on public.teacher_content_links;
create policy "teachers can create teacher content links"
on public.teacher_content_links for insert to authenticated
with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher')
    and exists (
        select 1 from public.teacher_contents
        where id = summary_id and content_type = 'summary'
    )
    and exists (
        select 1 from public.teacher_contents
        where id = activity_id and content_type = 'activity'
    )
);

drop policy if exists "teachers can remove teacher content links" on public.teacher_content_links;
create policy "teachers can remove teacher content links"
on public.teacher_content_links for delete to authenticated
using (exists (select 1 from public.profiles where id = auth.uid() and role = 'teacher'));

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
    if auth.uid() is null then
        raise exception 'Usuário não autenticado';
    end if;
    if not public.is_classroom_teacher(target_classroom_id) then
        raise exception 'Somente o professor da sala pode alterar seus membros';
    end if;
    if new_status not in ('approved', 'denied', 'pending') then
        raise exception 'Status de matrícula inválido';
    end if;
    if not exists (
        select 1 from public.profiles
        where id = target_student_id and role = 'student'
    ) then
        raise exception 'O usuário selecionado não é um aluno';
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

drop policy if exists "teachers can view all classroom memberships" on public.classroom_members;
create policy "teachers can view all classroom memberships"
on public.classroom_members for select to authenticated
using (exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher'
));

drop policy if exists "teachers can view all assignments for performance" on public.assignments;
create policy "teachers can view all assignments for performance"
on public.assignments for select to authenticated
using (exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher'
));

drop policy if exists "teachers can view all submissions for performance" on public.assignment_submissions;
create policy "teachers can view all submissions for performance"
on public.assignment_submissions for select to authenticated
using (exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher'
));

drop policy if exists "teachers can view all attendance for performance" on public.attendance;
create policy "teachers can view all attendance for performance"
on public.attendance for select to authenticated
using (exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'teacher'
));
