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

type Page = 'home' | 'materials' | 'summaries' | 'classroom' | 'agenda' | 'performance' | 'login' | 'register';
type Category = 'Matemática' | 'Português' | 'Ciências';
type SubjectFilter = 'Todos' | Category;

interface Material {
	title: string;
	subject: Category;
	description: string;
	summary: string;
	format: string;
}

interface PublishedContent {
	id: string;
	title: string;
	subject: string;
	content_type: 'material' | 'summary';
	description: string | null;
	attachment_url: string | null;
	attachment_name: string | null;
	created_at?: string;
}

const materials: Material[] = [
	{
		title: 'Frações sem mistério',
		subject: 'Matemática',
		description: 'Aprenda a comparar, simplificar e operar frações com exemplos resolvidos.',
		summary: 'Uma fração representa partes iguais de um todo. Para comparar frações, observe os denominadores ou use frações equivalentes. Na simplificação, divida o numerador e o denominador pelo mesmo número até chegar à forma irredutível.',
		format: 'Resumo · 8 min',
	},
	{
		title: 'Equações do 1º grau',
		subject: 'Matemática',
		description: 'Pratique como encontrar o valor da incógnita e conferir cada resultado.',
		summary: 'Em uma equação do 1º grau, reúna os termos com incógnita de um lado e os números do outro, sempre realizando a mesma operação nos dois lados. Ao final, substitua o valor encontrado para verificar a igualdade.',
		format: 'Exercícios · 12 questões',
	},
	{
		title: 'Classes gramaticais',
		subject: 'Português',
		description: 'Um guia rápido para reconhecer substantivos, verbos, adjetivos e mais.',
		summary: 'As classes gramaticais organizam as palavras de acordo com sua função. Substantivos nomeiam seres, verbos indicam ações ou estados e adjetivos caracterizam os nomes. Artigos, pronomes, advérbios e preposições completam os sentidos das frases.',
		format: 'Guia · 6 min',
	},
	{
		title: 'Interpretação de texto',
		subject: 'Português',
		description: 'Estratégias para localizar informações e identificar ideias principais.',
		summary: 'Para interpretar um texto, leia com atenção, identifique o assunto e destaque as informações principais. Relacione título, contexto e argumentos para diferenciar fatos, opiniões e conclusões do autor.',
		format: 'Atividade · 10 questões',
	},
	{
		title: 'Sistema solar',
		subject: 'Ciências',
		description: 'Conheça os planetas, seus movimentos e a organização do sistema solar.',
		summary: 'O sistema solar é formado pelo Sol, planetas, satélites, asteroides e cometas. Os planetas giram ao redor do Sol e também fazem o movimento de rotação, que produz a alternância entre dia e noite.',
		format: 'Resumo · 7 min',
	},
	{
		title: 'Cadeia alimentar',
		subject: 'Ciências',
		description: 'Entenda como a energia circula entre produtores, consumidores e decompositores.',
		summary: 'Na cadeia alimentar, produtores fabricam seu próprio alimento, consumidores obtêm energia ao se alimentar de outros seres e decompositores reciclam a matéria orgânica. Assim, a energia passa de um nível trófico para outro.',
		format: 'Guia · 5 min',
	},
];

const categories: SubjectFilter[] = ['Todos', 'Matemática', 'Português', 'Ciências'];
const pageHashes: Record<Page, string> = {
	home: '#home',
	materials: '#materials',
	summaries: '#summaries',
	classroom: '#classroom',
	agenda: '#agenda',
	performance: '#performance',
	login: '#login',
	register: '#register',
};

let activeCategory: SubjectFilter = 'Todos';
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
			<header class="agenda-heading"><div><p class="section-label">ORGANIZE SEUS ESTUDOS</p><h2 id="agenda-title">Agenda</h2><p>Confira seus próximos compromissos e prazos.</p></div></header>
			<div class="agenda-demo-notice" role="status">${items.length ? `${items.length} compromisso(s) encontrado(s).` : 'Você ainda não tem aulas ou atividades agendadas.'}</div>
			<section class="agenda-panel" aria-labelledby="agenda-upcoming-title">
				<div class="agenda-panel-heading"><div><h3 id="agenda-upcoming-title">Próximos compromissos</h3><p>Dados sincronizados com suas turmas.</p></div><span class="agenda-count">${items.length} itens</span></div>
				${items.length ? `<ol class="agenda-event-list">${items.map((item) => `<li class="agenda-event"><div class="agenda-event-copy"><span class="agenda-event-type agenda-class-type">${escapeHtml(item.type)}</span><h4>${escapeHtml(item.title)}</h4><p>${formatDateTime(item.date)}</p></div></li>`).join('')}</ol>` : '<p class="empty-state">Nenhum compromisso encontrado.</p>'}
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
				<form class="classroom-chat-form teacher-publisher-form" data-teacher-agenda-form>
					<strong>Criar agenda</strong>
					<select name="classroom_id" required>${(rooms.data ?? []).map((room: { id: string; name: string }) => `<option value="${room.id}">${escapeHtml(room.name)}</option>`).join('')}</select>
					<input name="title" placeholder="Título" required>
					<select name="event_type"><option value="class">Aula</option><option value="activity">Atividade</option><option value="deadline">Prazo</option></select>
					<input name="starts_at" type="datetime-local" required>
					<button type="submit">Criar agenda</button>
					<span data-teacher-agenda-status role="status"></span>
				</form>
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

function attachTeacherContentPublisher(contentType: 'material' | 'summary'): void {
	if (!pageContent || currentUserRole !== 'teacher') return;
	const heading = pageContent.querySelector<HTMLElement>('.materials-heading');
	if (!heading) return;
	heading.insertAdjacentHTML('afterend', `
		<button class="home-primary-link teacher-publisher-button" type="button" data-open-content-modal>
			Publicar ${contentType === 'summary' ? 'resumo' : 'material'}
		</button>
		<dialog class="content-modal" data-content-modal>
			<form class="content-modal-form" data-teacher-content-publisher method="dialog">
				<div class="content-modal-heading"><div><p class="section-label">NOVO CONTEÚDO</p><h3>Publicar ${contentType === 'summary' ? 'resumo' : 'material'}</h3></div><button type="button" class="modal-close" data-close-content-modal aria-label="Fechar">×</button></div>
				<label>Título<input name="title" maxlength="120" required></label>
				<label>Disciplina<input name="subject" maxlength="50" required></label>
				<label>Texto completo<textarea name="description" rows="8"></textarea></label>
				<label>Arquivo (opcional)<input name="attachment" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,image/*"></label>
				<button type="submit">Publicar</button>
				<span data-teacher-publisher-status role="status"></span>
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
			content_type: contentType,
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
		contentType === 'summary' ? await renderSummaries() : await renderMaterials();
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
				<section class="performance-panel"><h3>Publicar conteúdo</h3><p>Envie um novo material ou resumo.</p><form class="classroom-chat-form" data-teacher-content-form><input name="title" placeholder="Título" required><input name="subject" placeholder="Disciplina" required><select name="content_type"><option value="material">Material</option><option value="summary">Resumo</option></select><textarea name="description" placeholder="Conteúdo" required></textarea><button type="submit">Publicar</button></form><div>${contents.length ? contents.map((content: { content_type: string; subject: string; title: string; description: string }) => `<article class="material-card"><span class="material-subject">${escapeHtml(content.content_type === 'summary' ? 'Resumo' : 'Material')} · ${escapeHtml(content.subject)}</span><h3>${escapeHtml(content.title)}</h3><p>${escapeHtml(content.description)}</p></article>`).join('') : '<p class="empty-state">Nenhum conteúdo publicado.</p>'}</div></section>
				<section class="performance-panel"><h3>Minhas salas</h3><p>Crie turmas e compartilhe o código.</p><form class="classroom-chat-form" data-teacher-room-form><input name="name" placeholder="Nome da turma" required><input name="subject" placeholder="Disciplina" required><button type="submit">Criar sala</button></form><div class="classroom-room-list">${rooms.length ? rooms.map((room: { id: string; name: string; subject: string; join_code: string }) => `<div class="classroom-room-option"><strong>${escapeHtml(room.name)}</strong><span>${escapeHtml(room.subject)} · Código ${escapeHtml(room.join_code)}</span><a href="#classroom" data-page="classroom">Abrir sala</a></div>`).join('') : '<p class="empty-state">Nenhuma sala criada.</p>'}</div></section>
				<section class="performance-panel"><h3>Agenda da turma</h3><p>Agende aulas, atividades e prazos.</p><form class="classroom-chat-form" data-teacher-event-form><select name="classroom_id" required>${rooms.map((room: { id: string; name: string }) => `<option value="${room.id}">${escapeHtml(room.name)}</option>`).join('')}</select><input name="title" placeholder="Título do evento" required><select name="event_type"><option value="class">Aula</option><option value="activity">Atividade</option><option value="deadline">Prazo</option></select><input name="starts_at" type="datetime-local" required><button type="submit">Agendar</button></form></section>
				<section class="performance-panel"><h3>Desempenho</h3><p>Abra uma sala para verificar frequência, notas e conquistas por aluno.</p><a class="home-primary-link" href="#classroom" data-page="classroom">Gerenciar turmas</a></section>
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

async function renderPerformanceFromDatabase(): Promise<void> {
	if (!pageContent) return;
	const { data: userData, error: userError } = await supabase.auth.getUser();
	if (userError || !userData.user) {
		pageContent.innerHTML = '<section class="performance-page"><div class="performance-demo-notice" role="status">Entre na sua conta para acessar seu desempenho.</div></section>';
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
							<select name="content_type"><option value="material">Material</option><option value="summary">Resumo</option></select>
							<textarea name="description" placeholder="Conteúdo" required></textarea>
							<button type="submit">Publicar</button>
						</form>
						<div data-teacher-content-list>${contents.length ? contents.map((content: { content_type: string; subject: string; title: string; description: string }) => `<article class="material-card"><span class="material-subject">${escapeHtml(content.content_type === 'summary' ? 'Resumo' : 'Material')} · ${escapeHtml(content.subject)}</span><h3>${escapeHtml(content.title)}</h3><p>${escapeHtml(content.description)}</p></article>`).join('') : '<p class="empty-state">Nenhum conteúdo publicado.</p>'}</div>
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
					<form data-classroom-join class="classroom-chat-form">
						<label for="classroom-join-code">Entrar com código</label>
						<div><input id="classroom-join-code" name="code" maxlength="8" placeholder="Ex.: A1B2C3D4" required><button type="submit">Entrar</button></div>
					</form>
					<form data-classroom-create class="classroom-chat-form" hidden>
						<label for="classroom-name">Criar sala (professor)</label>
						<input id="classroom-name" name="name" maxlength="80" placeholder="Nome da turma" required>
						<input name="subject" maxlength="50" placeholder="Disciplina" required>
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

function getFilteredMaterials(getSearchText: (material: Material) => string): Material[] {
	const normalizedQuery = searchQuery.trim().toLocaleLowerCase('pt-BR');

	return materials.filter((material) => {
		const matchesCategory = activeCategory === 'Todos' || material.subject === activeCategory;
		const searchableText = getSearchText(material).toLocaleLowerCase('pt-BR');
		return matchesCategory && searchableText.includes(normalizedQuery);
	});
}

function renderMaterialCards(items: Material[], showSummary = false): string {
	return items.map((material) => {
		const descriptionClass = showSummary ? ' class="material-summary"' : '';
		const description = showSummary ? material.summary : material.description;

		return `
			<article class="material-card">
				<div class="material-card-meta">
					<span class="material-subject">${material.subject}</span>
					<span class="material-format">${material.format}</span>
				</div>
				<h3>${material.title}</h3>
				<p${descriptionClass}>${description}</p>
				<button class="home-primary-link material-details-button" type="button" data-content-details="${escapeHtml(material.title)}">Ver detalhes</button>
			</article>
		`;
	}).join('');
}

function renderPublishedCards(items: PublishedContent[]): string {
	return items.map((content) => `
		<article class="material-card">
			<div class="material-card-meta"><span class="material-subject">${escapeHtml(content.subject)}</span><span class="material-format">${content.content_type === 'summary' ? 'Resumo' : 'Material'}</span></div>
			<h3>${escapeHtml(content.title)}</h3>
			<p>${escapeHtml((content.description ?? '').slice(0, 150))}${(content.description ?? '').length > 150 ? '...' : ''}</p>
			<button class="home-primary-link material-details-button" type="button" data-published-content-id="${escapeHtml(content.id)}">Ver detalhes</button>
		</article>
	`).join('');
}

function attachContentDetails(): void {
	if (!pageContent) return;
	pageContent.querySelectorAll<HTMLButtonElement>('[data-content-details]').forEach((button) => {
		button.addEventListener('click', () => {
			const material = materials.find((item) => item.title === button.dataset.contentDetails);
			if (material) showContentDetails(material.title, material.subject, material.summary, null, null);
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

function renderSubjectPicker(page: 'materials' | 'summaries'): string {
	const optionsId = `${page}-subject-options`;
	return `
		<div class="subject-picker" data-subject-picker data-open="false">
			<span class="subject-picker-label">Disciplina</span>
			<button
				class="subject-picker-trigger"
				type="button"
				data-subject-trigger
				aria-expanded="false"
				aria-controls="${optionsId}"
			>
				<span class="subject-picker-value" data-selected-subject>Todas as disciplinas</span>
				<svg class="subject-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
			</button>
			<div class="subject-options" id="${optionsId}" data-subject-options aria-hidden="true" inert>
				<div class="subject-options-panel" role="group" aria-label="Filtrar por disciplina">
					${categories.map((category) => `
						<button
							class="subject-option"
							type="button"
							data-category="${category}"
							aria-pressed="${category === activeCategory}"
						>
							<span>${category === 'Todos' ? 'Todas as disciplinas' : category}</span>
							<span class="subject-check" aria-hidden="true">&#10003;</span>
						</button>
					`).join('')}
				</div>
			</div>
		</div>
	`;
}

function setSubjectMenuOpen(picker: HTMLElement, isOpen: boolean): void {
	picker.dataset.open = String(isOpen);
	picker.querySelector<HTMLButtonElement>('[data-subject-trigger]')?.setAttribute('aria-expanded', String(isOpen));

	const options = picker.querySelector<HTMLElement>('[data-subject-options]');
	options?.setAttribute('aria-hidden', String(!isOpen));
	options?.toggleAttribute('inert', !isOpen);
}

async function renderMaterials(): Promise<void> {
	if (!pageContent) return;
	await loadPublishedContents();

	const filteredMaterials = getFilteredMaterials(
		(material) => `${material.title} ${material.subject} ${material.description}`,
	);
	const filteredPublished = publishedContents.filter((content) => content.content_type === 'material' && (activeCategory === 'Todos' || content.subject === activeCategory) && `${content.title} ${content.subject} ${content.description ?? ''}`.toLocaleLowerCase('pt-BR').includes(searchQuery.trim().toLocaleLowerCase('pt-BR')));
	const list = pageContent.querySelector<HTMLElement>('[data-material-list]');
	const count = pageContent.querySelector<HTMLElement>('[data-material-count]');
	if (!list || !count) return;

	const total = filteredMaterials.length + filteredPublished.length;
	const resultLabel = total === 1 ? 'material encontrado' : 'materiais encontrados';
	count.textContent = `${total} ${resultLabel}`;
	list.innerHTML = total
		? `${renderMaterialCards(filteredMaterials)}${renderPublishedCards(filteredPublished)}`
		: '<p class="empty-state">Nenhum material encontrado. Tente outro termo ou disciplina.</p>';
	attachContentDetails();
}

async function renderSummaries(): Promise<void> {
	if (!pageContent) return;
	await loadPublishedContents();

	const filteredMaterials = getFilteredMaterials(
		(material) => `${material.title} ${material.subject} ${material.summary}`,
	);
	const filteredPublished = publishedContents.filter((content) => content.content_type === 'summary' && (activeCategory === 'Todos' || content.subject === activeCategory) && `${content.title} ${content.subject} ${content.description ?? ''}`.toLocaleLowerCase('pt-BR').includes(searchQuery.trim().toLocaleLowerCase('pt-BR')));
	const list = pageContent.querySelector<HTMLElement>('[data-summary-list]');
	const count = pageContent.querySelector<HTMLElement>('[data-summary-count]');
	if (!list || !count) return;

	const total = filteredMaterials.length + filteredPublished.length;
	const resultLabel = total === 1 ? 'resumo encontrado' : 'resumos encontrados';
	count.textContent = `${total} ${resultLabel}`;
	list.innerHTML = total
		? `${renderMaterialCards(filteredMaterials, true)}${renderPublishedCards(filteredPublished)}`
		: '<p class="empty-state">Nenhum resumo encontrado. Tente outro termo ou disciplina.</p>';
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
						<a class="home-shortcut" href="#summaries">
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
			<section class="login-view" aria-labelledby="auth-title">
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
					<label for="auth-password">Senha</label>
					<input
						id="auth-password"
						name="password"
						type="password"
						autocomplete="${isRegisterPage ? 'new-password' : 'current-password'}"
						placeholder="${isRegisterPage ? 'Crie uma senha' : 'Digite sua senha'}"
						minlength="${isRegisterPage ? '6' : '1'}"
						required
					>
					<button class="login-submit" type="submit">${isRegisterPage ? 'Criar conta' : 'Entrar'}</button>
					<p class="login-status" data-login-status role="status" aria-live="polite"></p>
				</form>
				${isRegisterPage
					? '<a class="login-back" href="#login" data-page="login">Já tem uma conta? Entrar</a>'
					: '<p class="login-register-prompt">Caso não tenha login <a href="#register" data-page="register"><span class="register-link-desktop">clique aqui para registrar sua conta</span><span class="register-link-mobile">Clique aqui para criar sua conta</span></a>.</p><a class="login-back" href="#home" data-page="home">Voltar ao início</a>'}
			</section>
		`;

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
					const initialPage = currentUserRole === 'teacher' ? 'summaries' : 'home';
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
	searchQuery = '';
	const isSummariesPage = page === 'summaries';
	pageContent.innerHTML = isSummariesPage ? `
		<section class="materials-page" aria-labelledby="summaries-title">
			<div class="materials-heading">
				<p class="section-label">REVISÃO RÁPIDA</p>
				<h2 id="summaries-title">Resumos</h2>
				<p>Revise os principais conceitos de cada disciplina.</p>
			</div>
			<div class="materials-toolbar">
				<label class="material-search">
					<span class="visually-hidden">Buscar resumos</span>
					<input type="search" placeholder="Buscar por tema ou disciplina" data-summary-search>
				</label>
				${renderSubjectPicker('summaries')}
			</div>
			<p class="materials-count" data-summary-count aria-live="polite"></p>
			<div class="materials-grid" data-summary-list></div>
		</section>
	` : `
		<section class="materials-page" aria-labelledby="materials-title">
			<div class="materials-heading">
				<p class="section-label">BIBLIOTECA DE ESTUDOS</p>
				<h2 id="materials-title">Materiais</h2>
				<p>Encontre resumos e atividades para continuar aprendendo.</p>
			</div>
			<div class="materials-toolbar">
				<label class="material-search">
					<span class="visually-hidden">Buscar materiais</span>
					<input type="search" placeholder="Buscar por tema ou disciplina" data-material-search>
				</label>
				${renderSubjectPicker('materials')}
			</div>
			<p class="materials-count" data-material-count aria-live="polite"></p>
			<div class="materials-grid" data-material-list></div>
		</section>
	`;
	attachTeacherContentPublisher(isSummariesPage ? 'summary' : 'material');

	const searchSelector = isSummariesPage ? '[data-summary-search]' : '[data-material-search]';
	const searchInput = pageContent.querySelector<HTMLInputElement>(searchSelector);
	searchInput?.addEventListener('input', (event) => {
		searchQuery = (event.currentTarget as HTMLInputElement).value;
		isSummariesPage ? renderSummaries() : renderMaterials();
	});

	const subjectPicker = pageContent.querySelector<HTMLElement>('[data-subject-picker]');
	const subjectTrigger = subjectPicker?.querySelector<HTMLButtonElement>('[data-subject-trigger]');
	const subjectOptions = subjectPicker?.querySelector<HTMLElement>('[data-subject-options]');

	if (subjectPicker && subjectTrigger) {
		subjectTrigger.addEventListener('click', () => {
			setSubjectMenuOpen(subjectPicker, subjectPicker.dataset.open !== 'true');
		});
	}

	subjectPicker?.addEventListener('click', (event) => {
		if (!(event.target instanceof Element)) return;

		const option = event.target.closest<HTMLButtonElement>('[data-category]');
		const category = option?.dataset.category;
		if (!option || !isSubjectFilter(category)) return;

		activeCategory = category;
		const selectedSubject = subjectPicker.querySelector<HTMLElement>('[data-selected-subject]');
		if (selectedSubject) {
			selectedSubject.textContent = activeCategory === 'Todos' ? 'Todas as disciplinas' : activeCategory;
		}
		subjectPicker.querySelectorAll<HTMLButtonElement>('[data-category]').forEach((button) => {
			button.setAttribute('aria-pressed', String(button === option));
		});
		setSubjectMenuOpen(subjectPicker, false);
		subjectTrigger?.focus();
		isSummariesPage ? renderSummaries() : renderMaterials();
	});

	subjectPicker?.addEventListener('keydown', (event: KeyboardEvent) => {
		if (event.key === 'Escape' && subjectPicker.dataset.open === 'true') {
			event.preventDefault();
			setSubjectMenuOpen(subjectPicker, false);
			subjectTrigger?.focus();
			return;
		}

		if (!(event.target instanceof HTMLElement)) return;
		const target = event.target;
		if (target.closest('[data-subject-trigger]') && event.key === 'ArrowDown') {
			event.preventDefault();
			setSubjectMenuOpen(subjectPicker, true);
			subjectOptions?.querySelector<HTMLButtonElement>('[aria-pressed="true"]')?.focus();
			return;
		}

		if (!target.matches('[data-category]') || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
		event.preventDefault();
		const options = Array.from(subjectPicker.querySelectorAll<HTMLButtonElement>('[data-category]'));
		const currentIndex = options.indexOf(target as HTMLButtonElement);
		const offset = event.key === 'ArrowDown' ? 1 : -1;
		options[(currentIndex + offset + options.length) % options.length]?.focus();
	});

	isSummariesPage ? renderSummaries() : renderMaterials();
}

function pageFromHash(): Page {
	if (window.location.hash === '#materials') return 'materials';
	if (window.location.hash === '#summaries') return 'summaries';
	if (window.location.hash === '#classroom') return 'classroom';
	if (window.location.hash === '#agenda') return 'agenda';
	if (window.location.hash === '#performance') return 'performance';
	if (window.location.hash === '#login') return 'login';
	if (window.location.hash === '#register') return 'register';
	return 'home';
}

pageLinks.forEach((link) => {
	link.addEventListener('click', (event) => {
		const page = link.dataset.page;
		if (page !== 'home' && page !== 'materials' && page !== 'summaries' && page !== 'classroom' && page !== 'agenda' && page !== 'performance' && page !== 'login' && page !== 'register') return;

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

	const subjectPicker = pageContent?.querySelector<HTMLElement>('[data-subject-picker]');
	if (subjectPicker?.dataset.open === 'true' && !subjectPicker.contains(target)) {
		setSubjectMenuOpen(subjectPicker, false);
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