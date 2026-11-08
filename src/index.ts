import { supabase } from './supabaseClient.js';

const pageContent = document.querySelector<HTMLElement>('#page-content');
const pageLinks = document.querySelectorAll<HTMLAnchorElement>('[data-page]');
const sidebar = document.querySelector<HTMLElement>('#primary-navigation');
const menuToggle = document.querySelector<HTMLButtonElement>('.menu-toggle');
const profilePhotoButton = document.querySelector<HTMLButtonElement>('.profile-photo-button');
const profilePhotoInput = document.querySelector<HTMLInputElement>('[data-profile-photo-input]');
const profilePhotoImage = document.querySelector<HTMLImageElement>('[data-profile-photo]');
const profilePhotoPlaceholder = document.querySelector<SVGElement>('.profile-photo-placeholder');
const profilePhotoStatus = document.querySelector<HTMLElement>('[data-profile-photo-status]');
const userNameElement = document.querySelector<HTMLElement>('.user-name');
let classroomBoardResizeHandler: (() => void) | null = null;
const savedTheme = localStorage.getItem('theme');
const initialTheme = savedTheme === 'dark' ? 'dark' : 'light';
const savedProfilePhoto = localStorage.getItem('profile-photo');
let currentUserRole: 'student' | 'teacher' | null = null;

interface CurrentProfile {
	id: string;
	fullName: string | null;
	role: 'student' | 'teacher';
}

async function loadCurrentProfile(): Promise<CurrentProfile | null> {
	const { data: authData, error: authError } = await supabase.auth.getUser();
	if (authError || !authData.user) return null;

	const { data: profile, error: profileError } = await supabase
		.from('profiles')
		.select('full_name, role')
		.eq('id', authData.user.id)
		.maybeSingle();
	if (profileError) {
		console.error('Não foi possível carregar o perfil do usuário.', profileError);
		return null;
	}
	currentUserRole = profile?.role === 'teacher' ? 'teacher' : 'student';
	document.querySelectorAll<HTMLElement>('[data-teacher-only]').forEach((element) => {
		element.hidden = currentUserRole !== 'teacher';
	});
	document.querySelectorAll<HTMLElement>('[data-student-only]').forEach((element) => {
		element.hidden = currentUserRole === 'teacher';
	});
	return {
		id: authData.user.id,
		fullName: profile?.full_name?.trim() || authData.user.user_metadata.full_name?.trim() || authData.user.email?.split('@')[0] || null,
		role: currentUserRole,
	};
}

async function updateUserIdentity(): Promise<void> {
	const profile = await loadCurrentProfile();
	if (!userNameElement) return;
	if (!profile) {
		userNameElement.textContent = 'Bem-vindo!';
		return;
	}
	const roleLabel = profile.role === 'teacher' ? 'professor(a)' : 'aluno(a)';
	userNameElement.textContent = profile.fullName
		? `Bem-vindo, ${profile.fullName}! (${roleLabel})`
		: `Bem-vindo, ${roleLabel}!`;
}

function showProfilePhoto(dataUrl: string): void {
	if (!profilePhotoButton || !profilePhotoImage || !profilePhotoPlaceholder) return;
	profilePhotoImage.src = dataUrl;
	profilePhotoImage.hidden = false;
	profilePhotoPlaceholder.setAttribute('hidden', '');
	profilePhotoButton.setAttribute('aria-label', 'Alterar foto do perfil');
	profilePhotoButton.title = 'Alterar foto do perfil';
}

type Page = 'home' | 'materials' | 'classroom' | 'agenda' | 'performance' | 'users' | 'login' | 'register';
type Category = 'Matemática' | 'Português' | 'Ciências';
type SubjectFilter = 'Todos' | Category;
type ContentType = 'summary' | 'exercise' | 'guide' | 'activity';
type ContentTypeFilter = 'Todos' | ContentType | 'material';

interface Material {
	title: string;
	subject: Category;
	contentType: ContentType;
	description: string;
	summary: string;
	format: string;
}

interface PublishedContent {
	id: string;
	title: string;
	subject: string;
	content_type: 'material' | ContentType;
	description: string | null;
	attachment_url: string | null;
	attachment_name: string | null;
	created_at?: string;
}

const materials: Material[] = [
	{
		title: 'Frações sem mistério',
		subject: 'Matemática',
		contentType: 'summary',
		description: 'Aprenda a comparar, simplificar e operar frações com exemplos resolvidos.',
		summary: 'Uma fração representa partes iguais de um todo. Para comparar frações, observe os denominadores ou use frações equivalentes. Na simplificação, divida o numerador e o denominador pelo mesmo número até chegar à forma irredutível.',
		format: 'Resumo · 8 min',
	},
	{
		title: 'Equações do 1º grau',
		subject: 'Matemática',
		contentType: 'exercise',
		description: 'Pratique como encontrar o valor da incógnita e conferir cada resultado.',
		summary: 'Em uma equação do 1º grau, reúna os termos com incógnita de um lado e os números do outro, sempre realizando a mesma operação nos dois lados. Ao final, substitua o valor encontrado para verificar a igualdade.',
		format: 'Exercícios · 12 questões',
	},
	{
		title: 'Classes gramaticais',
		subject: 'Português',
		contentType: 'guide',
		description: 'Um guia rápido para reconhecer substantivos, verbos, adjetivos e mais.',
		summary: 'As classes gramaticais organizam as palavras de acordo com sua função. Substantivos nomeiam seres, verbos indicam ações ou estados e adjetivos caracterizam os nomes. Artigos, pronomes, advérbios e preposições completam os sentidos das frases.',
		format: 'Guia · 6 min',
	},
	{
		title: 'Interpretação de texto',
		subject: 'Português',
		contentType: 'activity',
		description: 'Estratégias para localizar informações e identificar ideias principais.',
		summary: 'Para interpretar um texto, leia com atenção, identifique o assunto e destaque as informações principais. Relacione título, contexto e argumentos para diferenciar fatos, opiniões e conclusões do autor.',
		format: 'Atividade · 10 questões',
	},
	{
		title: 'Sistema solar',
		subject: 'Ciências',
		contentType: 'summary',
		description: 'Conheça os planetas, seus movimentos e a organização do sistema solar.',
		summary: 'O sistema solar é formado pelo Sol, planetas, satélites, asteroides e cometas. Os planetas giram ao redor do Sol e também fazem o movimento de rotação, que produz a alternância entre dia e noite.',
		format: 'Resumo · 7 min',
	},
	{
		title: 'Cadeia alimentar',
		subject: 'Ciências',
		contentType: 'guide',
		description: 'Entenda como a energia circula entre produtores, consumidores e decompositores.',
		summary: 'Na cadeia alimentar, produtores fabricam seu próprio alimento, consumidores obtêm energia ao se alimentar de outros seres e decompositores reciclam a matéria orgânica. Assim, a energia passa de um nível trófico para outro.',
		format: 'Guia · 5 min',
	},
];

const categories: SubjectFilter[] = ['Todos', 'Matemática', 'Português', 'Ciências'];
const pageHashes: Record<Page, string> = {
	home: '#home',
	materials: '#materials',
	classroom: '#classroom',
	agenda: '#agenda',
	performance: '#performance',
	users: '#users',
	login: '#login',
	register: '#register',
};

let activeCategory: SubjectFilter = 'Todos';
let activeContentType: ContentTypeFilter = 'Todos';
let searchQuery = '';
let publishedContents: PublishedContent[] = [];
let selectedClassroomId: string | null = sessionStorage.getItem('selected-classroom');
let classroomChannel: ReturnType<typeof supabase.channel> | null = null;

interface Classroom {
	id: string;
	teacher_id: string;
	name: string;
	subject: string;
	join_code: string;
	access_mode?: 'code' | 'approval' | 'restricted';
	created_at: string;
}

interface ClassroomMessage {
	id: string;
	classroom_id: string;
	author_id: string;
	body: string;
	created_at: string;
	author?: { full_name: string | null };
}

interface AgendaEvent {
	id: string;
	title: string;
	description: string | null;
	event_type: 'class' | 'deadline' | 'activity';
	starts_at: string;
	ends_at: string | null;
}

interface AssignmentDue {
	id: string;
	title: string;
	due_at: string;
}

interface SubmissionScore {
	score: number | null;
	assignments: { max_score: number; title: string } | null;
}

interface AttendanceRecord {
	present: boolean;
}

interface StudentAchievement {
	awarded_at: string;
	achievements: { name: string; description: string; icon: string } | null;
}

interface TeacherPerformanceRoom {
	id: string;
	name: string;
	subject: string;
}

interface TeacherPerformanceMember {
	classroom_id: string;
	student_id: string;
	profile: { full_name: string | null } | null;
	classroom: { name: string } | null;
}

interface TeacherPerformanceAssignment {
	id: string;
	classroom_id: string;
	title: string;
	max_score: number;
}

interface TeacherPerformanceSubmission {
	assignment_id: string;
	student_id: string;
	score: number | null;
}

interface TeacherPerformanceAttendance {
	classroom_id: string;
	student_id: string;
	present: boolean;
}

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#039;',
	}[character] ?? character));
}

function formatDateTime(value: string): string {
	return new Intl.DateTimeFormat('pt-BR', {
		day: '2-digit',
		month: 'short',
		hour: '2-digit',
		minute: '2-digit',
	}).format(new Date(value)).replace('.', '');
}

async function renderAgendaFromDatabase(): Promise<void> {
	if (!pageContent) return;
	const { data: userData, error: userError } = await supabase.auth.getUser();
	if (userError || !userData.user) {
		pageContent.innerHTML = '<section class="agenda-page"><div class="agenda-demo-notice" role="status">Entre na sua conta para acessar sua agenda.</div></section>';
		return;
	}

	const [eventsResult, assignmentsResult] = await Promise.all([
		supabase.from('agenda_events').select('id, title, description, event_type, starts_at, ends_at')
			.gte('starts_at', new Date().toISOString()).order('starts_at', { ascending: true }).limit(20),
		supabase.from('assignments').select('id, title, due_at')
			.not('due_at', 'is', null).gte('due_at', new Date().toISOString()).order('due_at', { ascending: true }).limit(20),
	]);
	if (eventsResult.error) throw eventsResult.error;
	if (assignmentsResult.error) throw assignmentsResult.error;

	const events = (eventsResult.data ?? []) as AgendaEvent[];
	const assignments = (assignmentsResult.data ?? []) as AssignmentDue[];
	const items = [
		...events.map((event) => ({ title: event.title, type: event.event_type === 'deadline' ? 'Prazo' : event.event_type === 'activity' ? 'Atividade' : 'Aula', date: event.starts_at })),
		...assignments.map((assignment) => ({ title: assignment.title, type: 'Prazo', date: assignment.due_at })),
	].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 20);

	pageContent!.innerHTML = `
		<section class="agenda-page" aria-labelledby="agenda-title">
			<header class="agenda-heading"><div><p class="section-label">${currentUserRole === 'teacher' ? 'PLANEJAMENTO DA TURMA' : 'ORGANIZE SEUS ESTUDOS'}</p><h2 id="agenda-title">${currentUserRole === 'teacher' ? 'Agenda das turmas' : 'Agenda'}</h2><p>${currentUserRole === 'teacher' ? 'Acompanhe aulas, atividades e prazos programados para suas turmas.' : 'Confira seus próximos compromissos e prazos.'}</p></div></header>
			<div class="agenda-demo-notice" role="status">${items.length ? `${items.length} compromisso(s) encontrado(s).` : 'Você ainda não tem aulas ou atividades agendadas.'}</div>
			<section class="agenda-panel" aria-labelledby="agenda-upcoming-title">
				<div class="agenda-panel-heading"><div><h3 id="agenda-upcoming-title">Próximos compromissos</h3><p>Dados sincronizados com suas turmas.</p></div><span class="agenda-count">${items.length} itens</span></div>
				${items.length ? `<ol class="agenda-event-list">${items.map((item) => {
					const date = new Date(item.date);
					const isDeadline = item.type === 'Prazo';
					const day = new Intl.DateTimeFormat('pt-BR', { day: '2-digit' }).format(date);
					const month = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '');
					const dateLabel = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).format(date);
					return `<li class="agenda-event">
						<div class="agenda-date${isDeadline ? ' agenda-date-deadline' : ''}" aria-label="${escapeHtml(dateLabel)}"><strong>${day}</strong><span>${escapeHtml(month)}</span></div>
						<div class="agenda-event-copy">
							<span class="agenda-event-type ${isDeadline ? 'agenda-deadline-type' : 'agenda-class-type'}">${escapeHtml(item.type)}</span>
							<h4>${escapeHtml(item.title)}</h4><p><span aria-hidden="true">◷</span> ${formatDateTime(item.date)}</p>
						</div>
					</li>`;
				}).join('')}</ol>` : '<p class="empty-state">Nenhum compromisso encontrado.</p>'}
			</section>
		</section>
	`;
	if (currentUserRole === 'teacher') {
		const user = await supabase.auth.getUser();
		if (!user.error && user.data.user) {
			const rooms = await supabase.from('classrooms').select('id, name').eq('teacher_id', user.data.user.id).order('name');
			if (rooms.error) throw rooms.error;
			const agendaHeading = pageContent.querySelector<HTMLElement>('.agenda-heading');
			agendaHeading?.insertAdjacentHTML('afterend', `
				<section class="teacher-agenda-panel" aria-labelledby="teacher-agenda-title">
					<header class="teacher-agenda-panel-heading">
						<span class="teacher-agenda-icon" aria-hidden="true">＋</span>
						<div><p class="section-label">PLANEJAMENTO DA TURMA</p><h3 id="teacher-agenda-title">Agendar compromisso</h3><p>Adicione uma aula, atividade ou prazo para seus alunos.</p></div>
					</header>
					<form class="teacher-agenda-form" data-teacher-agenda-form>
						<label>Turma
							<select name="classroom_id" required ${rooms.data?.length ? '' : 'disabled'}>
								${rooms.data?.length ? rooms.data.map((room: { id: string; name: string }) => `<option value="${escapeHtml(room.id)}">${escapeHtml(room.name)}</option>`).join('') : '<option value="">Crie uma sala antes de agendar</option>'}
							</select>
						</label>
						<label class="teacher-agenda-title-field">Título
							<input name="title" maxlength="120" placeholder="Ex.: Revisão de matemática" required>
						</label>
						<label>Tipo
							<select name="event_type"><option value="class">Aula</option><option value="activity">Atividade</option><option value="deadline">Prazo</option></select>
						</label>
						<label>Data e horário
							<input name="starts_at" type="datetime-local" required>
						</label>
						<div class="teacher-agenda-actions">
							<button type="submit" ${rooms.data?.length ? '' : 'disabled'}><span aria-hidden="true">＋</span> Agendar compromisso</button>
							<span data-teacher-agenda-status role="status" aria-live="polite">${rooms.data?.length ? '' : 'Você ainda não criou uma turma.'}</span>
						</div>
					</form>
				</section>
			`);
			pageContent.querySelector<HTMLFormElement>('[data-teacher-agenda-form]')?.addEventListener('submit', async (event) => {
				event.preventDefault();
				const form = event.currentTarget;
				if (!(form instanceof HTMLFormElement)) return;
				const data = new FormData(form);
				const result = await supabase.from('agenda_events').insert({
					classroom_id: String(data.get('classroom_id')),
					created_by: user.data.user.id,
					title: String(data.get('title')).trim(),
					event_type: String(data.get('event_type')),
					starts_at: new Date(String(data.get('starts_at'))).toISOString(),
				});
				const status = form.querySelector<HTMLElement>('[data-teacher-agenda-status]');
				if (result.error) {
					console.error('Não foi possível criar a agenda.', result.error);
					if (status) status.textContent = 'Não foi possível criar a agenda.';
					return;
				}
				form.reset();
				if (status) status.textContent = 'Agenda criada com sucesso.';
			});
		}
	}
}

function attachTeacherContentPublisher(): void {
	if (!pageContent || currentUserRole !== 'teacher') return;
	const heading = pageContent.querySelector<HTMLElement>('.materials-heading');
	if (!heading) return;
	heading.insertAdjacentHTML('afterend', `
		<button class="home-primary-link teacher-publisher-button" type="button" data-open-content-modal>
			Publicar conteúdo
		</button>
		<dialog class="content-modal content-publisher-modal" data-content-modal aria-labelledby="content-publisher-title">
			<form class="content-modal-form" data-teacher-content-publisher method="dialog">
				<div class="content-modal-heading">
					<div><p class="section-label">BIBLIOTECA DE ESTUDOS</p><h3 id="content-publisher-title">Publicar conteúdo</h3><p class="content-modal-intro">Preencha os detalhes para compartilhar um novo recurso com seus alunos.</p></div>
					<button type="button" class="modal-close" data-close-content-modal aria-label="Fechar">×</button>
				</div>
				<div class="content-publisher-fields">
					<label class="content-publisher-title-field">Título<input name="title" maxlength="120" placeholder="Ex.: Frações e números decimais" required></label>
					<label>Disciplina<input name="subject" maxlength="50" placeholder="Ex.: Matemática" required></label>
					<label>Tipo de conteúdo<select name="content_type" required><option value="summary">Resumo</option><option value="exercise">Exercícios</option><option value="guide">Guia de estudo</option><option value="activity">Atividade</option><option value="material">Outro material</option></select></label>
					<label class="content-publisher-description-field">Texto completo<textarea name="description" rows="6" placeholder="Escreva uma descrição ou o conteúdo que os alunos vão estudar."></textarea><span class="content-field-hint">Adicione um texto ou anexe um arquivo abaixo.</span></label>
					<label class="content-publisher-file-field">Arquivo <span class="content-field-optional">(opcional)</span><input name="attachment" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,image/*"><span class="content-field-hint">PDF, documentos, apresentações, texto ou imagem.</span></label>
				</div>
				<div class="content-publisher-actions"><span data-teacher-publisher-status role="status" aria-live="polite"></span><button type="submit">Publicar conteúdo</button></div>
			</form>
		</dialog>
	`);
	pageContent.querySelector<HTMLButtonElement>('[data-open-content-modal]')?.addEventListener('click', () => {
		pageContent.querySelector<HTMLDialogElement>('[data-content-modal]')?.showModal();
	});
	pageContent.querySelector<HTMLButtonElement>('[data-close-content-modal]')?.addEventListener('click', () => {
		pageContent.querySelector<HTMLDialogElement>('[data-content-modal]')?.close();
	});
	pageContent.querySelector<HTMLFormElement>('[data-teacher-content-publisher]')?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const form = event.currentTarget;
		if (!(form instanceof HTMLFormElement)) return;
		const data = new FormData(form);
		const user = await supabase.auth.getUser();
		if (user.error || !user.data.user) throw user.error ?? new Error('Usuário não autenticado.');
		const attachment = data.get('attachment');
		const description = String(data.get('description') ?? '').trim();
		if (!description && (!(attachment instanceof File) || attachment.size === 0)) {
			const status = form.querySelector<HTMLElement>('[data-teacher-publisher-status]');
			if (status) status.textContent = 'Escreva o conteúdo ou selecione um arquivo.';
			return;
		}
		let attachmentUrl: string | null = null;
		let attachmentName: string | null = null;
		if (attachment instanceof File && attachment.size > 0) {
			const path = `${user.data.user.id}/${crypto.randomUUID()}-${attachment.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
			const upload = await supabase.storage.from('teacher-contents').upload(path, attachment);
			if (upload.error) {
				console.error('Não foi possível enviar o arquivo.', upload.error);
				const status = form.querySelector<HTMLElement>('[data-teacher-publisher-status]');
				if (status) status.textContent = 'Não foi possível enviar o arquivo.';
				return;
			}
			attachmentUrl = supabase.storage.from('teacher-contents').getPublicUrl(path).data.publicUrl;
			attachmentName = attachment.name;
		}
		const result = await supabase.from('teacher_contents').insert({
			teacher_id: user.data.user.id,
			title: String(data.get('title')).trim(),
			subject: String(data.get('subject')).trim(),
			content_type: String(data.get('content_type')),
			description: description || null,
			attachment_url: attachmentUrl,
			attachment_name: attachmentName,
		});
		if (result.error) {
			console.error('Não foi possível publicar o conteúdo.', result.error);
			const status = form.querySelector<HTMLElement>('[data-teacher-publisher-status]');
			if (status) status.textContent = 'Não foi possível publicar.';
			return;
		}
		form.reset();
		const status = form.querySelector<HTMLElement>('[data-teacher-publisher-status]');
		if (status) status.textContent = 'Publicado com sucesso.';
		pageContent.querySelector<HTMLDialogElement>('[data-content-modal]')?.close();
		await loadPublishedContents();
		await renderMaterials();
	});
}

async function loadPublishedContents(): Promise<void> {
	const result = await supabase
		.from('teacher_contents')
		.select('id, title, subject, content_type, description, attachment_url, attachment_name, created_at')
		.order('created_at', { ascending: false });
	if (result.error) {
		console.error('Não foi possível carregar os conteúdos publicados.', result.error);
		publishedContents = [];
		return;
	}
	publishedContents = (result.data ?? []) as PublishedContent[];
}

async function renderTeacherDashboard(): Promise<void> {
	if (!pageContent) return;
	const { data: authData, error: authError } = await supabase.auth.getUser();
	if (authError || !authData.user || currentUserRole !== 'teacher') {
		pageContent.innerHTML = '<section class="performance-page"><div class="performance-demo-notice" role="alert">Esta área é exclusiva para professores.</div></section>';
		return;
	}
	const [roomsResult, contentsResult] = await Promise.all([
		supabase.from('classrooms').select('id, name, subject, join_code').eq('teacher_id', authData.user.id).order('created_at', { ascending: false }),
		supabase.from('teacher_contents').select('id, title, subject, content_type, description').eq('teacher_id', authData.user.id).order('created_at', { ascending: false }),
	]);
	if (roomsResult.error) throw roomsResult.error;
	if (contentsResult.error) throw contentsResult.error;
	const rooms = roomsResult.data ?? [];
	const contents = contentsResult.data ?? [];
	const roomIds = rooms.map((room: { id: string }) => room.id);
	const membersResult = roomIds.length
		? await supabase.from('classroom_members').select('student_id, profile:profiles!student_id(full_name), classroom:classrooms!classroom_id(name)').in('classroom_id', roomIds).eq('status', 'approved')
		: { data: [], error: null };
	if (membersResult.error) throw membersResult.error;
	const members = (membersResult.data ?? []) as Array<{ student_id: string; profile: { full_name: string | null } | null; classroom: { name: string } | null }>;
	pageContent.innerHTML = `
		<section class="performance-page" aria-labelledby="teacher-title">
			<header class="performance-heading"><div><p class="section-label">ÁREA DO PROFESSOR</p><h2 id="teacher-title">Painel do Professor</h2><p>Publique conteúdos, organize turmas e acompanhe seus alunos.</p></div></header>
			<div class="performance-details-grid">
				<section class="performance-panel"><h3>Publicar conteúdo</h3><p>Envie um novo material para a biblioteca.</p><form class="classroom-chat-form" data-teacher-content-form><input name="title" placeholder="Título" required><input name="subject" placeholder="Disciplina" required><select name="content_type"><option value="material">Outro material</option><option value="summary">Resumo</option><option value="exercise">Exercícios</option><option value="guide">Guia de estudo</option><option value="activity">Atividade</option></select><textarea name="description" placeholder="Conteúdo" required></textarea><button type="submit">Publicar</button></form><div>${contents.length ? contents.map((content: { content_type: 'material' | ContentType; subject: string; title: string; description: string }) => `<article class="material-card"><span class="material-subject">${escapeHtml(getContentTypeLabel(content.content_type))} · ${escapeHtml(content.subject)}</span><h3>${escapeHtml(content.title)}</h3><p>${escapeHtml(content.description)}</p></article>`).join('') : '<p class="empty-state">Nenhum conteúdo publicado.</p>'}</div></section>
				<section class="performance-panel"><h3>Minhas salas</h3><p>Crie turmas e compartilhe o código.</p><form class="classroom-chat-form" data-teacher-room-form><input name="name" placeholder="Nome da turma" required><input name="subject" placeholder="Disciplina" required><button type="submit">Criar sala</button></form><div class="classroom-room-list">${rooms.length ? rooms.map((room: { id: string; name: string; subject: string; join_code: string }) => `<div class="classroom-room-option"><strong>${escapeHtml(room.name)}</strong><span>${escapeHtml(room.subject)} · Código ${escapeHtml(room.join_code)}</span><a href="#classroom" data-page="classroom">Abrir sala</a></div>`).join('') : '<p class="empty-state">Nenhuma sala criada.</p>'}</div></section>
				<section class="performance-panel"><h3>Agenda da turma</h3><p>Agende aulas, atividades e prazos.</p><form class="classroom-chat-form" data-teacher-event-form><select name="classroom_id" required>${rooms.map((room: { id: string; name: string }) => `<option value="${room.id}">${escapeHtml(room.name)}</option>`).join('')}</select><input name="title" placeholder="Título do evento" required><select name="event_type"><option value="class">Aula</option><option value="activity">Atividade</option><option value="deadline">Prazo</option></select><input name="starts_at" type="datetime-local" required><button type="submit">Agendar</button></form></section>
				<section class="performance-panel"><h3>Desempenho dos alunos</h3><p>Consulte pontuações, médias e frequência dos alunos matriculados.</p><a class="home-primary-link" href="#performance" data-page="performance">Analisar desempenho</a></section>
				<section class="performance-panel performance-achievements"><h3>Alunos das minhas turmas</h3><p>${members.length} aluno(s) aprovado(s).</p>${members.length ? `<ul class="performance-achievement-list">${members.map((member) => `<li><span class="performance-medal" aria-hidden="true">👤</span><span><strong>${escapeHtml(member.profile?.full_name ?? 'Aluno')}</strong><small>${escapeHtml(member.classroom?.name ?? 'Turma')}</small></span><a href="#performance" data-page="performance">Desempenho</a></li>`).join('')}</ul>` : '<p class="empty-state">Nenhum aluno aprovado ainda.</p>'}</section>
			</div>
		</section>
	`;
	pageContent.querySelector<HTMLFormElement>('[data-teacher-content-form]')?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const data = new FormData(event.currentTarget as HTMLFormElement);
		const result = await supabase.from('teacher_contents').insert({ teacher_id: authData.user.id, title: String(data.get('title')).trim(), subject: String(data.get('subject')).trim(), content_type: String(data.get('content_type')), description: String(data.get('description')).trim() });
		if (result.error) throw result.error;
		await renderTeacherDashboard();
	});
	pageContent.querySelector<HTMLFormElement>('[data-teacher-room-form]')?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const data = new FormData(event.currentTarget as HTMLFormElement);
		const result = await supabase.from('classrooms').insert({ teacher_id: authData.user.id, name: String(data.get('name')).trim(), subject: String(data.get('subject')).trim() });
		if (result.error) throw result.error;
		await renderTeacherDashboard();
	});
	pageContent.querySelector<HTMLFormElement>('[data-teacher-event-form]')?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const data = new FormData(event.currentTarget as HTMLFormElement);
		const result = await supabase.from('agenda_events').insert({ classroom_id: String(data.get('classroom_id')), created_by: authData.user.id, title: String(data.get('title')).trim(), event_type: String(data.get('event_type')), starts_at: new Date(String(data.get('starts_at'))).toISOString() });
		if (result.error) throw result.error;
		(event.currentTarget as HTMLFormElement).reset();
	});
}

async function renderUserManagement(): Promise<void> {
	if (!pageContent) return;
	const currentProfile = await loadCurrentProfile();
	if (!currentProfile || currentProfile.role !== 'teacher') {
		pageContent.innerHTML = '<section class="users-page"><div class="users-notice" role="alert">Esta área é exclusiva para professores.</div></section>';
		return;
	}

	const { data: profiles, error } = await supabase
		.from('profiles')
		.select('id, full_name, role')
		.order('full_name', { ascending: true });
	if (error) throw error;

	const managedProfiles = (profiles ?? []).filter((profile: { id: string }) => profile.id !== currentProfile.id) as Array<{
		id: string;
		full_name: string;
		role: 'student' | 'teacher';
	}>;
	pageContent.innerHTML = `
		<section class="users-page" aria-labelledby="users-title">
			<header class="users-heading">
				<p class="section-label">ÁREA DO PROFESSOR</p>
				<h2 id="users-title">Gerenciar alunos</h2>
				<p>Defina quais contas podem acessar as ferramentas de professor ou usar a plataforma como aluno.</p>
			</header>
			<div class="users-notice" role="status">${managedProfiles.length} usuário(s) para gerenciar.</div>
			${managedProfiles.length ? `
				<div class="users-table-wrapper">
					<table class="users-table">
						<thead><tr><th scope="col">Usuário</th><th scope="col">Tipo de conta</th><th scope="col">Ação</th></tr></thead>
						<tbody>${managedProfiles.map((profile) => `
							<tr>
								<td>${escapeHtml(profile.full_name?.trim() || 'Usuário')}</td>
								<td>
									<label class="visually-hidden" for="user-role-${escapeHtml(profile.id)}">Tipo de conta de ${escapeHtml(profile.full_name || 'usuário')}</label>
									<select id="user-role-${escapeHtml(profile.id)}" data-user-role="${escapeHtml(profile.id)}">
										<option value="student"${profile.role === 'student' ? ' selected' : ''}>Aluno / usuário comum</option>
										<option value="teacher"${profile.role === 'teacher' ? ' selected' : ''}>Professor / admin</option>
									</select>
								</td>
								<td><button class="users-save-button" type="button" data-save-user-role="${escapeHtml(profile.id)}">Salvar</button></td>
							</tr>
						`).join('')}</tbody>
					</table>
				</div>
			` : '<p class="users-empty-state">Nenhum outro usuário encontrado.</p>'}
			<p class="users-status" data-users-status role="status" aria-live="polite"></p>
		</section>
	`;

	pageContent.querySelectorAll<HTMLButtonElement>('[data-save-user-role]').forEach((button) => {
		button.addEventListener('click', async () => {
			const targetUserId = button.dataset.saveUserRole;
			const select = targetUserId ? pageContent?.querySelector<HTMLSelectElement>(`[data-user-role="${CSS.escape(targetUserId)}"]`) : null;
			const status = pageContent?.querySelector<HTMLElement>('[data-users-status]');
			if (!targetUserId || !select || (select.value !== 'student' && select.value !== 'teacher')) return;

			button.disabled = true;
			if (status) status.textContent = 'Salvando alteração...';
			try {
				const { error: updateError } = await supabase.rpc('set_user_role', {
					target_user_id: targetUserId,
					new_role: select.value,
				});
				if (updateError) {
					console.error('Não foi possível atualizar o tipo de conta.', updateError);
					if (status) status.textContent = 'Não foi possível salvar. Verifique sua permissão e tente novamente.';
					return;
				}
				if (status) status.textContent = 'Tipo de conta atualizado com sucesso.';
			} catch (updateError) {
				console.error('Não foi possível atualizar o tipo de conta.', updateError);
				if (status) status.textContent = 'Não foi possível salvar. Verifique sua permissão e tente novamente.';
			} finally {
				button.disabled = false;
			}
		});
	});
}

async function renderPerformanceFromDatabase(): Promise<void> {
	if (!pageContent) return;
	const { data: userData, error: userError } = await supabase.auth.getUser();
	if (userError || !userData.user) {
		pageContent.innerHTML = '<section class="performance-page"><div class="performance-demo-notice" role="status">Entre na sua conta para acessar seu desempenho.</div></section>';
		return;
	}
	const profileResult = await supabase.from('profiles').select('role').eq('id', userData.user.id).maybeSingle();
	if (profileResult.error) throw profileResult.error;
	currentUserRole = profileResult.data?.role === 'teacher' ? 'teacher' : 'student';
	if (currentUserRole === 'teacher') {
		await renderTeacherStudentPerformance(userData.user.id);
		return;
	}

	async function renderTeacherDashboardLegacy(): Promise<void> {
		if (!pageContent) return;
		const { data: authData, error: authError } = await supabase.auth.getUser();
		if (authError || !authData.user || currentUserRole !== 'teacher') {
			pageContent.innerHTML = '<section class="performance-page"><div class="performance-demo-notice" role="alert">Esta área é exclusiva para professores.</div></section>';
			return;
		}

		const [roomsResult, contentsResult] = await Promise.all([
			supabase.from('classrooms').select('id, name, subject, join_code').eq('teacher_id', authData.user.id).order('created_at', { ascending: false }),
			supabase.from('teacher_contents').select('id, title, subject, content_type, description').eq('teacher_id', authData.user.id).order('created_at', { ascending: false }),
		]);
		if (roomsResult.error) throw roomsResult.error;
		if (contentsResult.error) throw contentsResult.error;

		const rooms = roomsResult.data ?? [];
		const contents = contentsResult.data ?? [];
		pageContent.innerHTML = `
			<section class="performance-page" aria-labelledby="teacher-title">
				<header class="performance-heading"><div><p class="section-label">ÁREA DO PROFESSOR</p><h2 id="teacher-title">Painel do Professor</h2><p>Publique conteúdos, organize turmas e acompanhe seus alunos.</p></div></header>
				<div class="performance-details-grid">
					<section class="performance-panel"><h3>Publicar conteúdo</h3><p>Envie um novo material ou resumo para os alunos.</p>
						<form class="classroom-chat-form" data-teacher-content-form>
							<input name="title" placeholder="Título" maxlength="120" required>
							<input name="subject" placeholder="Disciplina" maxlength="50" required>
							<select name="content_type"><option value="material">Outro material</option><option value="summary">Resumo</option><option value="exercise">Exercícios</option><option value="guide">Guia de estudo</option><option value="activity">Atividade</option></select>
							<textarea name="description" placeholder="Conteúdo" required></textarea>
							<button type="submit">Publicar</button>
						</form>
						<div data-teacher-content-list>${contents.length ? contents.map((content: { content_type: 'material' | ContentType; subject: string; title: string; description: string }) => `<article class="material-card"><span class="material-subject">${escapeHtml(getContentTypeLabel(content.content_type))} · ${escapeHtml(content.subject)}</span><h3>${escapeHtml(content.title)}</h3><p>${escapeHtml(content.description)}</p></article>`).join('') : '<p class="empty-state">Nenhum conteúdo publicado.</p>'}</div>
					</section>
					<section class="performance-panel"><h3>Minhas salas</h3><p>Crie turmas e compartilhe o código com seus alunos.</p>
						<form class="classroom-chat-form" data-teacher-room-form><input name="name" placeholder="Nome da turma" required><input name="subject" placeholder="Disciplina" required><button type="submit">Criar sala</button></form>
						<div class="classroom-room-list">${rooms.length ? rooms.map((room: { id: string; name: string; subject: string; join_code: string }) => `<div class="classroom-room-option"><strong>${escapeHtml(room.name)}</strong><span>${escapeHtml(room.subject)} · Código ${escapeHtml(room.join_code)}</span><a href="#classroom" data-page="classroom" data-classroom-id="${room.id}">Abrir sala</a></div>`).join('') : '<p class="empty-state">Nenhuma sala criada.</p>'}</div>
					</section>
					<section class="performance-panel"><h3>Agenda da turma</h3><p>Agende aulas, atividades e prazos.</p>
						<form class="classroom-chat-form" data-teacher-event-form><select name="classroom_id" required>${rooms.map((room: { id: string; name: string }) => `<option value="${room.id}">${escapeHtml(room.name)}</option>`).join('')}</select><input name="title" placeholder="Título do evento" required><select name="event_type"><option value="class">Aula</option><option value="activity">Atividade</option><option value="deadline">Prazo</option></select><input name="starts_at" type="datetime-local" required><button type="submit">Agendar</button></form>
					</section>
					<section class="performance-panel"><h3>Desempenho dos alunos</h3><p>Abra uma sala para administrar alunos, frequência, notas e conquistas.</p><a class="home-primary-link" href="#classroom" data-page="classroom">Gerenciar turmas</a></section>
				</div>
			</section>
		`;

		pageContent.querySelector<HTMLFormElement>('[data-teacher-content-form]')?.addEventListener('submit', async (event) => {
			event.preventDefault();
			const data = new FormData(event.currentTarget as HTMLFormElement);
			const result = await supabase.from('teacher_contents').insert({
				teacher_id: authData.user.id,
				title: String(data.get('title')).trim(),
				subject: String(data.get('subject')).trim(),
				content_type: String(data.get('content_type')),
				description: String(data.get('description')).trim(),
			});
			if (result.error) throw result.error;
			await renderTeacherDashboard();
		});
		pageContent.querySelector<HTMLFormElement>('[data-teacher-room-form]')?.addEventListener('submit', async (event) => {
			event.preventDefault();
			const data = new FormData(event.currentTarget as HTMLFormElement);
			const result = await supabase.from('classrooms').insert({ teacher_id: authData.user.id, name: String(data.get('name')).trim(), subject: String(data.get('subject')).trim() });
			if (result.error) throw result.error;
			await renderTeacherDashboard();
		});
		pageContent.querySelector<HTMLFormElement>('[data-teacher-event-form]')?.addEventListener('submit', async (event) => {
			event.preventDefault();
			const data = new FormData(event.currentTarget as HTMLFormElement);
			const result = await supabase.from('agenda_events').insert({
				classroom_id: String(data.get('classroom_id')),
				created_by: authData.user.id,
				title: String(data.get('title')).trim(),
				event_type: String(data.get('event_type')),
				starts_at: new Date(String(data.get('starts_at'))).toISOString(),
			});
			if (result.error) throw result.error;
			(event.currentTarget as HTMLFormElement).reset();
		});
	}

	const [submissionsResult, attendanceResult, achievementsResult] = await Promise.all([
		supabase.from('assignment_submissions').select('score, assignments(max_score, title)').eq('student_id', userData.user.id),
		supabase.from('attendance').select('present').eq('student_id', userData.user.id),
		supabase.from('student_achievements').select('awarded_at, achievements(name, description, icon)').eq('student_id', userData.user.id).order('awarded_at', { ascending: false }),
	]);
	if (submissionsResult.error) throw submissionsResult.error;
	if (attendanceResult.error) throw attendanceResult.error;
	if (achievementsResult.error) throw achievementsResult.error;

	const submissions = (submissionsResult.data ?? []) as SubmissionScore[];
	const attendance = (attendanceResult.data ?? []) as AttendanceRecord[];
	const achievements = (achievementsResult.data ?? []) as StudentAchievement[];
	const graded = submissions.filter((submission) => submission.score !== null && submission.assignments);
	const average = graded.length
		? graded.reduce((sum, submission) => sum + ((submission.score ?? 0) / submission.assignments!.max_score) * 10, 0) / graded.length
		: null;
	const present = attendance.filter((record) => record.present).length;
	const attendanceRate = attendance.length ? Math.round((present / attendance.length) * 100) : null;

	pageContent!.innerHTML = `
		<section class="performance-page" aria-labelledby="performance-title">
			<header class="performance-heading"><div><p class="section-label">ACOMPANHAMENTO ESCOLAR</p><h2 id="performance-title">Painel de Desempenho</h2><p>Dados registrados nas suas atividades e aulas.</p></div></header>
			<div class="performance-demo-notice" role="status">${graded.length || attendance.length || achievements.length ? 'Informações carregadas do banco de dados.' : 'Ainda não existem dados de desempenho registrados.'}</div>
			<section class="performance-stat-grid" aria-label="Resumo do desempenho">
				<article class="performance-stat-card"><span class="performance-stat-icon" aria-hidden="true">▤</span><div><p>Média geral</p><strong>${average === null ? '—' : average.toFixed(1)} <small>/ 10</small></strong><span class="performance-stat-detail">${graded.length} atividade(s) avaliadas</span></div></article>
				<article class="performance-stat-card"><span class="performance-stat-icon" aria-hidden="true">✓</span><div><p>Frequência</p><strong>${attendanceRate === null ? '—' : attendanceRate}<small>${attendanceRate === null ? '' : '%'}</small></strong><span class="performance-stat-detail">${present} presença(s) em ${attendance.length} aula(s)</span></div></article>
				<article class="performance-stat-card"><span class="performance-stat-icon" aria-hidden="true">✦</span><div><p>Atividades avaliadas</p><strong>${graded.length}</strong><span class="performance-stat-detail">Registros no banco</span></div></article>
				<article class="performance-stat-card"><span class="performance-stat-icon" aria-hidden="true">♛</span><div><p>Conquistas</p><strong>${achievements.length}</strong><span class="performance-stat-detail">Medalhas recebidas</span></div></article>
			</section>
			<section class="performance-panel performance-achievements" aria-labelledby="performance-achievements-title">
				<div class="performance-panel-heading"><div><h3 id="performance-achievements-title">Medalhas e conquistas</h3><p>Reconhecendo cada passo</p></div></div>
				${achievements.length ? `<ul class="performance-achievement-list">${achievements.map((item) => `<li><span class="performance-medal" aria-hidden="true">${escapeHtml(item.achievements?.icon ?? '★')}</span><span><strong>${escapeHtml(item.achievements?.name ?? 'Conquista')}</strong><small>${escapeHtml(item.achievements?.description ?? '')}</small></span><span class="performance-earned">Conquistada</span></li>`).join('')}</ul>` : '<p class="empty-state">Nenhuma conquista registrada.</p>'}
			</section>
		</section>
	`;
}

async function renderTeacherStudentPerformance(teacherId: string): Promise<void> {
	if (!pageContent) return;
	const roomsResult = await supabase
		.from('classrooms')
		.select('id, name, subject')
		.eq('teacher_id', teacherId)
		.order('created_at', { ascending: false });
	if (roomsResult.error) throw roomsResult.error;

	const rooms = (roomsResult.data ?? []) as TeacherPerformanceRoom[];
	if (!rooms.length) {
		pageContent.innerHTML = `
			<section class="performance-page" aria-labelledby="teacher-performance-title">
				<header class="performance-heading"><div><p class="section-label">ÁREA DO PROFESSOR</p><h2 id="teacher-performance-title">Desempenho dos alunos</h2><p>Acompanhe notas e frequência dos alunos nas suas turmas.</p></div></header>
				<div class="performance-demo-notice" role="status">Crie uma turma e matricule alunos para começar a acompanhar o desempenho.</div>
				<a class="home-primary-link" href="#classroom" data-page="classroom">Ir para salas</a>
			</section>
		`;
		return;
	}

	const roomIds = rooms.map((room) => room.id);
	const [membersResult, assignmentsResult] = await Promise.all([
		supabase
			.from('classroom_members')
			.select('classroom_id, student_id, profile:profiles!student_id(full_name), classroom:classrooms!classroom_id(name)')
			.in('classroom_id', roomIds)
			.eq('status', 'approved'),
		supabase
			.from('assignments')
			.select('id, classroom_id, title, max_score')
			.in('classroom_id', roomIds),
	]);
	if (membersResult.error) throw membersResult.error;
	if (assignmentsResult.error) throw assignmentsResult.error;

	const members = (membersResult.data ?? []) as TeacherPerformanceMember[];
	const assignments = (assignmentsResult.data ?? []) as TeacherPerformanceAssignment[];
	const assignmentIds = assignments.map((assignment) => assignment.id);
	const [submissionsResult, attendanceResult] = await Promise.all([
		assignmentIds.length
			? supabase.from('assignment_submissions').select('assignment_id, student_id, score').in('assignment_id', assignmentIds)
			: Promise.resolve({ data: [], error: null }),
		supabase.from('attendance').select('classroom_id, student_id, present').in('classroom_id', roomIds),
	]);
	if (submissionsResult.error) throw submissionsResult.error;
	if (attendanceResult.error) throw attendanceResult.error;

	const submissions = (submissionsResult.data ?? []) as TeacherPerformanceSubmission[];
	const attendance = (attendanceResult.data ?? []) as TeacherPerformanceAttendance[];
	const assignmentById = new Map(assignments.map((assignment) => [assignment.id, assignment]));

	pageContent.innerHTML = `
		<section class="performance-page teacher-student-performance" aria-labelledby="teacher-performance-title">
			<header class="performance-heading">
				<div><p class="section-label">ÁREA DO PROFESSOR</p><h2 id="teacher-performance-title">Desempenho dos alunos</h2><p>Acompanhe pontuações e frequência dos alunos matriculados nas suas turmas.</p></div>
				<label class="teacher-performance-filter">Turma
					<select data-teacher-performance-room aria-label="Filtrar desempenho por turma">
						<option value="all">Todas as turmas</option>
						${rooms.map((room) => `<option value="${escapeHtml(room.id)}">${escapeHtml(room.name)} · ${escapeHtml(room.subject)}</option>`).join('')}
					</select>
				</label>
			</header>
			<section class="performance-stat-grid" data-teacher-performance-summary aria-label="Resumo do desempenho"></section>
			<section class="performance-panel" aria-labelledby="teacher-performance-list-title">
				<div class="performance-panel-heading"><div><h3 id="teacher-performance-list-title">Alunos e pontuações</h3><p>Notas avaliadas e frequência registrada por turma.</p></div></div>
				<div class="teacher-performance-list" data-teacher-performance-list></div>
			</section>
		</section>
	`;

	const filter = pageContent.querySelector<HTMLSelectElement>('[data-teacher-performance-room]');
	const summary = pageContent.querySelector<HTMLElement>('[data-teacher-performance-summary]');
	const list = pageContent.querySelector<HTMLElement>('[data-teacher-performance-list]');
	if (!filter || !summary || !list) throw new Error('A interface de desempenho dos alunos não foi encontrada.');

	const renderSelectedPerformance = (): void => {
		const selectedRoomId = filter.value;
		const selectedRooms = selectedRoomId === 'all' ? rooms : rooms.filter((room) => room.id === selectedRoomId);
		const selectedRoomIds = new Set(selectedRooms.map((room) => room.id));
		const selectedMembers = members.filter((member) => selectedRoomIds.has(member.classroom_id));
		const selectedAssignments = assignments.filter((assignment) => selectedRoomIds.has(assignment.classroom_id));
		const selectedAssignmentIds = new Set(selectedAssignments.map((assignment) => assignment.id));
		const selectedSubmissions = submissions.filter((submission) => selectedAssignmentIds.has(submission.assignment_id));
		const selectedAttendance = attendance.filter((record) => selectedRoomIds.has(record.classroom_id));
		const gradedSubmissions = selectedSubmissions.filter((submission) => submission.score !== null && assignmentById.has(submission.assignment_id));
		const averageScore = gradedSubmissions.length
			? gradedSubmissions.reduce((sum, submission) => {
				const assignment = assignmentById.get(submission.assignment_id)!;
				return sum + (submission.score! / assignment.max_score) * 10;
			}, 0) / gradedSubmissions.length
			: null;
		const presentCount = selectedAttendance.filter((record) => record.present).length;
		const attendanceRate = selectedAttendance.length ? Math.round((presentCount / selectedAttendance.length) * 100) : null;
		const studentCount = new Set(selectedMembers.map((member) => member.student_id)).size;

		summary.innerHTML = `
			<article class="performance-stat-card"><span class="performance-stat-icon" aria-hidden="true">♙</span><div><p>Alunos matriculados</p><strong>${studentCount}</strong><span class="performance-stat-detail">Nas turmas selecionadas</span></div></article>
			<article class="performance-stat-card"><span class="performance-stat-icon" aria-hidden="true">▤</span><div><p>Média das pontuações</p><strong>${averageScore === null ? '—' : averageScore.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}<small>${averageScore === null ? '' : ' / 10'}</small></strong><span class="performance-stat-detail">${gradedSubmissions.length} atividade(s) avaliadas</span></div></article>
			<article class="performance-stat-card"><span class="performance-stat-icon" aria-hidden="true">✓</span><div><p>Frequência</p><strong>${attendanceRate === null ? '—' : attendanceRate}<small>${attendanceRate === null ? '' : '%'}</small></strong><span class="performance-stat-detail">${presentCount} presença(s) em ${selectedAttendance.length} registro(s)</span></div></article>
		`;

		if (!selectedMembers.length) {
			list.innerHTML = '<p class="empty-state">Nenhum aluno aprovado nesta turma ainda.</p>';
			return;
		}

		list.innerHTML = selectedMembers.map((member) => {
			const memberAssignments = selectedAssignments.filter((assignment) => assignment.classroom_id === member.classroom_id);
			const memberSubmissions = selectedSubmissions.filter((submission) => submission.student_id === member.student_id && memberAssignments.some((assignment) => assignment.id === submission.assignment_id));
			const memberGraded = memberSubmissions.filter((submission) => submission.score !== null);
			const memberAverage = memberGraded.length
				? memberGraded.reduce((sum, submission) => {
					const assignment = assignmentById.get(submission.assignment_id)!;
					return sum + (submission.score! / assignment.max_score) * 10;
				}, 0) / memberGraded.length
				: null;
			const memberAttendance = attendance.filter((record) => record.student_id === member.student_id && record.classroom_id === member.classroom_id);
			const memberPresent = memberAttendance.filter((record) => record.present).length;
			const memberAttendanceRate = memberAttendance.length ? Math.round((memberPresent / memberAttendance.length) * 100) : null;
			const scoreDetails = memberGraded.length
				? `<details class="teacher-performance-scores"><summary>Ver ${memberGraded.length} nota(s)</summary><ul>${memberGraded.map((submission) => {
					const assignment = assignmentById.get(submission.assignment_id)!;
					return `<li><span>${escapeHtml(assignment.title)}</span><strong>${Number(submission.score).toLocaleString('pt-BR')} / ${Number(assignment.max_score).toLocaleString('pt-BR')}</strong></li>`;
				}).join('')}</ul></details>`
				: '<span class="teacher-performance-no-scores">Sem notas lançadas</span>';
			return `
				<article class="teacher-performance-student">
					<div class="teacher-performance-student-name"><span class="performance-medal" aria-hidden="true">👤</span><div><strong>${escapeHtml(member.profile?.full_name ?? 'Aluno')}</strong><small>${escapeHtml(member.classroom?.name ?? 'Turma')}</small></div></div>
					<div class="teacher-performance-metric"><span>Média</span><strong>${memberAverage === null ? '—' : memberAverage.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}<small>${memberAverage === null ? '' : ' / 10'}</small></strong></div>
					<div class="teacher-performance-metric"><span>Frequência</span><strong>${memberAttendanceRate === null ? '—' : `${memberAttendanceRate}%`}</strong><small>${memberPresent}/${memberAttendance.length} aulas</small></div>
					<div class="teacher-performance-score-details">${scoreDetails}</div>
				</article>
			`;
		}).join('');
	};

	filter.addEventListener('change', renderSelectedPerformance);
	renderSelectedPerformance();
}

async function renderClassroom(): Promise<void> {
	if (!pageContent) return;
	if (classroomChannel) {
		await supabase.removeChannel(classroomChannel);
		classroomChannel = null;
	}

	pageContent.innerHTML = `
		<section class="classroom-page" aria-labelledby="classroom-title">
			<header class="classroom-heading">
				<div>
					<p class="section-label">SALAS DE AULA</p>
					<h2 id="classroom-title">Minhas salas</h2>
					<p>Entre na turma correta ou crie uma nova sala para seus alunos.</p>
				</div>
				<span class="classroom-demo-badge">Salas conectadas</span>
			</header>
			<div class="classroom-demo-notice" data-classroom-status role="status">Carregando suas salas...</div>
			<div class="classroom-layout classroom-room-layout">
				<section class="classroom-call" aria-labelledby="classroom-list-title">
					<div class="classroom-panel-heading">
						<div><h3 id="classroom-list-title">Turmas disponíveis</h3><p>Você só verá as salas das quais participa.</p></div>
					</div>
					<div data-classroom-list class="classroom-room-list"></div>
					<form data-classroom-join class="classroom-chat-form classroom-join-form">
						<label for="classroom-join-code">Entrar com código</label>
						<div><input id="classroom-join-code" name="code" maxlength="8" placeholder="Ex.: A1B2C3D4" required><button type="submit">Entrar</button></div>
					</form>
					<form data-classroom-create class="classroom-chat-form classroom-create-form" hidden>
						<strong class="classroom-create-heading">Criar sala <span>Professor</span></strong>
						<label for="classroom-name">Nome da turma
							<input id="classroom-name" name="name" maxlength="80" placeholder="Ex.: Reforço de matemática" required>
						</label>
						<label for="classroom-subject">Disciplina
							<input id="classroom-subject" name="subject" maxlength="50" placeholder="Ex.: Matemática" required>
						</label>
						<button type="submit">Criar sala</button>
					</form>
				</section>
				<section class="classroom-board" data-classroom-selected aria-live="polite">
					<h3>Selecione uma sala</h3>
					<p>As atividades e a conversa da turma aparecerão aqui.</p>
				</section>
			</div>
		</section>
	`;

	const status = pageContent.querySelector<HTMLElement>('[data-classroom-status]');
	const list = pageContent.querySelector<HTMLElement>('[data-classroom-list]');
	if (!status || !list) throw new Error('A interface de salas não foi encontrada.');

	const { data: userData, error: userError } = await supabase.auth.getUser();
	if (userError || !userData.user) {
		status.textContent = 'Entre na sua conta para acessar as salas.';
		return;
	}

	const userId = userData.user.id;
	const { data: profile, error: profileError } = await supabase
		.from('profiles')
		.select('role')
		.eq('id', userId)
		.maybeSingle();
	if (profileError) {
		console.error('Não foi possível carregar o perfil do usuário.', profileError);
		status.textContent = 'Não foi possível identificar seu tipo de conta.';
		return;
	}

	let classrooms: Classroom[] = [];
	if (profile?.role === 'teacher') {
		const result = await supabase.from('classrooms').select('*').eq('teacher_id', userId).order('created_at', { ascending: false });
		if (result.error) throw result.error;
		classrooms = result.data ?? [];
		const createForm = pageContent.querySelector<HTMLFormElement>('[data-classroom-create]');
		if (createForm) createForm.hidden = false;
	} else {
		const memberships = await supabase.from('classroom_members').select('classroom_id').eq('student_id', userId);
		if (memberships.error) throw memberships.error;
		const ids = (memberships.data ?? []).map((membership: { classroom_id: string }) => membership.classroom_id);
		if (ids.length) {
			const result = await supabase.from('classrooms').select('*').in('id', ids).order('created_at', { ascending: false });
			if (result.error) throw result.error;
			classrooms = result.data ?? [];
		}
	}

	status.textContent = classrooms.length ? 'Escolha uma turma para entrar na sala.' : 'Você ainda não participa de nenhuma turma.';
	list.innerHTML = classrooms.length
		? classrooms.map((classroom) => `
			<button type="button" class="classroom-room-option${classroom.id === selectedClassroomId ? ' is-active' : ''}" data-classroom-id="${classroom.id}">
				<strong>${escapeHtml(classroom.name)}</strong><span>${escapeHtml(classroom.subject)} · Código ${escapeHtml(classroom.join_code)}</span>
			</button>
		`).join('')
		: '<p class="empty-state">Nenhuma sala encontrada.</p>';

	const selectClassroom = async (classroom: Classroom): Promise<void> => {
		selectedClassroomId = classroom.id;
		sessionStorage.setItem('selected-classroom', classroom.id);
		pageContent.querySelectorAll<HTMLButtonElement>('[data-classroom-id]').forEach((button) => {
			button.classList.toggle('is-active', button.dataset.classroomId === classroom.id);
		});
		const selected = pageContent.querySelector<HTMLElement>('[data-classroom-selected]');
		if (!selected) return;
		const memberResult = await supabase.from('classroom_members').select('student_id').eq('classroom_id', classroom.id);
		const messagesResult = await supabase
			.from('classroom_messages')
			.select('id, classroom_id, author_id, body, created_at, author:profiles!author_id(full_name)')
			.eq('classroom_id', classroom.id)
			.order('created_at', { ascending: true })
			.limit(100);
		if (memberResult.error || messagesResult.error) throw memberResult.error ?? messagesResult.error;
		const messages = (messagesResult.data ?? []) as ClassroomMessage[];
		selected.innerHTML = `
			<div class="classroom-panel-heading"><div><h3>${escapeHtml(classroom.name)}</h3><p>${escapeHtml(classroom.subject)} · Código ${escapeHtml(classroom.join_code)}</p></div><span class="classroom-chat-count">${(memberResult.data ?? []).length + 1} participantes</span></div>
			<p class="classroom-room-help">Compartilhe o código da sala apenas com os alunos desta turma.</p>
			<div class="classroom-chat-messages" data-classroom-messages>${messages.map((message) => `<div class="classroom-message"><strong>${escapeHtml(message.author?.full_name ?? 'Aluno')} <time>${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.created_at))}</time></strong><p>${escapeHtml(message.body)}</p></div>`).join('')}</div>
			<form class="classroom-chat-form" data-classroom-chat><input name="message" maxlength="300" placeholder="Escreva uma mensagem..." required><button type="submit">Enviar</button></form>
		`;
		pageContent.querySelector<HTMLFormElement>('[data-classroom-chat]')?.addEventListener('submit', async (event) => {
			event.preventDefault();
			const form = event.currentTarget;
			if (!(form instanceof HTMLFormElement)) return;
			const input = form.elements.namedItem('message');
			if (!(input instanceof HTMLInputElement) || !input.value.trim()) return;
			const result = await supabase.from('classroom_messages').insert({ classroom_id: classroom.id, author_id: userId, body: input.value.trim() });
			if (result.error) {
				console.error('Não foi possível enviar a mensagem.', result.error);
				return;
			}
			input.value = '';
			await selectClassroom(classroom);
		});
		classroomChannel = supabase.channel(`classroom-${classroom.id}`)
			.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'classroom_messages', filter: `classroom_id=eq.${classroom.id}` }, () => {
				void selectClassroom(classroom);
			})
			.subscribe();
	};

	pageContent.querySelectorAll<HTMLButtonElement>('[data-classroom-id]').forEach((button) => {
		button.addEventListener('click', () => {
			const classroom = classrooms.find((item) => item.id === button.dataset.classroomId);
			if (classroom) void selectClassroom(classroom);
		});
	});
	pageContent.querySelector<HTMLFormElement>('[data-classroom-join]')?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const form = event.currentTarget;
		if (!(form instanceof HTMLFormElement)) return;
		const input = form.elements.namedItem('code');
		if (!(input instanceof HTMLInputElement)) return;
		const result = await supabase.rpc('join_classroom', { classroom_code: input.value });
		if (result.error) {
			status.textContent = result.error.message.includes('inválido') ? 'Código de sala inválido.' : 'Não foi possível entrar na sala.';
			return;
		}
		input.value = '';
		await renderClassroom();
	});
	pageContent.querySelector<HTMLFormElement>('[data-classroom-create]')?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const form = event.currentTarget;
		if (!(form instanceof HTMLFormElement)) return;
		const formData = new FormData(form);
		const result = await supabase.from('classrooms').insert({
			teacher_id: userId,
			name: String(formData.get('name') ?? '').trim(),
			subject: String(formData.get('subject') ?? '').trim(),
		}).select().single();
		if (result.error) {
			console.error('Não foi possível criar a sala.', result.error);
			status.textContent = 'Não foi possível criar a sala.';
			return;
		}
		form.reset();
		await renderClassroom();
	});
	if (selectedClassroomId) {
		const selectedClassroom = classrooms.find((classroom) => classroom.id === selectedClassroomId);
		if (selectedClassroom) await selectClassroom(selectedClassroom);
	}
}

function isSubjectFilter(value: string | undefined): value is SubjectFilter {
	return value !== undefined && categories.some((category) => category === value);
}

function isContentTypeFilter(value: string): value is ContentTypeFilter {
	return value === 'Todos' || value === 'material' || value === 'summary' || value === 'exercise' || value === 'guide' || value === 'activity';
}

function getFilteredMaterials(getSearchText: (material: Material) => string): Material[] {
	const normalizedQuery = searchQuery.trim().toLocaleLowerCase('pt-BR');

	return materials.filter((material) => {
		const matchesCategory = activeCategory === 'Todos' || material.subject === activeCategory;
		const searchableText = getSearchText(material).toLocaleLowerCase('pt-BR');
		return matchesCategory && searchableText.includes(normalizedQuery);
	});
}

function getContentTypeLabel(contentType: 'material' | ContentType): string {
	switch (contentType) {
		case 'summary': return 'Resumo';
		case 'exercise': return 'Exercícios';
		case 'guide': return 'Guia de estudo';
		case 'activity': return 'Atividade';
		default: return 'Outro material';
	}
}

function renderMaterialCards(items: Material[]): string {
	return items.map((material) => {
		const visual = getMaterialVisual(material.subject);

		return `
			<article class="material-card ${visual.cardClass}">
				<div class="material-card-art" aria-hidden="true"><span>${visual.icon}</span></div>
				<div class="material-card-meta">
					<span class="material-subject">${material.subject}</span>
					<span class="material-format">${getContentTypeLabel(material.contentType)} · ${material.format.split('·').slice(1).join('·').trim()}</span>
				</div>
				<h3>${material.title}</h3>
				<p class="material-card-description">${material.description}</p>
				<button class="material-details-button" type="button" data-content-details="${escapeHtml(material.title)}">Ver detalhes <span aria-hidden="true">→</span></button>
			</article>
		`;
	}).join('');
}

function getMaterialVisual(subject: string): { cardClass: string; icon: string } {
	const normalizedSubject = subject.toLocaleLowerCase('pt-BR');
	if (normalizedSubject.includes('matem')) return { cardClass: 'material-card-math', icon: '🧮' };
	if (normalizedSubject.includes('portugu')) return { cardClass: 'material-card-language', icon: '📚' };
	if (normalizedSubject.includes('ciên') || normalizedSubject.includes('cien')) return { cardClass: 'material-card-science', icon: '🔬' };
	return { cardClass: 'material-card-general', icon: '✦' };
}

function renderPublishedCards(items: PublishedContent[]): string {
	return items.map((content) => {
		const visual = getMaterialVisual(content.subject);
		return `
			<article class="material-card ${visual.cardClass}">
				<div class="material-card-art" aria-hidden="true"><span>${visual.icon}</span></div>
				<div class="material-card-meta"><span class="material-subject">${escapeHtml(content.subject)}</span><span class="material-format">${getContentTypeLabel(content.content_type)}</span></div>
				<h3>${escapeHtml(content.title)}</h3>
				<p class="material-card-description">${escapeHtml(content.description ?? '')}</p>
				<button class="material-details-button" type="button" data-published-content-id="${escapeHtml(content.id)}">Ver detalhes <span aria-hidden="true">→</span></button>
			</article>
		`;
	}).join('');
}

function attachContentDetails(): void {
	if (!pageContent) return;
	pageContent.querySelectorAll<HTMLButtonElement>('[data-content-details]').forEach((button) => {
		button.addEventListener('click', () => {
			const material = materials.find((item) => item.title === button.dataset.contentDetails);
			if (material) {
				const description = material.contentType === 'summary' ? material.summary : material.description;
				showContentDetails(material.title, material.subject, description, null, null);
			}
		});
	});
	pageContent.querySelectorAll<HTMLButtonElement>('[data-published-content-id]').forEach((button) => {
		button.addEventListener('click', () => {
			const content = publishedContents.find((item) => item.id === button.dataset.publishedContentId);
			if (content) showContentDetails(content.title, content.subject, content.description ?? '', content.attachment_url, content.attachment_name);
		});
	});
}

function showContentDetails(title: string, subject: string, description: string, attachmentUrl: string | null, attachmentName: string | null): void {
	const modal = document.createElement('dialog');
	modal.className = 'content-modal';
	modal.innerHTML = `<article class="content-details"><div class="content-modal-heading"><div><p class="section-label">${escapeHtml(subject)}</p><h3>${escapeHtml(title)}</h3></div><button type="button" class="modal-close" aria-label="Fechar">×</button></div><div class="content-details-body">${escapeHtml(description).replace(/\n/g, '<br>')}</div>${attachmentUrl ? `<a class="home-primary-link" href="${escapeHtml(attachmentUrl)}" target="_blank" rel="noopener noreferrer" download>${escapeHtml(attachmentName ?? 'Baixar arquivo')}</a>` : ''}</article>`;
	document.body.append(modal);
	modal.querySelector<HTMLButtonElement>('.modal-close')?.addEventListener('click', () => modal.close());
	modal.addEventListener('close', () => modal.remove(), { once: true });
	modal.showModal();
}

function setTheme(theme: 'light' | 'dark'): void {
	document.documentElement.dataset.theme = theme;
	localStorage.setItem('theme', theme);

	document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]').forEach((button) => {
		button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
	});
}

function setMobileMenuOpen(isOpen: boolean): void {
	if (!sidebar || !menuToggle) return;

	sidebar.dataset.open = String(isOpen);
	menuToggle.setAttribute('aria-expanded', String(isOpen));
	menuToggle.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
	const label = menuToggle.querySelector<HTMLElement>('[data-menu-label]');
	if (label) label.textContent = isOpen ? 'Fechar' : 'Menu';
}

function renderFilterPicker(kind: 'subject' | 'content-type'): string {
	const optionsId = `materials-${kind}-options`;
	const label = kind === 'subject' ? 'Disciplina' : 'Tipo de conteúdo';
	const options = kind === 'subject'
		? categories.map((value) => ({ value, label: value === 'Todos' ? 'Todas as disciplinas' : value }))
		: (['Todos', 'summary', 'exercise', 'guide', 'activity', 'material'] as ContentTypeFilter[])
			.map((value) => ({ value, label: value === 'Todos' ? 'Todos os tipos' : getContentTypeLabel(value) }));
	const selectedValue = kind === 'subject' ? activeCategory : activeContentType;
	return `
		<div class="subject-picker" data-filter-picker="${kind}" data-open="false">
			<span class="subject-picker-label">${label}</span>
			<button
				class="subject-picker-trigger"
				type="button"
				data-filter-trigger
				aria-expanded="false"
				aria-controls="${optionsId}"
			>
				<span class="subject-picker-value" data-selected-filter>${options.find((option) => option.value === selectedValue)?.label}</span>
				<svg class="subject-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
			</button>
			<div class="subject-options" id="${optionsId}" data-filter-options aria-hidden="true" inert>
				<div class="subject-options-panel" role="group" aria-label="Filtrar por ${label.toLocaleLowerCase('pt-BR')}">
					${options.map((option) => `
						<button
							class="subject-option"
							type="button"
							data-filter-option="${kind}"
							data-filter-value="${option.value}"
							aria-pressed="${option.value === selectedValue}"
						>
							<span>${option.label}</span>
							<span class="subject-check" aria-hidden="true">&#10003;</span>
						</button>
					`).join('')}
				</div>
			</div>
		</div>
	`;
}

function setFilterMenuOpen(picker: HTMLElement, isOpen: boolean): void {
	picker.dataset.open = String(isOpen);
	picker.querySelector<HTMLButtonElement>('[data-filter-trigger]')?.setAttribute('aria-expanded', String(isOpen));

	const options = picker.querySelector<HTMLElement>('[data-filter-options]');
	options?.setAttribute('aria-hidden', String(!isOpen));
	options?.toggleAttribute('inert', !isOpen);
}

async function renderMaterials(): Promise<void> {
	if (!pageContent) return;
	await loadPublishedContents();

	const filteredMaterials = getFilteredMaterials(
		(material) => `${material.title} ${material.subject} ${material.description} ${material.format}`,
	);
	const filteredMaterialsByType = filteredMaterials.filter((material) => activeContentType === 'Todos' || material.contentType === activeContentType);
	const filteredPublished = publishedContents.filter((content) =>
		(activeContentType === 'Todos' || content.content_type === activeContentType)
		&& (activeCategory === 'Todos' || content.subject === activeCategory)
		&& `${content.title} ${content.subject} ${content.description ?? ''}`.toLocaleLowerCase('pt-BR').includes(searchQuery.trim().toLocaleLowerCase('pt-BR')),
	);
	const list = pageContent.querySelector<HTMLElement>('[data-material-list]');
	const count = pageContent.querySelector<HTMLElement>('[data-material-count]');
	if (!list || !count) return;

	const total = filteredMaterialsByType.length + filteredPublished.length;
	const resultLabel = total === 1 ? 'material encontrado' : 'materiais encontrados';
	count.textContent = `${total} ${resultLabel}`;
	list.innerHTML = total
		? `${renderMaterialCards(filteredMaterialsByType)}${renderPublishedCards(filteredPublished)}`
		: '<p class="empty-state">Nenhum material encontrado. Tente outro termo ou disciplina.</p>';
	attachContentDetails();
}

function renderPage(page: Page): void {
	if (!pageContent) return;
	if (classroomBoardResizeHandler) {
		window.removeEventListener('resize', classroomBoardResizeHandler);
		classroomBoardResizeHandler = null;
	}

	const isAuthPage = page === 'login' || page === 'register';
	document.body.classList.toggle('login-mode', isAuthPage);
	pageContent.classList.toggle('login-content', isAuthPage);
	pageContent.classList.toggle('home-content', page === 'home');
	pageLinks.forEach((link) => {
		if (link.dataset.page === page) {
			link.setAttribute('aria-current', 'page');
		} else {
			link.removeAttribute('aria-current');
		}
	});

	if (page === 'classroom') {
		void renderClassroom().catch((error) => {
			console.error('Erro ao carregar as salas de aula.', error);
			const status = document.querySelector<HTMLElement>('[data-classroom-status]');
			if (status) status.textContent = 'Não foi possível carregar as salas. Tente novamente.';
		});
		return;
	}

	if (page === 'home') {
		pageContent.innerHTML = `
			<section class="home-dashboard" aria-labelledby="home-title">
				<div class="home-welcome">
					<div class="home-welcome-copy">
						<p class="section-label">SEU ESPAÇO DE APRENDIZADO</p>
						<h2 id="home-title">Olá! Vamos aprender hoje?</h2>
						<p>Encontre um assunto, revise no seu ritmo e siga avançando nos estudos.</p>
						<a class="home-primary-link" href="#materials">Explorar materiais <span aria-hidden="true">→</span></a>
					</div>
					<div class="home-welcome-art" aria-hidden="true">
						<span class="home-art-sparkle sparkle-one">✦</span>
						<span class="home-art-sparkle sparkle-two">✧</span>
						<svg viewBox="0 0 120 100" focusable="false">
							<path d="M12 30c17-9 32-8 48 2 16-10 31-11 48-2v52c-18-8-33-7-48 3-15-10-30-11-48-3V30Z" />
							<path d="M60 32v53M22 43c11-5 20-5 29 0M22 54c11-5 20-5 29 0M69 43c9-5 18-5 29 0M69 54c9-5 18-5 29 0" />
						</svg>
					</div>
				</div>

				<section class="home-shortcuts" aria-labelledby="home-shortcuts-title">
					<div class="home-section-heading">
						<div>
							<p class="section-label">COMECE POR AQUI</p>
							<h3 id="home-shortcuts-title">O que você quer estudar?</h3>
						</div>
					</div>
					<div class="home-shortcut-grid">
						<a class="home-shortcut" href="#materials">
							<span class="home-shortcut-icon" aria-hidden="true">▤</span>
							<span class="home-shortcut-copy">
								<strong>Revisar resumos</strong>
								<span>${materials.length} resumos para relembrar os principais conceitos.</span>
							</span>
							<span class="home-shortcut-arrow" aria-hidden="true">→</span>
						</a>
						<a class="home-shortcut" href="#materials">
							<span class="home-shortcut-icon" aria-hidden="true">◷</span>
							<span class="home-shortcut-copy">
								<strong>Explorar materiais</strong>
								<span>${materials.length} conteúdos para aprender e praticar.</span>
							</span>
							<span class="home-shortcut-arrow" aria-hidden="true">→</span>
						</a>
					</div>
				</section>

				<aside class="home-study-tip">
					<span class="home-tip-icon" aria-hidden="true">✦</span>
					<p><strong>Uma dica para hoje</strong><br>Escolha um assunto e avance um passo de cada vez. Seu ritmo também faz parte do aprendizado.</p>
				</aside>
			</section>
		`;
		void loadCurrentProfile().then((profile) => {
			const heading = pageContent.querySelector<HTMLElement>('#home-title');
			if (!heading || !profile) return;
			const roleLabel = profile.role === 'teacher' ? 'professor(a)' : 'aluno(a)';
			heading.textContent = profile.fullName
				? `Olá, ${profile.fullName}! Você está no espaço do ${roleLabel}.`
				: `Olá! Você está no espaço do ${roleLabel}.`;
		});
		return;
	}

	if (page === 'performance') {
		void renderPerformanceFromDatabase().catch((error) => {
			console.error('Erro ao carregar o desempenho.', error);
			if (window.location.hash === pageHashes.performance) {
				pageContent.innerHTML = '<section class="performance-page"><div class="performance-demo-notice" role="alert">Não foi possível carregar o desempenho. Tente novamente.</div></section>';
			}
		});
		return;

		pageContent!.innerHTML = `
			<section class="performance-page" aria-labelledby="performance-title">
				<header class="performance-heading">
					<div>
						<p class="section-label">ACOMPANHAMENTO ESCOLAR</p>
						<h2 id="performance-title">Painel de Desempenho</h2>
						<p>Acompanhe notas, frequência e conquistas ao longo dos estudos.</p>
					</div>
					<span class="performance-demo-badge">Dados de demonstração</span>
				</header>

				<div class="performance-demo-notice" role="note">
					<strong>Exemplo ilustrativo:</strong> estes indicadores são fictícios. Os dados reais do aluno ainda não estão conectados ao sistema.
				</div>

				<section class="performance-stat-grid" aria-label="Resumo do desempenho">
					<article class="performance-stat-card">
						<span class="performance-stat-icon" aria-hidden="true">▤</span>
						<div><p>Média geral</p><strong>8,7 <small>/ 10</small></strong><span class="performance-stat-detail">Bom ritmo de aprendizagem</span></div>
					</article>
					<article class="performance-stat-card">
						<span class="performance-stat-icon" aria-hidden="true">✓</span>
						<div><p>Frequência</p><strong>94<small>%</small></strong><span class="performance-stat-detail">Presença nas aulas</span></div>
					</article>
					<article class="performance-stat-card">
						<span class="performance-stat-icon" aria-hidden="true">✦</span>
						<div><p>Tarefas concluídas</p><strong>12 <small>/ 15</small></strong><span class="performance-stat-detail">Neste período</span></div>
					</article>
					<article class="performance-stat-card">
						<span class="performance-stat-icon" aria-hidden="true">♛</span>
						<div><p>Conquistas</p><strong>3 <small>medalhas</small></strong><span class="performance-stat-detail">Continue assim!</span></div>
					</article>
				</section>

				<div class="performance-details-grid">
					<section class="performance-panel" aria-labelledby="performance-grades-title">
						<div class="performance-panel-heading">
							<div><h3 id="performance-grades-title">Notas por disciplina</h3><p>Resultados do período</p></div>
							<span class="performance-period">1º trimestre</span>
						</div>
						<ul class="performance-grade-list">
							<li class="performance-grade-row">
								<div class="performance-grade-label"><span>Matemática</span><strong>9,0</strong></div>
								<div class="performance-progress" role="progressbar" aria-label="Nota em Matemática" aria-valuemin="0" aria-valuemax="10" aria-valuenow="9"><span style="--progress: 90%"></span></div>
							</li>
							<li class="performance-grade-row">
								<div class="performance-grade-label"><span>Português</span><strong>8,5</strong></div>
								<div class="performance-progress" role="progressbar" aria-label="Nota em Português" aria-valuemin="0" aria-valuemax="10" aria-valuenow="8.5"><span style="--progress: 85%"></span></div>
							</li>
							<li class="performance-grade-row">
								<div class="performance-grade-label"><span>Ciências</span><strong>8,6</strong></div>
								<div class="performance-progress" role="progressbar" aria-label="Nota em Ciências" aria-valuemin="0" aria-valuemax="10" aria-valuenow="8.6"><span style="--progress: 86%"></span></div>
							</li>
						</ul>
					</section>

					<section class="performance-panel" aria-labelledby="performance-attendance-title">
						<div class="performance-panel-heading">
							<div><h3 id="performance-attendance-title">Frequência nas aulas</h3><p>Participação neste trimestre</p></div>
						</div>
						<div class="performance-attendance-summary">
							<strong>94%</strong>
							<span>de presença</span>
						</div>
						<div class="performance-progress performance-attendance-progress" role="progressbar" aria-label="Frequência nas aulas" aria-valuemin="0" aria-valuemax="100" aria-valuenow="94"><span style="--progress: 94%"></span></div>
						<p class="performance-attendance-detail">15 aulas realizadas <span>·</span> 14 presenças</p>
					</section>

					<section class="performance-panel performance-achievements" aria-labelledby="performance-achievements-title">
						<div class="performance-panel-heading">
							<div><h3 id="performance-achievements-title">Medalhas e conquistas</h3><p>Reconhecendo cada passo</p></div>
						</div>
						<ul class="performance-achievement-list">
							<li><span class="performance-medal" aria-hidden="true">🏅</span><span><strong>Primeiro passo</strong><small>Concluiu a primeira tarefa</small></span><span class="performance-earned">Conquistada</span></li>
							<li><span class="performance-medal" aria-hidden="true">⭐</span><span><strong>Presença nota 10</strong><small>Participou de 10 aulas</small></span><span class="performance-earned">Conquistada</span></li>
							<li><span class="performance-medal performance-medal-next" aria-hidden="true">🎯</span><span><strong>Foco nos estudos</strong><small>Conclua mais 3 tarefas</small></span><span class="performance-in-progress">Em progresso</span></li>
						</ul>
					</section>
				</div>
			</section>
		`;
		return;
	}

	if (page === 'users') {
		void renderUserManagement().catch((error) => {
			console.error('Erro ao carregar o gerenciamento de usuários.', error);
			if (window.location.hash === pageHashes.users) {
				pageContent.innerHTML = '<section class="users-page"><div class="users-notice" role="alert">Não foi possível carregar os usuários. Tente novamente.</div></section>';
			}
		});
		return;
	}

	if (page === 'agenda') {
		void renderAgendaFromDatabase().catch((error) => {
			console.error('Erro ao carregar a agenda.', error);
			if (window.location.hash === pageHashes.agenda) {
				pageContent.innerHTML = '<section class="agenda-page"><div class="agenda-demo-notice" role="alert">Não foi possível carregar a agenda. Tente novamente.</div></section>';
			}
		});
		return;

		const formatAgendaDate = (daysFromToday: number) => {
			const date = new Date();
			date.setDate(date.getDate() + daysFromToday);
			return {
				day: new Intl.DateTimeFormat('pt-BR', { day: '2-digit' }).format(date),
				month: new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', ''),
				weekday: new Intl.DateTimeFormat('pt-BR', { weekday: 'long' }).format(date),
			};
		};
		const nextClass = formatAgendaDate(1);
		const nextReview = formatAgendaDate(3);
		const nextAssignment = formatAgendaDate(5);

		pageContent!.innerHTML = `
			<section class="agenda-page" aria-labelledby="agenda-title">
				<header class="agenda-heading">
					<div>
						<p class="section-label">ORGANIZE SEUS ESTUDOS</p>
						<h2 id="agenda-title">Agenda</h2>
						<p>Confira os próximos encontros e prazos para não deixar nada passar.</p>
					</div>
					<span class="agenda-demo-badge">Agenda de demonstração</span>
				</header>

				<div class="agenda-demo-notice" role="note">
					<strong>Exemplo ilustrativo:</strong> estes horários e atividades são fictícios e ainda não estão conectados a uma agenda real.
				</div>

				<div class="agenda-layout">
					<section class="agenda-panel" aria-labelledby="agenda-upcoming-title">
						<div class="agenda-panel-heading">
							<div><h3 id="agenda-upcoming-title">Próximos compromissos</h3><p>Aulas e atividades programadas</p></div>
							<span class="agenda-count">3 eventos</span>
						</div>
						<ol class="agenda-event-list">
							<li class="agenda-event">
								<div class="agenda-date" aria-label="${nextClass.weekday}, ${nextClass.day} de ${nextClass.month}">
									<strong>${nextClass.day}</strong><span>${nextClass.month}</span>
								</div>
								<div class="agenda-event-copy">
									<span class="agenda-event-type agenda-class-type">Aula de reforço</span>
									<h4>Matemática com a Prof. Ana</h4>
									<p><span aria-hidden="true">◷</span> 14:00 – 15:00 <span class="agenda-event-separator">·</span> Sala de Aula</p>
								</div>
							</li>
							<li class="agenda-event">
								<div class="agenda-date" aria-label="${nextReview.weekday}, ${nextReview.day} de ${nextReview.month}">
									<strong>${nextReview.day}</strong><span>${nextReview.month}</span>
								</div>
								<div class="agenda-event-copy">
									<span class="agenda-event-type agenda-class-type">Aula de reforço</span>
									<h4>Português: interpretação de texto</h4>
									<p><span aria-hidden="true">◷</span> 10:30 – 11:30 <span class="agenda-event-separator">·</span> Sala de Aula</p>
								</div>
							</li>
							<li class="agenda-event">
								<div class="agenda-date agenda-date-deadline" aria-label="${nextAssignment.weekday}, ${nextAssignment.day} de ${nextAssignment.month}">
									<strong>${nextAssignment.day}</strong><span>${nextAssignment.month}</span>
								</div>
								<div class="agenda-event-copy">
									<span class="agenda-event-type agenda-deadline-type">Prazo de atividade</span>
									<h4>Exercícios de frações</h4>
									<p><span aria-hidden="true">✓</span> Entregar até 18:00 <span class="agenda-event-separator">·</span> Matemática</p>
								</div>
							</li>
						</ol>
					</section>

					<aside class="agenda-side-panel">
						<section class="agenda-panel agenda-week-panel" aria-labelledby="agenda-week-title">
							<div class="agenda-panel-heading">
								<div><h3 id="agenda-week-title">Esta semana</h3><p>Seu resumo de atividades</p></div>
							</div>
							<div class="agenda-week-stats">
								<div><span class="agenda-week-icon" aria-hidden="true">▣</span><span><strong>2</strong><small>aulas</small></span></div>
								<div><span class="agenda-week-icon agenda-week-icon-deadline" aria-hidden="true">✓</span><span><strong>1</strong><small>prazo</small></span></div>
							</div>
						</section>
						<section class="agenda-reminder" aria-label="Lembrete">
							<span aria-hidden="true">✦</span>
							<div><h3>Dica para se organizar</h3><p>Reserve alguns minutos antes da aula para separar seus materiais e revisar suas dúvidas.</p></div>
						</section>
					</aside>
				</div>
			</section>
		`;
		return;
	}

	if (window.location.hash === '#classroom' && pageContent) {
		pageContent.innerHTML = `
			<section class="classroom-page" aria-labelledby="classroom-title">
				<header class="classroom-heading">
					<div>
						<p class="section-label">SALA DE AULA</p>
						<h2 id="classroom-title">Aula de Matemática</h2>
						<p>Estude junto, converse e resolva exercícios na lousa.</p>
					</div>
					<span class="classroom-demo-badge">Modo demonstração</span>
				</header>
				<p class="classroom-demo-notice">Esta sala é uma demonstração local. As pessoas, a chamada e o chat não estão conectados a outros dispositivos.</p>
				<div class="classroom-layout">
					<div class="classroom-main">
						<section class="classroom-call" aria-label="Participantes da chamada">
							<div class="classroom-call-heading">
								<div>
									<h3>Chamada em grupo</h3>
									<p><span class="classroom-live-dot"></span> Sala aberta · 3 participantes</p>
								</div>
							</div>
							<div class="classroom-participant-grid">
								<div class="classroom-participant classroom-participant-speaking">
									<div class="classroom-avatar classroom-avatar-teacher" aria-hidden="true">AN</div>
									<span class="classroom-participant-name">Prof. Ana <span aria-hidden="true">🎙</span></span>
								</div>
								<div class="classroom-participant">
									<div class="classroom-avatar classroom-avatar-student" aria-hidden="true">LC</div>
									<span class="classroom-participant-name">Lucas</span>
								</div>
								<div class="classroom-participant classroom-participant-self">
									<div class="classroom-avatar classroom-avatar-you" aria-hidden="true">VC</div>
									<span class="classroom-participant-name">Você</span>
								</div>
							</div>
							<div class="classroom-controls" role="group" aria-label="Controles da chamada">
								<button type="button" class="classroom-control" data-classroom-control="microphone" aria-pressed="true">
									<span aria-hidden="true">🎙</span><span data-control-label>Microfone</span>
								</button>
								<button type="button" class="classroom-control" data-classroom-control="camera" aria-pressed="true">
									<span aria-hidden="true">▣</span><span data-control-label>Câmera</span>
								</button>
								<button type="button" class="classroom-control classroom-control-leave" data-classroom-leave>
									<span aria-hidden="true">↗</span><span>Sair da sala</span>
								</button>
							</div>
						</section>

						<section class="classroom-board" aria-labelledby="board-title">
							<div class="classroom-panel-heading">
								<div>
									<h3 id="board-title">Lousa interativa</h3>
									<p>Rascunhe uma ideia ou resolva um exercício.</p>
								</div>
								<div class="classroom-board-tools" role="group" aria-label="Ferramentas da lousa">
									<div class="classroom-board-colors" role="group" aria-label="Cor da caneta">
										<button type="button" class="board-color is-active" data-board-color="#355f50" aria-label="Verde" aria-pressed="true" style="--board-color: #355f50"></button>
										<button type="button" class="board-color" data-board-color="#315f9b" aria-label="Azul" aria-pressed="false" style="--board-color: #315f9b"></button>
										<button type="button" class="board-color" data-board-color="#bd5548" aria-label="Vermelho" aria-pressed="false" style="--board-color: #bd5548"></button>
									</div>
									<button type="button" class="board-tool is-active" data-board-tool="pen" aria-pressed="true">Caneta</button>
									<button type="button" class="board-tool" data-board-tool="eraser" aria-pressed="false">Borracha</button>
									<button type="button" class="board-tool board-tool-clear" data-board-clear>Limpar</button>
								</div>
							</div>
							<div class="classroom-board-canvas-wrap">
								<canvas class="classroom-board-canvas" data-classroom-board aria-label="Lousa para desenhar com mouse, toque ou caneta"></canvas>
							</div>
							<p class="classroom-board-hint">Use o mouse, o dedo ou uma caneta para desenhar.</p>
						</section>
					</div>

					<aside class="classroom-chat" aria-labelledby="chat-title">
						<div class="classroom-panel-heading">
							<div>
								<h3 id="chat-title">Conversa</h3>
								<p>Mensagens desta demonstração</p>
							</div>
							<span class="classroom-chat-count" aria-label="3 participantes">3</span>
						</div>
						<div class="classroom-chat-messages" data-classroom-messages aria-live="polite">
							<div class="classroom-message">
								<strong>Prof. Ana <time>10:02</time></strong>
								<p>Olá, turma! Vamos revisar frações hoje.</p>
							</div>
							<div class="classroom-message">
								<strong>Lucas <time>10:03</time></strong>
								<p>Pronto para começar! 😊</p>
							</div>
						</div>
						<form class="classroom-chat-form" data-classroom-chat>
							<label class="visually-hidden" for="classroom-message-input">Escreva uma mensagem</label>
							<input id="classroom-message-input" name="message" type="text" maxlength="300" placeholder="Escreva uma mensagem..." autocomplete="off" required>
							<button type="submit" aria-label="Enviar mensagem">Enviar</button>
						</form>
					</aside>
				</div>
			</section>
		`;

		const board = pageContent.querySelector<HTMLCanvasElement>('[data-classroom-board]');
		const boardContext = board?.getContext('2d');
		if (!board || !boardContext) throw new Error('Não foi possível iniciar a lousa interativa.');

		let boardTool: 'pen' | 'eraser' = 'pen';
		let selectedColor = '#355f50';
		let isDrawing = false;
		let previousPoint: { x: number; y: number } | null = null;
		const resizeBoard = () => {
			const bounds = board.getBoundingClientRect();
			if (bounds.width === 0 || bounds.height === 0) return;
			const previousCanvas = document.createElement('canvas');
			previousCanvas.width = board.width;
			previousCanvas.height = board.height;
			previousCanvas.getContext('2d')?.drawImage(board, 0, 0);
			const pixelRatio = window.devicePixelRatio || 1;
			board.width = Math.round(bounds.width * pixelRatio);
			board.height = Math.round(bounds.height * pixelRatio);
			boardContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
			boardContext.drawImage(previousCanvas, 0, 0, previousCanvas.width, previousCanvas.height, 0, 0, bounds.width, bounds.height);
			boardContext.lineCap = 'round';
			boardContext.lineJoin = 'round';
		};
		classroomBoardResizeHandler = resizeBoard;
		resizeBoard();
		window.addEventListener('resize', resizeBoard);

		const pointFromEvent = (event: PointerEvent) => {
			const bounds = board.getBoundingClientRect();
			return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
		};
		const drawToPoint = (point: { x: number; y: number }) => {
			if (!previousPoint) return;
			boardContext.globalCompositeOperation = boardTool === 'eraser' ? 'destination-out' : 'source-over';
			boardContext.strokeStyle = selectedColor;
			boardContext.lineWidth = boardTool === 'eraser' ? 22 : 3;
			boardContext.beginPath();
			boardContext.moveTo(previousPoint.x, previousPoint.y);
			boardContext.lineTo(point.x, point.y);
			boardContext.stroke();
			previousPoint = point;
		};
		board.addEventListener('pointerdown', (event) => {
			isDrawing = true;
			previousPoint = pointFromEvent(event);
			board.setPointerCapture(event.pointerId);
			drawToPoint(previousPoint);
		});
		board.addEventListener('pointermove', (event) => {
			if (isDrawing) drawToPoint(pointFromEvent(event));
		});
		const stopDrawing = () => {
			isDrawing = false;
			previousPoint = null;
		};
		board.addEventListener('pointerup', stopDrawing);
		board.addEventListener('pointercancel', stopDrawing);

		pageContent.querySelectorAll<HTMLButtonElement>('[data-board-tool]').forEach((button) => {
			button.addEventListener('click', () => {
				const tool = button.dataset.boardTool;
				if (tool !== 'pen' && tool !== 'eraser') return;
				boardTool = tool;
				pageContent.querySelectorAll<HTMLButtonElement>('[data-board-tool]').forEach((toolButton) => {
					const isActive = toolButton === button;
					toolButton.classList.toggle('is-active', isActive);
					toolButton.setAttribute('aria-pressed', String(isActive));
				});
			});
		});
		pageContent.querySelectorAll<HTMLButtonElement>('[data-board-color]').forEach((button) => {
			button.addEventListener('click', () => {
				const color = button.dataset.boardColor;
				if (!color || !/^#[\da-f]{6}$/i.test(color)) return;
				selectedColor = color;
				boardTool = 'pen';
				pageContent.querySelectorAll<HTMLButtonElement>('[data-board-color]').forEach((colorButton) => {
					const isActive = colorButton === button;
					colorButton.classList.toggle('is-active', isActive);
					colorButton.setAttribute('aria-pressed', String(isActive));
				});
				pageContent.querySelectorAll<HTMLButtonElement>('[data-board-tool]').forEach((toolButton) => {
					const isPen = toolButton.dataset.boardTool === 'pen';
					toolButton.classList.toggle('is-active', isPen);
					toolButton.setAttribute('aria-pressed', String(isPen));
				});
			});
		});
		pageContent.querySelector<HTMLButtonElement>('[data-board-clear]')?.addEventListener('click', () => {
			boardContext.clearRect(0, 0, board.width, board.height);
		});

		pageContent.querySelectorAll<HTMLButtonElement>('[data-classroom-control]').forEach((button) => {
			button.addEventListener('click', () => {
				const isEnabled = button.getAttribute('aria-pressed') === 'true';
				button.setAttribute('aria-pressed', String(!isEnabled));
				const label = button.querySelector<HTMLElement>('[data-control-label]');
				if (label) label.textContent = `${button.dataset.classroomControl === 'microphone' ? 'Microfone' : 'Câmera'} ${isEnabled ? 'desativado' : 'ativado'}`;
			});
		});

		pageContent.querySelector<HTMLFormElement>('[data-classroom-chat]')?.addEventListener('submit', (event) => {
			event.preventDefault();
			const form = event.currentTarget as HTMLFormElement;
			const input = form.elements.namedItem('message');
			if (!(input instanceof HTMLInputElement)) throw new Error('O campo de mensagem da sala não foi encontrado.');
			const text = input.value.trim();
			if (!text) return;
			const message = document.createElement('div');
			message.className = 'classroom-message classroom-message-self';
			const author = document.createElement('strong');
			author.textContent = 'Você';
			const time = document.createElement('time');
			time.textContent = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date());
			author.append(time);
			const body = document.createElement('p');
			body.textContent = text;
			message.append(author, body);
			const messages = pageContent.querySelector<HTMLElement>('[data-classroom-messages]');
			if (!messages) throw new Error('A conversa da sala não foi encontrada.');
			messages.append(message);
			messages.scrollTop = messages.scrollHeight;
			input.value = '';
			input.focus();
		});

		pageContent.querySelector<HTMLButtonElement>('[data-classroom-leave]')?.addEventListener('click', () => {
			window.history.pushState(null, '', pageHashes.home);
			renderPage('home');
			setMobileMenuOpen(false);
		});
		return;
	}

	if (page === 'login' || page === 'register') {
		const isRegisterPage = page === 'register';
		pageContent.innerHTML = `
			<div class="theme-switch login-theme-switch" role="group" aria-label="Escolher tema">
				<button
					type="button"
					data-theme-choice="light"
					aria-label="Ativar tema claro"
					aria-pressed="${document.documentElement.dataset.theme !== 'dark'}"
				>
					<span class="theme-icon" aria-hidden="true">☼</span>
					<span class="theme-label">Claro</span>
				</button>
				<button
					type="button"
					data-theme-choice="dark"
					aria-label="Ativar tema escuro"
					aria-pressed="${document.documentElement.dataset.theme === 'dark'}"
				>
					<span class="theme-icon" aria-hidden="true">☾</span>
					<span class="theme-label">Escuro</span>
				</button>
			</div>
			<section class="login-view" aria-labelledby="auth-title">
				<div class="login-brand">
					<svg class="brand-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
						<path class="book-outline" d="M8 20c9-5 17-5 24 0 7-5 15-5 24 0v29c-9-4-17-4-24 1-7-5-15-5-24-1V20Z" />
						<path class="book-spine" d="M32 20v30" />
						<path class="book-detail" d="M14 28c5-2 9-2 13 0M14 35c5-2 9-2 13 0M38 28c4-2 8-2 12 0M38 35c4-2 8-2 12 0" />
						<path class="brand-sparkle sparkle-left" d="m14 8 2 4 4 2-4 2-2 4-2-4-4-2 4-2 2-4Z" />
						<path class="brand-sparkle sparkle-right" d="m51 5 2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5Z" />
						<circle class="brand-dot dot-left" cx="27" cy="10" r="1.7" />
						<circle class="brand-dot dot-right" cx="42" cy="13" r="1.7" />
					</svg>
					<span>Reforço Escolar</span>
				</div>
				<div class="login-heading">
					<p class="section-label">SEU ESPAÇO DE APRENDIZADO</p>
					<h2 id="auth-title">${isRegisterPage ? 'Cadastro do aluno' : 'Boas-vindas!'}</h2>
					<p>${isRegisterPage ? 'Cadastre seu e-mail e uma senha para começar a estudar.' : 'Entre com seus dados para continuar estudando.'}</p>
				</div>
				<form class="login-form" data-auth-form>
					${isRegisterPage ? `
						<label for="auth-full-name">Nome completo</label>
						<input
							id="auth-full-name"
							name="full_name"
							type="text"
							autocomplete="name"
							placeholder="Seu nome completo"
							required
						>
					` : ''}
					<label for="auth-email">E-mail</label>
					<input
						id="auth-email"
						name="email"
						type="email"
						autocomplete="username"
						placeholder="voce@exemplo.com"
						required
					>
					<div class="login-password-group">
						<label for="auth-password">Senha</label>
						<div class="login-password-field">
							<input
								id="auth-password"
								name="password"
								type="password"
								autocomplete="${isRegisterPage ? 'new-password' : 'current-password'}"
								placeholder="${isRegisterPage ? 'Crie uma senha' : 'Digite sua senha'}"
								minlength="${isRegisterPage ? '6' : '1'}"
								required
							>
							<button class="login-password-toggle" type="button" data-toggle-password aria-label="Mostrar senha" aria-pressed="false">
								<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.7"/></svg>
							</button>
						</div>
						${isRegisterPage ? '' : '<button class="login-forgot-link" type="button" data-reset-password>Esqueceu sua senha?</button>'}
					</div>
					<button class="login-submit" type="submit">${isRegisterPage ? 'Criar conta' : 'Entrar'}</button>
					<p class="login-status" data-login-status role="status" aria-live="polite"></p>
				</form>
				${isRegisterPage
					? '<a class="login-back" href="#login" data-page="login">Já tem uma conta? Entrar</a>'
					: '<p class="login-register-prompt">Não tem uma conta? <a href="#register" data-page="register">Cadastre-se</a></p><a class="login-back" href="#home" data-page="home">Voltar ao início</a>'}
			</section>
		`;

		pageContent.querySelector<HTMLButtonElement>('[data-toggle-password]')?.addEventListener('click', (event) => {
			const toggle = event.currentTarget;
			const passwordInput = pageContent?.querySelector<HTMLInputElement>('#auth-password');
			if (!(toggle instanceof HTMLButtonElement) || !passwordInput) return;
			const isVisible = passwordInput.type === 'text';
			passwordInput.type = isVisible ? 'password' : 'text';
			toggle.setAttribute('aria-pressed', String(!isVisible));
			toggle.setAttribute('aria-label', isVisible ? 'Mostrar senha' : 'Ocultar senha');
		});

		pageContent.querySelector<HTMLButtonElement>('[data-reset-password]')?.addEventListener('click', async () => {
			const emailInput = pageContent?.querySelector<HTMLInputElement>('#auth-email');
			const status = pageContent?.querySelector<HTMLElement>('[data-login-status]');
			if (!emailInput || !status) return;
			emailInput.value = emailInput.value.trim();
			if (!emailInput.value || !emailInput.checkValidity()) {
				emailInput.focus();
				status.textContent = 'Digite um e-mail válido para receber o link de recuperação.';
				return;
			}

			const resetButton = pageContent.querySelector<HTMLButtonElement>('[data-reset-password]');
			if (resetButton) resetButton.disabled = true;
			status.textContent = 'Enviando link de recuperação...';
			try {
				const { error } = await supabase.auth.resetPasswordForEmail(emailInput.value);
				if (error) throw error;
				status.textContent = 'Se este e-mail estiver cadastrado, você receberá um link para redefinir sua senha.';
			} catch (error) {
				console.error('Não foi possível solicitar a recuperação da senha.', error);
				status.textContent = 'Não foi possível enviar o link agora. Tente novamente.';
			} finally {
				if (resetButton) resetButton.disabled = false;
			}
		});

		pageContent.querySelector<HTMLFormElement>('[data-auth-form]')?.addEventListener('submit', async (event) => {
			event.preventDefault();
			const status = pageContent.querySelector<HTMLElement>('[data-login-status]');
			if (!status) throw new Error('O campo de status do login não foi encontrado.');
			const form = event.currentTarget;
			if (!(form instanceof HTMLFormElement)) return;

			const submitButton = form.querySelector<HTMLButtonElement>('[type="submit"]');
			if (!submitButton) throw new Error('O botão de envio do formulário não foi encontrado.');

			const formData = new FormData(form);
			const email = String(formData.get('email') ?? '').trim();
			const password = String(formData.get('password') ?? '');
			const fullName = String(formData.get('full_name') ?? '').trim();

			submitButton.disabled = true;
			status.textContent = isRegisterPage ? 'Criando sua conta...' : 'Entrando...';

			try {
				if (!isRegisterPage) {
					const { data, error } = await supabase.auth.signInWithPassword({
						email,
						password,
					});

					if (error) {
						console.error('Erro ao entrar no Supabase.', error);
						const errorMessage = error.message.toLowerCase();
						if (errorMessage.includes('invalid login credentials')) {
							status.textContent = 'E-mail ou senha incorretos.';
						} else if (errorMessage.includes('email not confirmed')) {
							status.textContent = 'Confirme seu e-mail antes de entrar.';
						} else if (errorMessage.includes('password')) {
							status.textContent = 'Verifique sua senha e tente novamente.';
						} else {
							status.textContent = 'Não foi possível entrar. Tente novamente.';
						}
						return;
					}

					if (!data.user) {
						throw new Error('O Supabase não retornou o usuário autenticado.');
					}

					status.textContent = 'Login realizado com sucesso!';
					form.reset();
					await loadCurrentProfile();
					const initialPage = currentUserRole === 'teacher' ? 'materials' : 'home';
					window.history.pushState(null, '', pageHashes[initialPage]);
					renderPage(initialPage);
					setMobileMenuOpen(false);
					return;
				}

				if (password.length < 6) {
					status.textContent = 'A senha deve ter pelo menos 6 caracteres.';
					return;
				}

				const { data, error } = await supabase.auth.signUp({
					email,
					password,
					options: {
						data: { full_name: fullName, role: 'student' },
					},
				});

				if (error) {
					console.error('Erro ao criar usuário no Supabase.', error);
					const errorMessage = error.message.toLowerCase();
					if (errorMessage.includes('already registered')) {
						status.textContent = 'Este e-mail já está cadastrado.';
					} else if (errorMessage.includes('password should be at least') || error.name === 'AuthWeakPasswordError') {
						status.textContent = 'A senha deve ter pelo menos 6 caracteres.';
					} else {
						status.textContent = 'Não foi possível criar a conta. Verifique os dados e tente novamente.';
					}
					return;
				}

				if (!data.user) {
					throw new Error('O Supabase não retornou o usuário criado.');
				}

				if (data.session) {
					const { error: profileError } = await supabase.from('profiles').upsert({
						id: data.user.id,
						full_name: fullName,
						role: 'student',
					}, { onConflict: 'id' });

					if (profileError) {
						console.error('Usuário criado, mas o perfil não foi salvo.', profileError);
						status.textContent = 'A conta foi criada, mas não foi possível salvar o perfil.';
						return;
					}

					status.textContent = 'Cadastro realizado com sucesso!';
					form.reset();
					return;
				}

				status.textContent = 'Cadastro realizado! Confirme seu e-mail para ativar a conta.';
				form.reset();
			} catch (error) {
				console.error('Erro ao cadastrar usuário.', error);
				status.textContent = 'Não foi possível conectar ao Supabase. Tente novamente.';
			} finally {
				submitButton.disabled = false;
			}
		});
		return;
	}

	activeCategory = 'Todos';
	activeContentType = 'Todos';
	searchQuery = '';
	pageContent.innerHTML = `
		<section class="materials-page" aria-labelledby="materials-title">
			<div class="materials-heading">
				<p class="section-label">BIBLIOTECA DE ESTUDOS</p>
				<h2 id="materials-title">Materiais</h2>
				<p>Encontre resumos, exercícios, guias e atividades para continuar aprendendo.</p>
			</div>
			<div class="materials-toolbar">
				<label class="material-search">
					<span class="visually-hidden">Buscar materiais</span>
					<span class="material-search-field">
						<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"></circle><path d="m16 16 4.5 4.5"></path></svg>
						<input type="search" placeholder="Buscar por tema ou disciplina" data-material-search>
					</span>
				</label>
				${renderFilterPicker('subject')}
				${renderFilterPicker('content-type')}
			</div>
			<p class="materials-count" data-material-count aria-live="polite"></p>
			<div class="materials-grid" data-material-list></div>
		</section>
	`;
	attachTeacherContentPublisher();

	const searchInput = pageContent.querySelector<HTMLInputElement>('[data-material-search]');
	searchInput?.addEventListener('input', (event) => {
		searchQuery = (event.currentTarget as HTMLInputElement).value;
		void renderMaterials();
	});

	pageContent.querySelectorAll<HTMLElement>('[data-filter-picker]').forEach((picker) => {
		const trigger = picker.querySelector<HTMLButtonElement>('[data-filter-trigger]');
		const options = picker.querySelector<HTMLElement>('[data-filter-options]');
		trigger?.addEventListener('click', () => {
			setFilterMenuOpen(picker, picker.dataset.open !== 'true');
		});

		picker.addEventListener('click', (event) => {
			if (!(event.target instanceof Element)) return;
			const option = event.target.closest<HTMLButtonElement>('[data-filter-option]');
			const value = option?.dataset.filterValue;
			const kind = option?.dataset.filterOption;
			if (!option || !value) return;
			if (kind === 'subject' && isSubjectFilter(value)) activeCategory = value;
			else if (kind === 'content-type' && isContentTypeFilter(value)) activeContentType = value;
			else return;

			picker.querySelector<HTMLElement>('[data-selected-filter]')!.textContent = option.textContent?.trim() ?? '';
			picker.querySelectorAll<HTMLButtonElement>('[data-filter-option]').forEach((button) => {
				button.setAttribute('aria-pressed', String(button === option));
			});
			setFilterMenuOpen(picker, false);
			trigger?.focus();
			void renderMaterials();
		});

		picker.addEventListener('keydown', (event: KeyboardEvent) => {
			if (event.key === 'Escape' && picker.dataset.open === 'true') {
				event.preventDefault();
				setFilterMenuOpen(picker, false);
				trigger?.focus();
				return;
			}
			if (!(event.target instanceof HTMLElement)) return;
			if (event.target.closest('[data-filter-trigger]') && event.key === 'ArrowDown') {
				event.preventDefault();
				setFilterMenuOpen(picker, true);
				options?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
				return;
			}
			if (!event.target.matches('[data-filter-option]') || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
			event.preventDefault();
			const buttons = Array.from(picker.querySelectorAll<HTMLButtonElement>('[data-filter-option]'));
			const currentIndex = buttons.indexOf(event.target as HTMLButtonElement);
			const offset = event.key === 'ArrowDown' ? 1 : -1;
			buttons[(currentIndex + offset + buttons.length) % buttons.length]?.focus();
		});
	});

	void renderMaterials();
}

function pageFromHash(): Page {
	if (window.location.hash === '#materials') return 'materials';
	if (window.location.hash === '#summaries') return 'materials';
	if (window.location.hash === '#classroom') return 'classroom';
	if (window.location.hash === '#agenda') return 'agenda';
	if (window.location.hash === '#performance') return 'performance';
	if (window.location.hash === '#users') return 'users';
	if (window.location.hash === '#login') return 'login';
	if (window.location.hash === '#register') return 'register';
	return 'home';
}

pageLinks.forEach((link) => {
	link.addEventListener('click', (event) => {
		const page = link.dataset.page;
		if (page !== 'home' && page !== 'materials' && page !== 'classroom' && page !== 'agenda' && page !== 'performance' && page !== 'users' && page !== 'login' && page !== 'register') return;

		event.preventDefault();
		const hash = pageHashes[page];
		if (window.location.hash !== hash) {
			window.history.pushState(null, '', hash);
		}
		renderPage(page);
		setMobileMenuOpen(false);
	});

	document.querySelector<HTMLAnchorElement>('.logout-link')?.addEventListener('click', async (event) => {
		event.preventDefault();
		const logoutLink = event.currentTarget;
		if (!(logoutLink instanceof HTMLAnchorElement)) return;

		const { error } = await supabase.auth.signOut();
		if (error) {
			console.error('Erro ao sair do Supabase.', error);
			return;
		}

		window.history.pushState(null, '', pageHashes.login);
		renderPage('login');
	});
});

menuToggle?.addEventListener('click', () => {
	setMobileMenuOpen(sidebar?.dataset.open !== 'true');
});

sidebar?.querySelectorAll<HTMLAnchorElement>('a').forEach((link) => {
	link.addEventListener('click', () => setMobileMenuOpen(false));
});

document.addEventListener('keydown', (event) => {
	if (event.key === 'Escape' && sidebar?.dataset.open === 'true') {
		setMobileMenuOpen(false);
		menuToggle?.focus();
	}
});

window.addEventListener('popstate', () => renderPage(pageFromHash()));
window.addEventListener('hashchange', () => renderPage(pageFromHash()));

document.addEventListener('pointerdown', (event) => {
	if (!(event.target instanceof Node)) return;
	const target = event.target;

	const subjectPicker = pageContent?.querySelector<HTMLElement>('[data-filter-picker]');
	if (subjectPicker?.dataset.open === 'true' && !subjectPicker.contains(target)) {
		setFilterMenuOpen(subjectPicker, false);
	}
});

document.addEventListener('click', (event) => {
	if (!(event.target instanceof Element)) return;

	if (event.target.closest('.profile-photo-button')) {
		profilePhotoInput?.click();
		return;
	}

	const button = event.target.closest<HTMLButtonElement>('[data-theme-choice]');
	const theme = button?.dataset.themeChoice;
	if (theme === 'light' || theme === 'dark') {
		setTheme(theme);
	}
});

profilePhotoInput?.addEventListener('change', () => {
	const file = profilePhotoInput.files?.[0];
	if (!file) return;
	if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
		if (profilePhotoStatus) profilePhotoStatus.textContent = 'Escolha uma imagem JPG, PNG, WebP ou GIF.';
		profilePhotoInput.value = '';
		return;
	}
	if (file.size > 2 * 1024 * 1024) {
		if (profilePhotoStatus) profilePhotoStatus.textContent = 'A foto deve ter no máximo 2 MB.';
		profilePhotoInput.value = '';
		return;
	}

	const reader = new FileReader();
	reader.addEventListener('load', () => {
		if (typeof reader.result !== 'string' || !reader.result.startsWith(`data:${file.type};base64,`)) {
			if (profilePhotoStatus) profilePhotoStatus.textContent = 'Não foi possível carregar essa imagem. Tente outro arquivo.';
			return;
		}
		try {
			localStorage.setItem('profile-photo', reader.result);
			showProfilePhoto(reader.result);
			if (profilePhotoStatus) profilePhotoStatus.textContent = 'Foto do perfil atualizada neste dispositivo.';
		} catch (error) {
			if (!(error instanceof DOMException) || (error.name !== 'QuotaExceededError' && error.name !== 'NS_ERROR_DOM_QUOTA_REACHED')) {
				throw error;
			}
			showProfilePhoto(reader.result);
			if (profilePhotoStatus) profilePhotoStatus.textContent = 'Foto atualizada, mas o armazenamento deste dispositivo está cheio e ela não será mantida após fechar o site.';
		}
	});
	reader.addEventListener('error', () => {
		if (profilePhotoStatus) profilePhotoStatus.textContent = 'Ocorreu um erro ao ler a imagem. Tente novamente.';
	});
	reader.readAsDataURL(file);
	profilePhotoInput.value = '';
});

if (savedProfilePhoto?.startsWith('data:image/')) {
	showProfilePhoto(savedProfilePhoto);
}

void updateUserIdentity();
supabase.auth.onAuthStateChange(() => {
	void updateUserIdentity();
});

setTheme(initialTheme);
renderPage(pageFromHash());