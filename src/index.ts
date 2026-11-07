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

interface UserProfile {
	nome: string;
	tipo_usuario: 'professor' | 'aluno';
}

type ProfileRow = {
	nome: string;
	tipo_usuario: string;
};

function setUserProfile(profile: UserProfile | null): void {
	document.body.dataset.userType = profile?.tipo_usuario ?? '';
	if (userNameElement) {
		userNameElement.textContent = profile ? `Bem-vindo, ${profile.nome}!` : 'Bem-vindo, Usuário!';
	}
}

async function restoreUserProfile(): Promise<void> {
	const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
	if (sessionError) {
		console.error('Não foi possível recuperar a sessão do usuário.', sessionError);
		return;
	}

	const userId = sessionData.session?.user.id;
	if (!userId) {
		setUserProfile(null);
		return;
	}

	const { data: profile, error: profileError } = await supabase
		.from('perfis')
		.select('nome, tipo_usuario')
		.eq('id', userId)
		.single();

	if (profileError || !profile) {
		console.error('Não foi possível carregar o perfil do usuário.', profileError);
		return;
	}

	const userType = String(profile.tipo_usuario).trim().toLowerCase();
	if (
		typeof profile.nome !== 'string'
		|| !profile.nome.trim()
		|| (userType !== 'aluno' && userType !== 'professor')
	) {
		console.error('O perfil do usuário possui dados inválidos.');
		return;
	}

	setUserProfile({ nome: profile.nome.trim(), tipo_usuario: userType });
	document.body.dataset.userId = userId;
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

function escapeHtml(value: string): string {
	return value.replace(/[&<>"']/g, (character) => ({
		'&': '&amp;',
		'<': '&lt;',
		'>': '&gt;',
		'"': '&quot;',
		"'": '&#39;',
	}[character] ?? character));
}

interface Material {
	id?: string;
	title: string;
	subject: Category;
	description: string;
	summary: string;
	format: string;
}

interface MaterialRow {
	id: string;
	titulo: string;
	disciplina: string;
	descricao: string;
	resumo: string;
	formato: string;
}

let materials: Material[] = [];

interface AgendaEvent {
	id: string;
	titulo: string;
	descricao: string | null;
	inicio: string;
	fim: string | null;
	concluido: boolean;
}

interface PerformanceRecord {
	disciplina: string;
	media: number | null;
	frequencia: number | null;
	tarefas_concluidas: number;
	tarefas_total: number;
}

interface Achievement {
	titulo: string;
	descricao: string | null;
}

async function loadMaterials(): Promise<void> {
	const { data, error } = await supabase
		.from('materiais')
		.select('id, titulo, disciplina, descricao, resumo, formato')
		.eq('publicado', true)
		.order('criado_em', { ascending: false });

	if (error) {
		console.error('Não foi possível carregar os materiais.', error);
		return;
	}

	materials = (data as MaterialRow[] | null ?? []).map((item) => ({
		id: item.id,
		title: item.titulo,
		subject: item.disciplina as Category,
		description: item.descricao,
		summary: item.resumo,
		format: item.formato,
	}));
}

async function getCurrentUserId(): Promise<string | null> {
	const { data, error } = await supabase.auth.getSession();
	if (error) {
		console.error('Não foi possível recuperar a sessão atual.', error);
		return null;
	}
	return data.session?.user.id ?? null;
}

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
					<span class="material-subject">${escapeHtml(material.subject)}</span>
					<span class="material-format">${escapeHtml(material.format)}</span>
				</div>
				<h3>${escapeHtml(material.title)}</h3>
				<p${descriptionClass}>${escapeHtml(description)}</p>
			</article>
		`;
	}).join('');
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

function renderMaterials(): void {
	if (!pageContent) return;

	const filteredMaterials = getFilteredMaterials(
		(material) => `${material.title} ${material.subject} ${material.description}`,
	);
	const list = pageContent.querySelector<HTMLElement>('[data-material-list]');
	const count = pageContent.querySelector<HTMLElement>('[data-material-count]');
	if (!list || !count) return;

	const resultLabel = filteredMaterials.length === 1 ? 'material encontrado' : 'materiais encontrados';
	count.textContent = `${filteredMaterials.length} ${resultLabel}`;
	list.innerHTML = filteredMaterials.length
		? renderMaterialCards(filteredMaterials)
		: '<p class="empty-state">Nenhum material encontrado. Tente outro termo ou disciplina.</p>';
}

function renderSummaries(): void {
	if (!pageContent) return;

	const filteredMaterials = getFilteredMaterials(
		(material) => `${material.title} ${material.subject} ${material.summary}`,
	);
	const list = pageContent.querySelector<HTMLElement>('[data-summary-list]');
	const count = pageContent.querySelector<HTMLElement>('[data-summary-count]');
	if (!list || !count) return;

	const resultLabel = filteredMaterials.length === 1 ? 'resumo encontrado' : 'resumos encontrados';
	count.textContent = `${filteredMaterials.length} ${resultLabel}`;
	list.innerHTML = filteredMaterials.length
		? renderMaterialCards(filteredMaterials, true)
		: '<p class="empty-state">Nenhum resumo encontrado. Tente outro termo ou disciplina.</p>';
}

async function loadAgendaData(): Promise<void> {
	const userId = await getCurrentUserId();
	if (!userId || !pageContent) return;

	const { data, error } = await supabase
		.from('eventos_agenda')
		.select('id, titulo, descricao, inicio, fim, concluido')
		.eq('aluno_id', userId)
		.order('inicio', { ascending: true })
		.limit(20);

	if (error) {
		console.error('Não foi possível carregar a agenda.', error);
		return;
	}

	const events = (data ?? []) as AgendaEvent[];
	const list = pageContent.querySelector<HTMLOListElement>('.agenda-event-list');
	const count = pageContent.querySelector<HTMLElement>('.agenda-count');
	const notice = pageContent.querySelector<HTMLElement>('.agenda-demo-notice');
	if (notice) notice.textContent = 'Eventos sincronizados com sua agenda.';
	if (count) count.textContent = `${events.length} ${events.length === 1 ? 'evento' : 'eventos'}`;
	if (!list) return;
	list.innerHTML = events.length ? events.map((event) => {
		const date = new Date(event.inicio);
		const dateLabel = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(date).replace('.', '');
		const timeLabel = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(date);
		return `<li class="agenda-event"><div class="agenda-date"><strong>${dateLabel.split(' ')[0]}</strong><span>${dateLabel.split(' ')[1] ?? ''}</span></div><div class="agenda-event-copy"><span class="agenda-event-type agenda-class-type">${event.concluido ? 'Concluído' : 'Atividade'}</span><h4>${event.titulo}</h4><p><span aria-hidden="true">◷</span> ${timeLabel}${event.descricao ? ` <span class="agenda-event-separator">·</span> ${event.descricao}` : ''}</p></div></li>`;
	}).join('') : '<li class="empty-state">Nenhum evento cadastrado.</li>';
}

async function loadPerformanceData(): Promise<void> {
	const userId = await getCurrentUserId();
	if (!userId || !pageContent) return;

	const [performanceResult, achievementResult] = await Promise.all([
		supabase.from('desempenho_alunos').select('disciplina, media, frequencia, tarefas_concluidas, tarefas_total').eq('aluno_id', userId),
		supabase.from('conquistas_alunos').select('titulo, descricao').eq('aluno_id', userId).order('conquistada_em', { ascending: false }),
	]);
	if (performanceResult.error) {
		console.error('Não foi possível carregar o desempenho.', performanceResult.error);
		return;
	}

	const records = (performanceResult.data ?? []) as PerformanceRecord[];
	const achievements = (achievementResult.data ?? []) as Achievement[];
	const average = records.length ? records.reduce((sum, item) => sum + (item.media ?? 0), 0) / records.length : 0;
	const attendance = records.length ? records.reduce((sum, item) => sum + (item.frequencia ?? 0), 0) / records.length : 0;
	const completed = records.reduce((sum, item) => sum + item.tarefas_concluidas, 0);
	const total = records.reduce((sum, item) => sum + item.tarefas_total, 0);
	const stats = pageContent.querySelectorAll<HTMLElement>('.performance-stat-card strong');
	if (stats[0]) stats[0].innerHTML = `${average.toFixed(1).replace('.', ',')} <small>/ 10</small>`;
	if (stats[1]) stats[1].innerHTML = `${attendance.toFixed(0)}<small>%</small>`;
	if (stats[2]) stats[2].innerHTML = `${completed} <small>/ ${total}</small>`;
	if (stats[3]) stats[3].innerHTML = `${achievements.length} <small>medalhas</small>`;
	const attendanceSummary = pageContent.querySelector<HTMLElement>('.performance-attendance-summary strong');
	if (attendanceSummary) attendanceSummary.textContent = `${attendance.toFixed(0)}%`;
	const attendanceProgress = pageContent.querySelector<HTMLElement>('.performance-attendance-progress');
	if (attendanceProgress) {
		attendanceProgress.setAttribute('aria-valuenow', attendance.toFixed(0));
		attendanceProgress.querySelector<HTMLElement>('span')?.style.setProperty('--progress', `${attendance}%`);
	}
	const attendanceDetail = pageContent.querySelector<HTMLElement>('.performance-attendance-detail');
	if (attendanceDetail) {
		attendanceDetail.textContent = records.length
			? `${records.length} ${records.length === 1 ? 'registro' : 'registros'} de frequência`
			: 'Nenhum registro de frequência.';
	}
	const notice = pageContent.querySelector<HTMLElement>('.performance-demo-notice');
	if (notice) notice.textContent = 'Dados sincronizados com seu desempenho.';
	const grades = pageContent.querySelector<HTMLElement>('.performance-grade-list');
	if (grades) grades.innerHTML = records.length ? records.map((record) => {
		const grade = record.media ?? 0;
		return `<li class="performance-grade-row"><div class="performance-grade-label"><span>${record.disciplina}</span><strong>${grade.toFixed(1).replace('.', ',')}</strong></div><div class="performance-progress" role="progressbar" aria-valuemin="0" aria-valuemax="10" aria-valuenow="${grade}"><span style="--progress: ${grade * 10}%"></span></div></li>`;
	}).join('') : '<li class="empty-state">Nenhum desempenho cadastrado.</li>';
	const achievementList = pageContent.querySelector<HTMLElement>('.performance-achievement-list');
	if (achievementList) {
		achievementList.innerHTML = achievements.length
			? achievements.map((achievement, index) => `<li><span class="performance-medal" aria-hidden="true">${index % 2 ? '⭐' : '🏅'}</span><span><strong>${escapeHtml(achievement.titulo)}</strong><small>${escapeHtml(achievement.descricao ?? '')}</small></span><span class="performance-earned">Conquistada</span></li>`).join('')
			: '<li class="empty-state">Nenhuma conquista cadastrada.</li>';
	}
}

async function loadClassroomData(): Promise<void> {
	const currentUserId = await getCurrentUserId();
	const { data: rooms, error: roomError } = await supabase
		.from('salas_aula')
		.select('id, titulo, descricao')
		.eq('ativa', true)
		.order('criada_em', { ascending: false })
		.limit(1);
	if (roomError) {
		console.error('Não foi possível carregar as salas de aula.', roomError);
		return;
	}
	const room = rooms?.[0];
	if (!room || !pageContent) return;
	pageContent.dataset.roomId = room.id;
	if (currentUserId) document.body.dataset.userId = currentUserId;
	const title = pageContent.querySelector<HTMLElement>('#classroom-title');
	if (title) title.textContent = room.titulo;
	const description = pageContent.querySelector<HTMLElement>('.classroom-heading p:last-child');
	if (description && room.descricao) description.textContent = room.descricao;

	const { data: messages, error: messageError } = await supabase
		.from('mensagens_sala')
		.select('conteudo, enviada_em, autor_id')
		.eq('sala_id', room.id)
		.order('enviada_em', { ascending: true })
		.limit(100);
	if (messageError) {
		console.error('Não foi possível carregar as mensagens da sala.', messageError);
		return;
	}
	const messageList = pageContent.querySelector<HTMLElement>('[data-classroom-messages]');
	if (messageList) {
		const messageRows = (messages ?? []) as Array<{ conteudo: string; enviada_em: string; autor_id: string }>;
		messageList.innerHTML = messageRows.map((message) => `<div class="classroom-message"><strong>${message.autor_id === (document.body.dataset.userId ?? '') ? 'Você' : 'Participante'} <time>${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.enviada_em))}</time></strong><p>${escapeHtml(message.conteudo)}</p></div>`).join('');
	}
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
		return;
	}

	if (page === 'performance') {
		pageContent.innerHTML = `
			<section class="performance-page" aria-labelledby="performance-title">
				<header class="performance-heading">
					<div>
						<p class="section-label">ACOMPANHAMENTO ESCOLAR</p>
						<h2 id="performance-title">Painel de Desempenho</h2>
						<p>Acompanhe notas, frequência e conquistas ao longo dos estudos.</p>
					</div>
					<span class="performance-demo-badge">Dados sincronizados</span>
				</header>

				<div class="performance-demo-notice" role="note">
					<strong>Dados sincronizados:</strong> notas, frequência e conquistas carregadas do banco de dados.
				</div>

				<section class="performance-stat-grid" aria-label="Resumo do desempenho">
					<article class="performance-stat-card">
						<span class="performance-stat-icon" aria-hidden="true">▤</span>
						<div><p>Média geral</p><strong>— <small>/ 10</small></strong><span class="performance-stat-detail">Calculada pelo banco</span></div>
					</article>
					<article class="performance-stat-card">
						<span class="performance-stat-icon" aria-hidden="true">✓</span>
						<div><p>Frequência</p><strong>—<small>%</small></strong><span class="performance-stat-detail">Presença nas aulas</span></div>
					</article>
					<article class="performance-stat-card">
						<span class="performance-stat-icon" aria-hidden="true">✦</span>
						<div><p>Tarefas concluídas</p><strong>— <small>/ —</small></strong><span class="performance-stat-detail">Neste período</span></div>
					</article>
					<article class="performance-stat-card">
						<span class="performance-stat-icon" aria-hidden="true">♛</span>
						<div><p>Conquistas</p><strong>— <small>medalhas</small></strong><span class="performance-stat-detail">Registradas no banco</span></div>
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
							<strong>—%</strong>
							<span>de presença</span>
						</div>
						<div class="performance-progress performance-attendance-progress" role="progressbar" aria-label="Frequência nas aulas" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><span style="--progress: 0%"></span></div>
						<p class="performance-attendance-detail">Nenhum registro de frequência.</p>
					</section>

					<section class="performance-panel performance-achievements" aria-labelledby="performance-achievements-title">
						<div class="performance-panel-heading">
							<div><h3 id="performance-achievements-title">Medalhas e conquistas</h3><p>Reconhecendo cada passo</p></div>
						</div>
						<ul class="performance-achievement-list"><li class="empty-state">Carregando conquistas...</li></ul>
					</section>
				</div>
			</section>
		`;
		void loadPerformanceData();
		return;
	}

	if (page === 'agenda') {
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

		pageContent.innerHTML = `
			<section class="agenda-page" aria-labelledby="agenda-title">
				<header class="agenda-heading">
					<div>
						<p class="section-label">ORGANIZE SEUS ESTUDOS</p>
						<h2 id="agenda-title">Agenda</h2>
						<p>Confira os próximos encontros e prazos para não deixar nada passar.</p>
					</div>
					<span class="agenda-demo-badge">Agenda sincronizada</span>
				</header>

				<div class="agenda-demo-notice" role="note">
					<strong>Agenda sincronizada:</strong> os eventos abaixo vêm do banco de dados.
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
		void loadAgendaData();
		return;
	}

	if (page === 'classroom') {
		pageContent.innerHTML = `
			<section class="classroom-page" aria-labelledby="classroom-title">
				<header class="classroom-heading">
					<div>
						<p class="section-label">SALA DE AULA</p>
						<h2 id="classroom-title">Aula de Matemática</h2>
						<p>Estude junto, converse e resolva exercícios na lousa.</p>
					</div>
					<span class="classroom-demo-badge">Sala conectada</span>
				</header>
				<p class="classroom-demo-notice">A sala e as mensagens são carregadas do banco de dados.</p>
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
								<p>Mensagens da sala</p>
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

		pageContent.querySelector<HTMLFormElement>('[data-classroom-chat]')?.addEventListener('submit', async (event) => {
			event.preventDefault();
			const form = event.currentTarget as HTMLFormElement;
			const input = form.elements.namedItem('message');
			if (!(input instanceof HTMLInputElement)) throw new Error('O campo de mensagem da sala não foi encontrado.');
			const text = input.value.trim();
			if (!text) return;
			const roomId = pageContent.dataset.roomId;
			const userId = await getCurrentUserId();
			if (!roomId || !userId) {
				console.error('Não foi possível identificar a sala ou o usuário atual.');
				return;
			}
			const { error } = await supabase.from('mensagens_sala').insert({
				sala_id: roomId,
				autor_id: userId,
				conteudo: text,
			});
			if (error) {
				console.error('Não foi possível enviar a mensagem da sala.', error);
				return;
			}
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
		void loadClassroomData();

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

					let { data: profile, error: profileError } = await supabase
						.from('perfis')
						.select('nome, tipo_usuario')
						.eq('id', data.user.id)
						.single();

					if (profileError || !profile) {
						const metadata = data.user.user_metadata as { full_name?: unknown };
						const metadataName = typeof metadata.full_name === 'string' ? metadata.full_name.trim() : '';
						const fallbackName = metadataName || email.split('@')[0];
						const { error: createProfileError } = await supabase.from('perfis').upsert({
							id: data.user.id,
							nome: fallbackName,
							email: data.user.email ?? email,
							tipo_usuario: 'aluno',
						}, { onConflict: 'id' });

						if (createProfileError) {
							console.error('Não foi possível carregar ou criar o perfil do usuário.', {
								profileError,
								createProfileError,
							});
							status.textContent = 'Não foi possível criar o perfil. Verifique as políticas da tabela perfis.';
							await supabase.auth.signOut();
							return;
						}

						const profileResult = await supabase
							.from('perfis')
							.select('nome, tipo_usuario')
							.eq('id', data.user.id)
							.single();
						profile = profileResult.data as ProfileRow | null;
						profileError = profileResult.error;
					}

					if (profileError || !profile) {
						console.error('O perfil não pôde ser recuperado após a criação.', profileError);
						status.textContent = 'O perfil foi criado, mas não pôde ser carregado. Verifique as políticas da tabela perfis.';
						await supabase.auth.signOut();
						return;
					}

					const userType = String(profile.tipo_usuario).trim().toLowerCase();
					if (userType !== 'aluno' && userType !== 'professor') {
						status.textContent = 'O tipo de usuário cadastrado é inválido.';
						await supabase.auth.signOut();
						return;
					}

					setUserProfile({ nome: profile.nome, tipo_usuario: userType });
					document.body.dataset.userId = data.user.id;
					status.textContent = 'Login realizado com sucesso!';
					form.reset();
					window.history.pushState(null, '', pageHashes.home);
					renderPage('home');
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
						data: { full_name: fullName, tipo_usuario: 'aluno' },
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

				status.textContent = data.session
					? 'Cadastro realizado com sucesso!'
					: 'Cadastro realizado! Confirme seu e-mail para ativar a conta.';
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

	const searchSelector = isSummariesPage ? '[data-summary-search]' : '[data-material-search]';
	void loadMaterials().then(() => {
		if (window.location.hash === pageHashes[page]) {
			isSummariesPage ? renderSummaries() : renderMaterials();
		}
	});
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
	return 'login';
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
		setUserProfile(null);
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

setTheme(initialTheme);
if (!window.location.hash) {
	window.history.replaceState(null, '', pageHashes.login);
}
renderPage(pageFromHash());
void restoreUserProfile();