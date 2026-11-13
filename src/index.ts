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
let currentUserId: string | null = null;
let studentAnsweredActivityIds = new Set<string>();
let studentActivityStatusesLoaded = false;

interface CurrentProfile {
	id: string;
	fullName: string | null;
	role: 'student' | 'teacher';
}

async function loadCurrentProfile(): Promise<CurrentProfile | null> {
	const { data: authData, error: authError } = await supabase.auth.getUser();
	if (authError || !authData.user) {
		currentUserId = null;
		currentUserRole = null;
		updateNavigationRole();
		return null;
	}
	currentUserId = authData.user.id;

	const { data: profile, error: profileError } = await supabase
		.from('profiles')
		.select('full_name, role')
		.eq('id', authData.user.id)
		.maybeSingle();
	if (profileError) {
		console.error('Não foi possível carregar o perfil do usuário.', profileError);
		currentUserId = null;
		currentUserRole = null;
		updateNavigationRole();
		return null;
	}
	currentUserRole = profile?.role === 'teacher' ? 'teacher' : 'student';
	updateNavigationRole();
	return {
		id: authData.user.id,
		fullName: profile?.full_name?.trim() || authData.user.user_metadata.full_name?.trim() || authData.user.email?.split('@')[0] || null,
		role: currentUserRole,
	};
}

function updateNavigationRole(): void {
	document.querySelectorAll<HTMLElement>('[data-teacher-only]').forEach((element) => {
		element.hidden = currentUserRole !== 'teacher';
	});
	document.querySelectorAll<HTMLElement>('[data-student-only]').forEach((element) => {
		element.hidden = currentUserRole === 'teacher';
	});
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
type SubjectFilter = string;
type ContentType = 'summary' | 'activity';
type ContentTypeFilter = 'Todos' | ContentType | 'material';
type ActivityQuestionType = 'objective' | 'subjective';

interface ActivityQuestion {
	id: string;
	type: ActivityQuestionType;
	prompt: string;
	options: string[];
	subquestions: string[];
	image_url?: string | null;
}

type ActivityAnswers = Record<string, string | string[]>;

interface ActivityResponse {
	student_id: string;
	answers: ActivityAnswers;
	submitted_at: string;
	attempt_number: number;
	score: number | null;
	grade_details: ActivityGradeDetails;
	graded_at: string | null;
	retry_status: 'not_requested' | 'pending' | 'approved' | 'denied';
	profile: { full_name: string | null } | null;
}

interface ActivityGradeDetails {
	questions: Record<string, {
		correct_option: number | null;
		subquestion_scores: number[];
		explanation: string;
	}>;
}

interface ActivityAnswerKey {
	correct_option: number | null;
	weight: number;
	subquestion_weights: number[];
}

interface PublishedContent {
	id: string;
	teacher_id: string;
	title: string;
	subject: string;
	content_type: 'material' | ContentType;
	description: string | null;
	attachment_url: string | null;
	attachment_name: string | null;
	activity_questions?: ActivityQuestion[] | null;
	relatedContents?: Array<{ id: string; title: string; content_type: 'summary' | 'activity' }>;
	created_at?: string;
}

let categories: SubjectFilter[] = ['Todos'];
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
	access_mode: 'restricted';
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
	await loadCurrentProfile();
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
	if (pageContent.querySelector('[data-open-content-modal]')) return;
	const heading = pageContent.querySelector<HTMLElement>('.materials-heading');
	if (!heading) return;
	heading.insertAdjacentHTML('afterend', `
		<button class="home-primary-link teacher-publisher-button" type="button" data-open-content-modal>
			Publicar conteúdo
		</button>
		<dialog class="content-modal content-publisher-modal" data-content-modal aria-labelledby="content-publisher-title">
			<form class="content-modal-form" data-teacher-content-publisher>
				<div class="content-modal-heading">
					<div><p class="section-label">BIBLIOTECA DE ESTUDOS</p><h3 id="content-publisher-title">Publicar conteúdo</h3><p class="content-modal-intro">Preencha os detalhes para compartilhar um novo recurso com seus alunos.</p></div>
					<button type="button" class="modal-close" data-close-content-modal aria-label="Fechar">×</button>
				</div>
				<div class="content-publisher-fields">
					<label class="content-publisher-title-field">Título<input name="title" minlength="2" maxlength="120" placeholder="Ex.: Frações e números decimais" required></label>
					<label>Disciplina<input name="subject" minlength="2" maxlength="50" placeholder="Ex.: Matemática" required></label>
					<label>Tipo de conteúdo<select name="content_type" required><option value="summary">Resumo</option><option value="activity">Atividade</option><option value="material">Outro material</option></select></label>
					<label class="content-publisher-related-field">Vincular a outro conteúdo<select name="related_content_id" data-related-content-select disabled><option value="">Sem vínculo</option></select><span class="content-field-hint" data-related-content-hint>Resumos podem ser vinculados a atividades e vice-versa.</span></label>
					<label class="content-publisher-description-field" data-description-field>Texto completo<textarea name="description" rows="6" placeholder="Escreva uma descrição ou o conteúdo que os alunos vão estudar."></textarea><span class="content-field-hint" data-description-hint>Adicione um texto ou anexe um arquivo abaixo.</span></label>
					<section class="activity-question-builder" data-activity-builder hidden aria-labelledby="activity-builder-title">
						<div class="activity-builder-heading"><div><h4 id="activity-builder-title">Questões da atividade</h4><p>Adicione questões objetivas ou subjetivas e escreva seus enunciados.</p></div><button type="button" class="activity-add-question" data-add-activity-question>＋ Adicionar questão</button></div>
						<div class="activity-question-list" data-activity-question-list></div>
					</section>
					<section class="activity-publisher-answer-key" data-publisher-answer-key hidden>
						<div><h4>Gabarito e pesos</h4><p>Defina a resposta correta das questões objetivas e os pesos que serão usados no cálculo da nota.</p></div>
						<div class="activity-question-list" data-publisher-answer-key-fields></div>
					</section>
					<label class="content-publisher-file-field">Arquivo <span class="content-field-optional">(opcional)</span><input name="attachment" type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.txt,image/*"><span class="content-field-hint">PDF, documentos, apresentações, texto ou imagem (até 50 MB).</span><span class="content-file-selection" data-attachment-selection aria-live="polite"></span><button class="content-file-remove" type="button" data-remove-attachment hidden>Remover arquivo</button></label>
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
	const typeSelect = pageContent.querySelector<HTMLSelectElement>('[data-teacher-content-publisher] [name="content_type"]');
	const activityBuilder = pageContent.querySelector<HTMLElement>('[data-activity-builder]');
	const activityQuestionList = pageContent.querySelector<HTMLElement>('[data-activity-question-list]');
	const answerKeySection = pageContent.querySelector<HTMLElement>('[data-publisher-answer-key]');
	const answerKeyFields = pageContent.querySelector<HTMLElement>('[data-publisher-answer-key-fields]');
	const descriptionField = pageContent.querySelector<HTMLElement>('[data-description-field]');
	const descriptionHint = pageContent.querySelector<HTMLElement>('[data-description-hint]');
	const activityQuestions: ActivityQuestion[] = [];
	const activityQuestionImages = new Map<string, File>();
	const answerKeyDraft = new Map<string, ActivityAnswerKey>();
	const captureAnswerKeyDraft = (): void => {
		if (!answerKeyFields) return;
		for (const question of activityQuestions) {
			const previous = answerKeyDraft.get(question.id);
			const weightInput = answerKeyFields.querySelector<HTMLInputElement>(`[name="${CSS.escape(`publish-question-weight-${question.id}`)}"]`);
			const correctInput = answerKeyFields.querySelector<HTMLInputElement>(`input[name="${CSS.escape(`publish-answer-key-${question.id}`)}"]:checked`);
			const itemWeights = question.subquestions.map((_, index) =>
				Number(answerKeyFields.querySelector<HTMLInputElement>(`[name="${CSS.escape(`publish-subquestion-weight-${question.id}-${index}`)}"]`)?.value ?? previous?.subquestion_weights[index] ?? 1),
			);
			answerKeyDraft.set(question.id, {
				correct_option: correctInput ? Number(correctInput.value) : previous?.correct_option ?? null,
				weight: Number(weightInput?.value ?? previous?.weight ?? 1),
				subquestion_weights: question.subquestions.length ? itemWeights : previous?.subquestion_weights ?? [],
			});
		}
	};
	const renderAnswerKeyFields = (): void => {
		if (!answerKeyFields) return;
		captureAnswerKeyDraft();
		answerKeyFields.innerHTML = activityQuestions.map((question, index) => {
			const draft = answerKeyDraft.get(question.id);
			return `<fieldset class="activity-correct-answer"><legend>Gabarito · ${question.type === 'objective' ? 'Objetiva' : 'Subjetiva'}</legend><div class="activity-answer-key-heading"><strong>Questão ${index + 1}</strong><label class="activity-inline-weight">Peso<input type="number" name="publish-question-weight-${escapeHtml(question.id)}" min="0" max="10" step="0.1" value="${draft?.weight ?? 1}" required aria-label="Peso da questão ${index + 1}, de 0 a 10"></label></div><p class="activity-answer-key-prompt">${escapeHtml(question.prompt || 'Sem enunciado')}</p>${question.type === 'objective' ? question.options.map((option, optionIndex) => `<label><input type="radio" name="publish-answer-key-${escapeHtml(question.id)}" value="${optionIndex}" ${draft?.correct_option === optionIndex ? 'checked' : ''} required><span>${getAlphabeticLabel(optionIndex, true)}. ${escapeHtml(option || `Alternativa ${getAlphabeticLabel(optionIndex, true)}`)}</span></label>`).join('') : `<div class="activity-subquestion-weights"><p>Pesos dos itens subjetivos</p>${question.subquestions.map((subquestion, subquestionIndex) => `<div class="activity-subquestion-weight-row"><span>${getAlphabeticLabel(subquestionIndex)}) ${escapeHtml(subquestion || 'Sem enunciado')}</span><label class="activity-inline-weight">Peso<input type="number" name="publish-subquestion-weight-${escapeHtml(question.id)}-${subquestionIndex}" min="0" max="10" step="0.1" value="${draft?.subquestion_weights[subquestionIndex] ?? 1}" required aria-label="Peso do item ${getAlphabeticLabel(subquestionIndex)} da questão ${index + 1}, de 0 a 10"></label></div>`).join('')}</div>`}</fieldset>`;
		}).join('');
	};
	const renderActivityQuestionList = (): void => {
		if (!activityQuestionList) return;
		activityQuestionList.innerHTML = activityQuestions.length
			? activityQuestions.map((question, questionIndex) => renderActivityQuestion(question, questionIndex, activityQuestionImages.get(question.id)?.name ?? '')).join('')
			: '<p class="activity-question-empty">Ainda não há questões. Use “Adicionar questão” para começar.</p>';
		renderAnswerKeyFields();
	};
	const statusForActivityImage = (): HTMLElement | null => pageContent?.querySelector<HTMLElement>('[data-teacher-publisher-status]') ?? null;
	const addActivityQuestion = (): void => {
		activityQuestions.push({
			id: crypto.randomUUID(),
			type: 'objective',
			prompt: '',
			options: ['', '', '', ''],
			subquestions: [''],
		});
		renderActivityQuestionList();
		activityQuestionList?.querySelector<HTMLTextAreaElement>(`[data-question-prompt="${activityQuestions.length - 1}"]`)?.focus();
	};
	const updateActivityFields = (): void => {
		const isActivity = typeSelect?.value === 'activity';
		if (activityBuilder) activityBuilder.hidden = !isActivity;
		if (answerKeySection) answerKeySection.hidden = !isActivity;
		answerKeyFields?.querySelectorAll<HTMLInputElement>('input').forEach((input) => { input.disabled = !isActivity; });
		if (descriptionField) descriptionField.hidden = Boolean(isActivity);
		if (descriptionHint && !isActivity) descriptionHint.textContent = 'Adicione um texto ou anexe um arquivo abaixo.';
		updateRelatedContentOptions();
		if (isActivity && !activityQuestions.length) addActivityQuestion();
	};
	typeSelect?.addEventListener('change', updateActivityFields);
	pageContent.querySelector<HTMLButtonElement>('[data-add-activity-question]')?.addEventListener('click', addActivityQuestion);
	activityQuestionList?.addEventListener('input', (event) => {
		if (!(event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement)) return;
		const questionIndex = Number(event.target.dataset.questionIndex);
		const itemIndex = Number(event.target.dataset.itemIndex);
		const question = activityQuestions[questionIndex];
		if (!question) return;
		if (event.target.matches('[data-question-prompt]')) question.prompt = event.target.value;
		else if (event.target.matches('[data-question-option]') && question.type === 'objective' && question.options[itemIndex] !== undefined) question.options[itemIndex] = event.target.value;
		else if (event.target.matches('[data-question-subquestion]') && question.type === 'subjective' && question.subquestions[itemIndex] !== undefined) question.subquestions[itemIndex] = event.target.value;
		renderAnswerKeyFields();
	});
	activityQuestionList?.addEventListener('change', (event) => {
		if (!(event.target instanceof HTMLInputElement) || !event.target.matches('[data-question-image]')) return;
		const questionIndex = Number(event.target.dataset.questionIndex);
		const question = activityQuestions[questionIndex];
		const image = event.target.files?.[0];
		if (!question || !image) return;
		if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(image.type)) {
			const imageStatus = statusForActivityImage();
			if (imageStatus) imageStatus.textContent = 'Use uma imagem JPG, PNG, WebP ou GIF.';
			event.target.value = '';
			return;
		}
		if (image.size > 5 * 1024 * 1024) {
			const imageStatus = statusForActivityImage();
			if (imageStatus) imageStatus.textContent = 'A imagem deve ter no máximo 5 MB.';
			event.target.value = '';
			return;
		}
		activityQuestionImages.set(question.id, image);
		renderActivityQuestionList();
	});
	activityQuestionList?.addEventListener('click', (event) => {
		if (!(event.target instanceof Element)) return;
		const action = event.target.closest<HTMLButtonElement>('[data-activity-action]');
		if (!action) return;
		const questionIndex = Number(action.dataset.questionIndex);
		const itemIndex = Number(action.dataset.itemIndex);
		const question = activityQuestions[questionIndex];
		if (action.dataset.activityAction === 'add-question') {
			addActivityQuestion();
			return;
		}
		if (!question) return;
		captureAnswerKeyDraft();
		switch (action.dataset.activityAction) {
			case 'remove-question':
				activityQuestionImages.delete(question.id);
				answerKeyDraft.delete(question.id);
				activityQuestions.splice(questionIndex, 1);
				break;
			case 'remove-image':
				activityQuestionImages.delete(question.id);
				question.image_url = null;
				break;
			case 'set-objective':
				question.type = 'objective';
				question.prompt = '';
				question.options = ['', '', '', ''];
				question.subquestions = [];
				answerKeyDraft.set(question.id, { correct_option: null, weight: answerKeyDraft.get(question.id)?.weight ?? 1, subquestion_weights: [] });
				answerKeyFields?.replaceChildren();
				break;
			case 'set-subjective':
				question.type = 'subjective';
				question.prompt = '';
				question.options = [];
				question.subquestions = [''];
				answerKeyDraft.set(question.id, { correct_option: null, weight: answerKeyDraft.get(question.id)?.weight ?? 1, subquestion_weights: [1] });
				answerKeyFields?.replaceChildren();
				break;
			case 'add-option':
				question.options.push('');
				break;
			case 'remove-option':
				if (question.options.length > 2) question.options.splice(itemIndex, 1);
				break;
			case 'add-subquestion':
				question.subquestions.push('');
				break;
			case 'remove-subquestion':
				if (question.subquestions.length > 1) question.subquestions.splice(itemIndex, 1);
				break;
		}
		renderActivityQuestionList();
	});
	renderActivityQuestionList();
	updateActivityFields();
	const attachmentInput = pageContent.querySelector<HTMLInputElement>('[data-teacher-content-publisher] [name="attachment"]');
	const attachmentSelection = pageContent.querySelector<HTMLElement>('[data-attachment-selection]');
	const removeAttachmentButton = pageContent.querySelector<HTMLButtonElement>('[data-remove-attachment]');
	attachmentInput?.addEventListener('change', () => {
		const attachment = attachmentInput.files?.[0];
		if (attachment && attachmentSelection) attachmentSelection.textContent = attachment.name;
		if (removeAttachmentButton) removeAttachmentButton.hidden = !attachment;
	});
	removeAttachmentButton?.addEventListener('click', () => {
		if (attachmentInput) attachmentInput.value = '';
		if (attachmentSelection) attachmentSelection.textContent = '';
		removeAttachmentButton.hidden = true;
	});
	pageContent.querySelector<HTMLFormElement>('[data-teacher-content-publisher]')?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const form = event.currentTarget;
		if (!(form instanceof HTMLFormElement)) return;
		const data = new FormData(form);
		const status = form.querySelector<HTMLElement>('[data-teacher-publisher-status]');
		const submitButton = form.querySelector<HTMLButtonElement>('[type="submit"]');
		if (!status || !submitButton) throw new Error('O formulário de publicação está incompleto.');
		if (!form.reportValidity()) return;
		if (String(data.get('title') ?? '').trim().length < 2) {
			status.textContent = 'O título deve ter pelo menos 2 caracteres.';
			return;
		}
		if (String(data.get('subject') ?? '').trim().length < 2) {
			status.textContent = 'A disciplina deve ter pelo menos 2 caracteres.';
			return;
		}

		const attachment = data.get('attachment');
		const description = String(data.get('description') ?? '').trim();
		const contentType = String(data.get('content_type'));
		if (contentType === 'activity' && !activityQuestions.length) {
			status.textContent = 'Adicione pelo menos uma questão à atividade.';
			return;
		}
		if (contentType === 'activity') {
			const hasIncompleteQuestion = activityQuestions.some((question) =>
				question.type === 'objective'
					? !question.prompt.trim() || question.options.some((option) => !option.trim())
					: !question.prompt.trim() || question.subquestions.some((subquestion) => !subquestion.trim()),
			);
			if (hasIncompleteQuestion) {
				status.textContent = 'Preencha o enunciado de cada questão e todos os campos antes de publicar.';
				return;
			}
		}
		const publishedAnswerKeys: Record<string, ActivityAnswerKey> = {};
		if (contentType === 'activity') {
			for (const question of activityQuestions) {
				const weight = Number(data.get(`publish-question-weight-${question.id}`));
				if (!Number.isFinite(weight) || weight < 0 || weight > 10) {
					status.textContent = 'Informe um peso de 0 a 10 para cada questão.';
					return;
				}
				if (question.type === 'objective') {
					const correctOption = data.get(`publish-answer-key-${question.id}`);
					if (typeof correctOption !== 'string' || !Number.isInteger(Number(correctOption)) || Number(correctOption) >= question.options.length) {
						status.textContent = 'Marque a alternativa correta de todas as questões objetivas.';
						return;
					}
					publishedAnswerKeys[question.id] = { correct_option: Number(correctOption), weight, subquestion_weights: [] };
				} else {
					const subquestionWeights = question.subquestions.map((_, index) =>
						Number(data.get(`publish-subquestion-weight-${question.id}-${index}`)),
					);
					if (subquestionWeights.some((itemWeight) => !Number.isFinite(itemWeight) || itemWeight < 0 || itemWeight > 10)) {
						status.textContent = 'Informe um peso de 0 a 10 para cada item subjetivo.';
						return;
					}
					if (!subquestionWeights.some((itemWeight) => itemWeight > 0)) {
						status.textContent = 'Defina um peso maior que zero em pelo menos um item de cada questão subjetiva.';
						return;
					}
					publishedAnswerKeys[question.id] = { correct_option: null, weight, subquestion_weights: subquestionWeights };
				}
			}
			if (!Object.values(publishedAnswerKeys).some((answerKey) => answerKey.weight > 0)) {
				status.textContent = 'Defina um peso maior que zero em pelo menos uma questão.';
				return;
			}
		}
		if (contentType !== 'activity' && !description && (!(attachment instanceof File) || attachment.size === 0)) {
			status.textContent = 'Escreva o conteúdo ou selecione um arquivo.';
			return;
		}
		if (attachment instanceof File && attachment.size > 50 * 1024 * 1024) {
			status.textContent = 'O arquivo excede o limite de 50 MB. Escolha um arquivo menor.';
			return;
		}

		submitButton.disabled = true;
		status.textContent = 'Publicando conteúdo...';
		const uploadedStoragePaths: string[] = [];
		let contentPublished = false;
		let createdContentId: string | null = null;
		try {
			const user = await supabase.auth.getUser();
			if (user.error || !user.data.user) throw user.error ?? new Error('Usuário não autenticado.');

			let attachmentUrl: string | null = null;
			let attachmentName: string | null = null;
			if (attachment instanceof File && attachment.size > 0) {
				const uploadedStoragePath = `${user.data.user.id}/${crypto.randomUUID()}-${attachment.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
				const upload = await supabase.storage.from('teacher-contents').upload(uploadedStoragePath, attachment);
				if (upload.error) {
					console.error('Não foi possível enviar o arquivo.', upload.error);
					status.textContent = upload.error.message.toLowerCase().includes('size')
						? 'O arquivo excede o limite permitido pelo armazenamento.'
						: 'Não foi possível enviar o arquivo. Verifique as permissões e o limite do bucket teacher-contents no Supabase.';
					return;
				}
				uploadedStoragePaths.push(uploadedStoragePath);
				attachmentUrl = supabase.storage.from('teacher-contents').getPublicUrl(uploadedStoragePath).data.publicUrl;
				attachmentName = attachment.name;
			}

			const publishedQuestions = contentType === 'activity'
				? activityQuestions.map((question) => ({ ...question }))
				: [];
			for (const question of publishedQuestions) {
				const image = activityQuestionImages.get(question.id);
				if (!image) continue;
				const imagePath = `${user.data.user.id}/${crypto.randomUUID()}-${image.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
				const imageUpload = await supabase.storage.from('teacher-contents').upload(imagePath, image);
				if (imageUpload.error) {
					console.error('Não foi possível enviar a imagem da questão.', imageUpload.error);
					if (uploadedStoragePaths.length) {
						const cleanup = await supabase.storage.from('teacher-contents').remove(uploadedStoragePaths);
						if (cleanup.error) console.error('Os arquivos enviados não puderam ser removidos após a falha no upload da imagem.', cleanup.error);
					}
					status.textContent = 'Não foi possível enviar a imagem de uma questão. Verifique as permissões e o limite do bucket teacher-contents no Supabase.';
					return;
				}
				uploadedStoragePaths.push(imagePath);
				question.image_url = supabase.storage.from('teacher-contents').getPublicUrl(imagePath).data.publicUrl;
			}

			const result = await supabase.from('teacher_contents').insert({
				teacher_id: user.data.user.id,
				title: String(data.get('title')).trim(),
				subject: String(data.get('subject')).trim(),
				content_type: contentType,
				description: description || '',
				attachment_url: attachmentUrl,
				attachment_name: attachmentName,
				activity_questions: publishedQuestions,
			}).select('id').single();
			if (result.error) {
				console.error('Não foi possível publicar o conteúdo.', result.error);
				if (uploadedStoragePaths.length) {
					const cleanup = await supabase.storage.from('teacher-contents').remove(uploadedStoragePaths);
					if (cleanup.error) console.error('Os arquivos enviados não puderam ser removidos após a falha na publicação.', cleanup.error);
				}
				status.textContent = result.error.message.includes('teacher_contents_title_check')
					? 'O título deve ter pelo menos 2 caracteres.'
					: result.error.message.includes('teacher_contents_subject_check')
						? 'A disciplina deve ter pelo menos 2 caracteres.'
						: `Não foi possível salvar o conteúdo: ${result.error.message}`;
				return;
			}
			createdContentId = result.data.id;
			if (contentType === 'activity') {
				const answerKeyResult = await supabase.rpc('save_activity_answer_key', {
					target_activity_id: result.data.id,
					answer_keys: publishedAnswerKeys,
				});
				if (answerKeyResult.error) {
					console.error('O conteúdo foi criado, mas não foi possível salvar o gabarito durante a publicação.', answerKeyResult.error);
					const rollback = await supabase.from('teacher_contents').delete().eq('id', result.data.id).select('id').maybeSingle();
					if (rollback.error || !rollback.data) {
						contentPublished = true;
						status.textContent = 'A atividade foi publicada, mas não foi possível salvar o gabarito nem cancelar a publicação. Exclua esta atividade e publique novamente para cadastrar o gabarito.';
						console.error('Não foi possível cancelar a publicação após a falha ao salvar o gabarito.', rollback.error);
						return;
					}
					if (uploadedStoragePaths.length) {
						const cleanup = await supabase.storage.from('teacher-contents').remove(uploadedStoragePaths);
						if (cleanup.error) console.error('Os arquivos enviados não puderam ser removidos após cancelar a publicação.', cleanup.error);
					}
					status.textContent = `Não foi possível salvar o gabarito; a publicação foi cancelada: ${answerKeyResult.error.message}`;
					return;
				}
			}
			contentPublished = true;

			let relationshipError = false;
			const relatedContentId = String(data.get('related_content_id') ?? '');
			if (relatedContentId) {
				const contentType = String(data.get('content_type'));
				const relationship = await supabase.from('teacher_content_links').insert({
					summary_id: contentType === 'summary' ? result.data.id : relatedContentId,
					activity_id: contentType === 'activity' ? result.data.id : relatedContentId,
				});
				if (relationship.error) {
					relationshipError = true;
					console.error('O conteúdo foi publicado, mas não foi possível criar o vínculo.', relationship.error);
				}
			}

			form.reset();
			activityQuestions.splice(0, activityQuestions.length);
			activityQuestionImages.clear();
			answerKeyDraft.clear();
			renderActivityQuestionList();
			updateActivityFields();
			if (attachmentSelection) attachmentSelection.textContent = '';
			if (removeAttachmentButton) removeAttachmentButton.hidden = true;
			pageContent.querySelector<HTMLDialogElement>('[data-content-modal]')?.close();
			await renderMaterials();
			const refreshedStatus = pageContent.querySelector<HTMLElement>('[data-content-action-status]');
			if (refreshedStatus) refreshedStatus.textContent = relationshipError
				? 'Conteúdo publicado, mas não foi possível salvar o vínculo.'
				: 'Conteúdo publicado com sucesso.';
		} catch (error) {
			console.error('Erro inesperado ao publicar conteúdo.', error);
			if (!contentPublished && createdContentId) {
				const rollback = await supabase.from('teacher_contents').delete().eq('id', createdContentId).select('id').maybeSingle();
				if (rollback.error || !rollback.data) {
					contentPublished = true;
					status.textContent = 'A atividade foi publicada, mas houve um erro ao salvar o gabarito e não foi possível cancelar a publicação. Exclua e publique novamente para cadastrar o gabarito.';
					console.error('Não foi possível cancelar a publicação após um erro inesperado.', rollback.error);
				}
			}
			if (!contentPublished && uploadedStoragePaths.length) {
				const cleanup = await supabase.storage.from('teacher-contents').remove(uploadedStoragePaths);
				if (cleanup.error) console.error('Os arquivos enviados não puderam ser removidos após a falha na publicação.', cleanup.error);
			}
			if (!contentPublished) status.textContent = error instanceof Error ? `Ocorreu um erro ao publicar: ${error.message}` : 'Ocorreu um erro ao publicar. Tente novamente.';
		} finally {
			submitButton.disabled = false;
		}
	});
	updateRelatedContentOptions();
}

function updateRelatedContentOptions(): void {
	const form = pageContent?.querySelector<HTMLFormElement>('[data-teacher-content-publisher]');
	const typeSelect = form?.querySelector<HTMLSelectElement>('[name="content_type"]');
	const relatedSelect = form?.querySelector<HTMLSelectElement>('[data-related-content-select]');
	const hint = form?.querySelector<HTMLElement>('[data-related-content-hint]');
	if (!typeSelect || !relatedSelect) return;

	const contentType = typeSelect.value;
	const compatibleType = contentType === 'summary' ? 'activity' : contentType === 'activity' ? 'summary' : null;
	const relationshipField = relatedSelect.closest<HTMLElement>('.content-publisher-related-field');
	if (relationshipField) relationshipField.hidden = !compatibleType;
	const currentValue = relatedSelect.value;
	const compatibleContents = compatibleType
		? publishedContents.filter((content) => content.content_type === compatibleType)
		: [];
	relatedSelect.innerHTML = `<option value="">Sem vínculo</option>${compatibleContents.map((content) => `<option value="${escapeHtml(content.id)}">${escapeHtml(content.title)} · ${escapeHtml(content.subject)}</option>`).join('')}`;
	relatedSelect.disabled = !compatibleType || !compatibleContents.length;
	if (compatibleType && compatibleContents.some((content) => content.id === currentValue)) relatedSelect.value = currentValue;
	if (hint) {
		hint.textContent = !compatibleType
			? 'Outro material não pode ser vinculado a resumo ou atividade.'
			: compatibleContents.length
				? `Escolha um ${compatibleType === 'summary' ? 'resumo' : 'atividade'} já publicado para vincular.`
				: `Publique primeiro um ${compatibleType === 'summary' ? 'resumo' : 'atividade'} para poder vinculá-lo.`;
	}
}

function renderActivityQuestion(question: ActivityQuestion, questionIndex: number, selectedImageName: string): string {
	const questionTypeButtons = `
		<div class="activity-question-type" role="group" aria-label="Tipo da questão ${questionIndex + 1}">
			<button type="button" data-activity-action="set-objective" data-question-index="${questionIndex}" aria-pressed="${question.type === 'objective'}">Objetiva</button>
			<button type="button" data-activity-action="set-subjective" data-question-index="${questionIndex}" aria-pressed="${question.type === 'subjective'}">Subjetiva</button>
		</div>
	`;
	const fields = question.type === 'objective'
		? `<label class="activity-question-prompt">Enunciado<textarea data-question-prompt data-question-index="${questionIndex}" rows="3" placeholder="Escreva o enunciado da questão" required>${escapeHtml(question.prompt)}</textarea></label>
			<fieldset class="activity-options"><legend>Alternativas</legend>
				${question.options.map((option, optionIndex) => `<label class="activity-option"><span>${getAlphabeticLabel(optionIndex, true)}</span><input type="text" data-question-option data-question-index="${questionIndex}" data-item-index="${optionIndex}" value="${escapeHtml(option)}" placeholder="Alternativa ${getAlphabeticLabel(optionIndex, true)}" required>${question.options.length > 2 ? `<button type="button" class="activity-remove-item" data-activity-action="remove-option" data-question-index="${questionIndex}" data-item-index="${optionIndex}" aria-label="Remover alternativa ${getAlphabeticLabel(optionIndex, true)}">×</button>` : ''}</label>`).join('')}
				<button type="button" class="activity-add-item" data-activity-action="add-option" data-question-index="${questionIndex}">＋ Adicionar alternativa</button>
			</fieldset>${renderQuestionImageControl(question, questionIndex, selectedImageName)}`
		: `<label class="activity-question-prompt">Enunciado<textarea data-question-prompt data-question-index="${questionIndex}" rows="3" placeholder="Escreva o enunciado da questão subjetiva" required>${escapeHtml(question.prompt)}</textarea></label>
			<fieldset class="activity-options"><legend>Itens da questão</legend>
				${question.subquestions.map((subquestion, subquestionIndex) => `<label class="activity-subquestion"><span>${getAlphabeticLabel(subquestionIndex)})</span><textarea data-question-subquestion data-question-index="${questionIndex}" data-item-index="${subquestionIndex}" rows="2" placeholder="Escreva o enunciado do item ${getAlphabeticLabel(subquestionIndex)})" required>${escapeHtml(subquestion)}</textarea>${question.subquestions.length > 1 ? `<button type="button" class="activity-remove-item" data-activity-action="remove-subquestion" data-question-index="${questionIndex}" data-item-index="${subquestionIndex}" aria-label="Remover item ${getAlphabeticLabel(subquestionIndex)}">×</button>` : ''}</label>`).join('')}
				<button type="button" class="activity-add-item" data-activity-action="add-subquestion" data-question-index="${questionIndex}">＋ Adicionar item</button>
			</fieldset>${renderQuestionImageControl(question, questionIndex, selectedImageName)}`;
	return `<article class="activity-question-card">
		<header class="activity-question-card-heading"><strong>Questão ${questionIndex + 1}</strong>${questionTypeButtons}<button type="button" class="activity-remove-question" data-activity-action="remove-question" data-question-index="${questionIndex}" aria-label="Remover questão" title="Remover questão">×</button></header>
		${fields}
	</article>`;
}

function renderQuestionImageControl(question: ActivityQuestion, questionIndex: number, selectedImageName: string): string {
	const imageLabel = selectedImageName || question.image_url?.split('/').pop() || '';
	return `<div class="activity-question-image-control">
		<label>Imagem da questão (opcional)<input type="file" accept="image/jpeg,image/png,image/webp,image/gif" data-question-image data-question-index="${questionIndex}"></label>
		${imageLabel ? `<span class="activity-question-image-name">${escapeHtml(imageLabel)}</span><button type="button" class="activity-remove-item" data-activity-action="remove-image" data-question-index="${questionIndex}" aria-label="Remover imagem da questão">×</button>` : '<span class="activity-question-image-hint">JPG, PNG, WebP ou GIF · até 5 MB</span>'}
	</div>`;
}

function getAlphabeticLabel(index: number, uppercase = false): string {
	let value = index + 1;
	let label = '';
	while (value > 0) {
		value -= 1;
		label = String.fromCharCode((uppercase ? 65 : 97) + value % 26) + label;
		value = Math.floor(value / 26);
	}
	return label;
}

async function loadPublishedContents(): Promise<void> {
	const result = await supabase
		.from('teacher_contents')
		.select('id, teacher_id, title, subject, content_type, description, attachment_url, attachment_name, activity_questions, created_at')
		.order('created_at', { ascending: false });
	if (result.error) {
		console.error('Não foi possível carregar os conteúdos publicados.', result.error);
		publishedContents = [];
		return;
	}
	publishedContents = (result.data ?? []) as PublishedContent[];
	if (!publishedContents.length) return;

	const linksResult = await supabase
		.from('teacher_content_links')
		.select('summary_id, activity_id');
	if (linksResult.error) {
		console.error('Não foi possível carregar os vínculos entre conteúdos.', linksResult.error);
		return;
	}

	const contentsById = new Map(publishedContents.map((content) => [content.id, content]));
	for (const link of linksResult.data ?? []) {
		const summary = contentsById.get(link.summary_id);
		const activity = contentsById.get(link.activity_id);
		if (!summary || !activity) continue;
		summary.relatedContents ??= [];
		activity.relatedContents ??= [];
		summary.relatedContents.push({ id: activity.id, title: activity.title, content_type: 'activity' });
		activity.relatedContents.push({ id: summary.id, title: summary.title, content_type: 'summary' });
	}
}

async function renderTeacherDashboard(): Promise<void> {
	if (!pageContent) return;
	const profile = await loadCurrentProfile();
	if (!profile || profile.role !== 'teacher') {
		pageContent.innerHTML = '<section class="performance-page"><div class="performance-demo-notice" role="alert">Esta área é exclusiva para professores.</div></section>';
		return;
	}
	const [roomsResult, contentsResult] = await Promise.all([
		supabase.from('classrooms').select('id, name, subject').eq('teacher_id', profile.id).order('created_at', { ascending: false }),
		supabase.from('teacher_contents').select('id, title, subject, content_type, description').eq('teacher_id', profile.id).order('created_at', { ascending: false }),
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
				<section class="performance-panel"><h3>Publicar conteúdo</h3><p>Envie um novo material para a biblioteca.</p><form class="classroom-chat-form" data-teacher-content-form><input name="title" placeholder="Título" required><input name="subject" placeholder="Disciplina" required><select name="content_type"><option value="material">Outro material</option><option value="summary">Resumo</option><option value="activity">Atividade</option></select><textarea name="description" placeholder="Conteúdo" required></textarea><button type="submit">Publicar</button></form><div>${contents.length ? contents.map((content: { content_type: 'material' | ContentType; subject: string; title: string; description: string }) => `<article class="material-card"><span class="material-subject">${escapeHtml(getContentTypeLabel(content.content_type))} · ${escapeHtml(content.subject)}</span><h3>${escapeHtml(content.title)}</h3><p>${escapeHtml(content.description)}</p></article>`).join('') : '<p class="empty-state">Nenhum conteúdo publicado.</p>'}</div></section>
				<section class="performance-panel"><h3>Minhas salas</h3><p>Crie turmas e autorize individualmente os alunos que poderão entrar.</p><form class="classroom-chat-form" data-teacher-room-form><input name="name" placeholder="Nome da turma" required><input name="subject" placeholder="Disciplina" required><button type="submit">Criar sala</button></form><div class="classroom-room-list">${rooms.length ? rooms.map((room: { id: string; name: string; subject: string }) => `<div class="classroom-room-option"><strong>${escapeHtml(room.name)}</strong><span>${escapeHtml(room.subject)}</span><a href="#classroom" data-page="classroom">Abrir sala</a></div>`).join('') : '<p class="empty-state">Nenhuma sala criada.</p>'}</div></section>
				<section class="performance-panel"><h3>Agenda da turma</h3><p>Agende aulas, atividades e prazos.</p><form class="classroom-chat-form" data-teacher-event-form><select name="classroom_id" required>${rooms.map((room: { id: string; name: string }) => `<option value="${room.id}">${escapeHtml(room.name)}</option>`).join('')}</select><input name="title" placeholder="Título do evento" required><select name="event_type"><option value="class">Aula</option><option value="activity">Atividade</option><option value="deadline">Prazo</option></select><input name="starts_at" type="datetime-local" required><button type="submit">Agendar</button></form></section>
				<section class="performance-panel"><h3>Desempenho dos alunos</h3><p>Consulte pontuações, médias e frequência dos alunos matriculados.</p><a class="home-primary-link" href="#performance" data-page="performance">Analisar desempenho</a></section>
				<section class="performance-panel performance-achievements"><h3>Alunos das minhas turmas</h3><p>${members.length} aluno(s) aprovado(s).</p>${members.length ? `<ul class="performance-achievement-list">${members.map((member) => `<li><span class="performance-medal" aria-hidden="true">👤</span><span><strong>${escapeHtml(member.profile?.full_name ?? 'Aluno')}</strong><small>${escapeHtml(member.classroom?.name ?? 'Turma')}</small></span><a href="#performance" data-page="performance">Desempenho</a></li>`).join('')}</ul>` : '<p class="empty-state">Nenhum aluno aprovado ainda.</p>'}</section>
			</div>
		</section>
	`;
	pageContent.querySelector<HTMLFormElement>('[data-teacher-content-form]')?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const data = new FormData(event.currentTarget as HTMLFormElement);
		const result = await supabase.from('teacher_contents').insert({ teacher_id: profile.id, title: String(data.get('title')).trim(), subject: String(data.get('subject')).trim(), content_type: String(data.get('content_type')), description: String(data.get('description')).trim() });
		if (result.error) throw result.error;
		await renderTeacherDashboard();
	});
	pageContent.querySelector<HTMLFormElement>('[data-teacher-room-form]')?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const data = new FormData(event.currentTarget as HTMLFormElement);
		const result = await supabase.from('classrooms').insert({ teacher_id: profile.id, name: String(data.get('name')).trim(), subject: String(data.get('subject')).trim() });
		if (result.error) throw result.error;
		await renderTeacherDashboard();
	});
	pageContent.querySelector<HTMLFormElement>('[data-teacher-event-form]')?.addEventListener('submit', async (event) => {
		event.preventDefault();
		const data = new FormData(event.currentTarget as HTMLFormElement);
		const result = await supabase.from('agenda_events').insert({ classroom_id: String(data.get('classroom_id')), created_by: profile.id, title: String(data.get('title')).trim(), event_type: String(data.get('event_type')), starts_at: new Date(String(data.get('starts_at'))).toISOString() });
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
	const profile = await loadCurrentProfile();
	if (!profile) {
		pageContent.innerHTML = '<section class="performance-page"><div class="performance-demo-notice" role="status">Entre na sua conta para acessar seu desempenho.</div></section>';
		return;
	}
	if (profile.role === 'teacher') {
		await renderTeacherStudentPerformance();
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
			supabase.from('classrooms').select('id, name, subject').eq('teacher_id', authData.user.id).order('created_at', { ascending: false }),
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
							<select name="content_type"><option value="material">Outro material</option><option value="summary">Resumo</option><option value="activity">Atividade</option></select>
							<textarea name="description" placeholder="Conteúdo" required></textarea>
							<button type="submit">Publicar</button>
						</form>
						<div data-teacher-content-list>${contents.length ? contents.map((content: { content_type: 'material' | ContentType; subject: string; title: string; description: string }) => `<article class="material-card"><span class="material-subject">${escapeHtml(getContentTypeLabel(content.content_type))} · ${escapeHtml(content.subject)}</span><h3>${escapeHtml(content.title)}</h3><p>${escapeHtml(content.description)}</p></article>`).join('') : '<p class="empty-state">Nenhum conteúdo publicado.</p>'}</div>
					</section>
					<section class="performance-panel"><h3>Minhas salas</h3><p>Crie turmas e autorize individualmente os alunos que poderão entrar.</p>
						<form class="classroom-chat-form" data-teacher-room-form><input name="name" placeholder="Nome da turma" required><input name="subject" placeholder="Disciplina" required><button type="submit">Criar sala</button></form>
						<div class="classroom-room-list">${rooms.length ? rooms.map((room: { id: string; name: string; subject: string }) => `<div class="classroom-room-option"><strong>${escapeHtml(room.name)}</strong><span>${escapeHtml(room.subject)}</span><a href="#classroom" data-page="classroom" data-classroom-id="${room.id}">Abrir sala</a></div>`).join('') : '<p class="empty-state">Nenhuma sala criada.</p>'}</div>
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

	const [submissionsResult, attendanceResult, achievementsResult, activityResponsesResult] = await Promise.all([
		supabase.from('assignment_submissions').select('score, assignments(max_score, title)').eq('student_id', profile.id),
		supabase.from('attendance').select('present').eq('student_id', profile.id),
		supabase.from('student_achievements').select('awarded_at, achievements(name, description, icon)').eq('student_id', profile.id).order('awarded_at', { ascending: false }),
		supabase.from('activity_responses').select('activity_id, score, attempt_number').eq('student_id', profile.id).not('score', 'is', null).order('submitted_at', { ascending: false }),
	]);
	if (submissionsResult.error) throw submissionsResult.error;
	if (attendanceResult.error) throw attendanceResult.error;
	if (achievementsResult.error) throw achievementsResult.error;
	if (activityResponsesResult.error) throw activityResponsesResult.error;

	const submissions = (submissionsResult.data ?? []) as SubmissionScore[];
	const attendance = (attendanceResult.data ?? []) as AttendanceRecord[];
	const achievements = (achievementsResult.data ?? []) as StudentAchievement[];
	const activityResponses = (activityResponsesResult.data ?? []) as Array<{ activity_id: string; score: number | null; attempt_number: number }>;
	const gradedActivityIds = [...new Set(activityResponses.map((response) => response.activity_id))];
	const gradedActivitiesResult = gradedActivityIds.length
		? await supabase.from('teacher_contents').select('id, title, subject').in('id', gradedActivityIds)
		: { data: [], error: null };
	if (gradedActivitiesResult.error) throw gradedActivitiesResult.error;
	const gradedActivities = (gradedActivitiesResult.data ?? []) as Array<{ id: string; title: string; subject: string }>;
	const activityById = new Map(gradedActivities.map((activity) => [activity.id, activity]));
	const graded = submissions.filter((submission) => submission.score !== null && submission.assignments);
	const gradedActivitiesWithTitle = activityResponses.filter((response) => response.score !== null && activityById.has(response.activity_id));
	const totalGradedCount = graded.length + gradedActivitiesWithTitle.length;
	const average = totalGradedCount
		? (graded.reduce((sum, submission) => sum + ((submission.score ?? 0) / submission.assignments!.max_score) * 10, 0)
			+ gradedActivitiesWithTitle.reduce((sum, response) => sum + Number(response.score), 0)) / totalGradedCount
		: null;
	const present = attendance.filter((record) => record.present).length;
	const attendanceRate = attendance.length ? Math.round((present / attendance.length) * 100) : null;

	pageContent!.innerHTML = `
		<section class="performance-page" aria-labelledby="performance-title">
			<header class="performance-heading"><div><p class="section-label">ACOMPANHAMENTO ESCOLAR</p><h2 id="performance-title">Painel de Desempenho</h2><p>Dados registrados nas suas atividades e aulas.</p></div></header>
			<div class="performance-demo-notice" role="status">${totalGradedCount || attendance.length || achievements.length ? 'Informações carregadas do banco de dados.' : 'Ainda não existem dados de desempenho registrados.'}</div>
			<section class="performance-stat-grid" aria-label="Resumo do desempenho">
				<article class="performance-stat-card"><span class="performance-stat-icon" aria-hidden="true">▤</span><div><p>Média geral</p><strong>${average === null ? '—' : average.toFixed(1)} <small>/ 10</small></strong><span class="performance-stat-detail">${totalGradedCount} atividade(s) avaliadas</span></div></article>
				<article class="performance-stat-card"><span class="performance-stat-icon" aria-hidden="true">✓</span><div><p>Frequência</p><strong>${attendanceRate === null ? '—' : attendanceRate}<small>${attendanceRate === null ? '' : '%'}</small></strong><span class="performance-stat-detail">${present} presença(s) em ${attendance.length} aula(s)</span></div></article>
				<article class="performance-stat-card"><span class="performance-stat-icon" aria-hidden="true">✦</span><div><p>Atividades avaliadas</p><strong>${totalGradedCount}</strong><span class="performance-stat-detail">Registros no banco</span></div></article>
				<article class="performance-stat-card"><span class="performance-stat-icon" aria-hidden="true">♛</span><div><p>Conquistas</p><strong>${achievements.length}</strong><span class="performance-stat-detail">Medalhas recebidas</span></div></article>
			</section>
			<section class="performance-panel performance-achievements" aria-labelledby="performance-activity-grades-title">
				<div class="performance-panel-heading"><div><h3 id="performance-activity-grades-title">Notas das atividades</h3><p>Notas registradas pelos professores</p></div></div>
				${gradedActivitiesWithTitle.length ? `<ul class="teacher-performance-detail-list">${gradedActivitiesWithTitle.map((response) => {
					const activity = activityById.get(response.activity_id)!;
					return `<li><div><strong>${escapeHtml(activity.title)}</strong><span>${escapeHtml(activity.subject)} · Tentativa ${response.attempt_number}</span></div><b>${Number(response.score).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 10</b></li>`;
				}).join('')}</ul>` : '<p class="empty-state">Você ainda não recebeu nota em atividades.</p>'}
			</section>
			<section class="performance-panel performance-achievements" aria-labelledby="performance-achievements-title">
				<div class="performance-panel-heading"><div><h3 id="performance-achievements-title">Medalhas e conquistas</h3><p>Reconhecendo cada passo</p></div></div>
				${achievements.length ? `<ul class="performance-achievement-list">${achievements.map((item) => `<li><span class="performance-medal" aria-hidden="true">${escapeHtml(item.achievements?.icon ?? '★')}</span><span><strong>${escapeHtml(item.achievements?.name ?? 'Conquista')}</strong><small>${escapeHtml(item.achievements?.description ?? '')}</small></span><span class="performance-earned">Conquistada</span></li>`).join('')}</ul>` : '<p class="empty-state">Nenhuma conquista registrada.</p>'}
			</section>
		</section>
	`;
}

async function renderTeacherStudentPerformance(): Promise<void> {
	if (!pageContent) return;
	pageContent.innerHTML = `
		<section class="performance-page teacher-student-performance" aria-labelledby="teacher-performance-title">
			<header class="performance-heading">
				<div><p class="section-label">ÁREA DO PROFESSOR</p><h2 id="teacher-performance-title">Desempenho dos alunos</h2><p>Pesquise um aluno para consultar suas atividades, notas e frequência.</p></div>
			</header>
			<section class="performance-panel" aria-labelledby="teacher-performance-search-title">
				<div class="performance-panel-heading"><div><h3 id="teacher-performance-search-title">Pesquisar aluno</h3><p>Digite pelo menos dois caracteres do nome.</p></div></div>
				<label class="teacher-performance-search">
					<span class="visually-hidden">Nome do aluno</span>
					<input type="search" data-teacher-performance-search placeholder="Nome do aluno" autocomplete="off">
				</label>
				<p class="teacher-performance-search-status" data-teacher-performance-search-status role="status" aria-live="polite">Comece digitando o nome do aluno.</p>
				<div class="teacher-performance-search-results" data-teacher-performance-search-results></div>
				<section class="teacher-performance-detail" data-teacher-performance-detail aria-live="polite" hidden></section>
			</section>
		</section>
	`;

	const search = pageContent.querySelector<HTMLInputElement>('[data-teacher-performance-search]');
	const searchStatus = pageContent.querySelector<HTMLElement>('[data-teacher-performance-search-status]');
	const results = pageContent.querySelector<HTMLElement>('[data-teacher-performance-search-results]');
	const detail = pageContent.querySelector<HTMLElement>('[data-teacher-performance-detail]');
	if (!search || !searchStatus || !results || !detail) throw new Error('A interface de pesquisa do desempenho não foi encontrada.');

	let searchTimeout = 0;
	let searchSequence = 0;
	let detailSequence = 0;

	const renderStudentDetail = async (studentId: string, studentName: string): Promise<void> => {
		const requestSequence = ++detailSequence;
		detail.dataset.studentId = studentId;
		detail.hidden = false;
		detail.innerHTML = '<p class="performance-demo-notice" role="status">Carregando desempenho...</p>';

		try {
			const membershipsResult = await supabase
				.from('classroom_members')
				.select('classroom_id, classroom:classrooms!inner(name, subject)')
				.eq('student_id', studentId)
				.eq('status', 'approved');
			if (membershipsResult.error) throw membershipsResult.error;

			type Membership = { classroom_id: string; classroom: { name: string; subject: string } | null };
			const memberships = (membershipsResult.data ?? []) as Membership[];
			const classroomIds = [...new Set(memberships.map((membership) => membership.classroom_id))];
			const [assignmentsResult, attendanceResult, publishedActivitiesResult] = await Promise.all([
				classroomIds.length
					? supabase.from('assignments').select('id, classroom_id, title, max_score').in('classroom_id', classroomIds)
					: Promise.resolve({ data: [], error: null }),
				classroomIds.length
					? supabase.from('attendance').select('classroom_id, present, attendance_date').eq('student_id', studentId).in('classroom_id', classroomIds).order('attendance_date', { ascending: false })
					: Promise.resolve({ data: [], error: null }),
				currentUserId
					? supabase.from('teacher_contents').select('id, title, subject').eq('teacher_id', currentUserId).eq('content_type', 'activity')
					: Promise.resolve({ data: [], error: null }),
			]);
			if (assignmentsResult.error) throw assignmentsResult.error;
			if (attendanceResult.error) throw attendanceResult.error;
			if (publishedActivitiesResult.error) throw publishedActivitiesResult.error;

			type Assignment = { id: string; classroom_id: string; title: string; max_score: number };
			const assignments = (assignmentsResult.data ?? []) as Assignment[];
			const assignmentIds = assignments.map((assignment) => assignment.id);
			const submissionsResult = assignmentIds.length
				? await supabase.from('assignment_submissions').select('assignment_id, score, feedback, submitted_at').eq('student_id', studentId).in('assignment_id', assignmentIds)
				: { data: [], error: null };
			if (submissionsResult.error) throw submissionsResult.error;
			const publishedActivities = (publishedActivitiesResult.data ?? []) as Array<{ id: string; title: string; subject: string }>;
			const activityIds = publishedActivities.map((activity) => activity.id);
			const activityResponsesResult = activityIds.length
				? await supabase.from('activity_responses').select('activity_id, attempt_number, score, graded_at').eq('student_id', studentId).in('activity_id', activityIds)
				: { data: [], error: null };
			if (activityResponsesResult.error) throw activityResponsesResult.error;
			if (requestSequence !== detailSequence) return;

			const submissions = (submissionsResult.data ?? []) as Array<{ assignment_id: string; score: number | null; feedback: string | null; submitted_at: string | null }>;
			const attendanceRecords = (attendanceResult.data ?? []) as Array<{ classroom_id: string; present: boolean; attendance_date: string }>;
			const activityResponses = (activityResponsesResult.data ?? []) as Array<{ activity_id: string; attempt_number: number; score: number | null; graded_at: string | null }>;
			const submissionByAssignment = new Map(submissions.map((submission) => [submission.assignment_id, submission]));
			const graded = submissions.filter((submission) => submission.score !== null);
			const gradedActivityResponses = activityResponses.filter((response) => response.score !== null);
			const totalGradedCount = graded.length + gradedActivityResponses.length;
			const average = totalGradedCount
				? (graded.reduce((sum, submission) => {
					const assignment = assignments.find((item) => item.id === submission.assignment_id);
					return sum + (assignment ? (Number(submission.score) / Number(assignment.max_score)) * 10 : 0);
				}, 0) + gradedActivityResponses.reduce((sum, response) => sum + Number(response.score), 0)) / totalGradedCount
				: null;
			const presentCount = attendanceRecords.filter((record) => record.present).length;
			const membershipByClassroom = new Map(memberships.map((membership) => [membership.classroom_id, membership.classroom]));

			detail.innerHTML = `
				<div class="teacher-performance-detail-heading">
					<div><p class="section-label">DESEMPENHO INDIVIDUAL</p><h4 data-performance-detail-title tabindex="-1">${escapeHtml(studentName)}</h4><p>${memberships.map((membership) => escapeHtml(membership.classroom?.name ?? 'Turma')).filter((name, index, list) => list.indexOf(name) === index).join(', ') || 'Sem turma aprovada'}</p></div>
					<button type="button" class="teacher-performance-close" data-close-student-performance>Fechar</button>
				</div>
				<div class="teacher-performance-detail-summary">
					<span>Média das notas: <strong>${average === null ? 'Sem notas' : `${average.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 10`}</strong></span>
					<span>Frequência: <strong>${attendanceRecords.length ? `${Math.round((presentCount / attendanceRecords.length) * 100)}%` : 'Sem registros'}</strong></span>
					<span>Atividades avaliadas: <strong>${totalGradedCount}</strong></span>
				</div>
				<div class="teacher-performance-detail-columns">
					<div><h5>Atividades e notas</h5>${assignments.length ? `<ul class="teacher-performance-detail-list">${assignments.map((assignment) => {
						const submission = submissionByAssignment.get(assignment.id);
						const room = membershipByClassroom.get(assignment.classroom_id);
						const grade = !submission || submission.score === null ? 'Sem nota' : `${Number(submission.score).toLocaleString('pt-BR')} / ${Number(assignment.max_score).toLocaleString('pt-BR')}`;
						const delivery = !submission ? 'Não entregue' : submission.submitted_at ? `Entregue em ${new Intl.DateTimeFormat('pt-BR').format(new Date(submission.submitted_at))}` : 'Entrega registrada';
						return `<li><div><strong>${escapeHtml(assignment.title)}</strong><span>${escapeHtml(room?.name ?? 'Turma')} · ${delivery}</span>${submission?.feedback ? `<p>${escapeHtml(submission.feedback)}</p>` : ''}</div><b>${grade}</b></li>`;
					}).join('')}</ul>` : '<p class="empty-state">Este aluno não possui tarefas cadastradas nas turmas em que está matriculado.</p>'}
					${publishedActivities.length ? `<h5>Atividades publicadas</h5><ul class="teacher-performance-detail-list">${publishedActivities.flatMap((activity) => activityResponses.filter((response) => response.activity_id === activity.id).map((response) => `<li><div><strong>${escapeHtml(activity.title)}</strong><span>${escapeHtml(activity.subject)} · Tentativa ${response.attempt_number}${response.graded_at ? ` · Avaliada em ${new Intl.DateTimeFormat('pt-BR').format(new Date(response.graded_at))}` : ' · Sem nota'}</span></div><b>${response.score === null ? 'Sem nota' : `${Number(response.score).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 10`}</b></li>`)).join('')}</ul>` : ''}</div>
					<div><h5>Frequência registrada</h5>${attendanceRecords.length ? `<ul class="teacher-performance-detail-list">${attendanceRecords.map((record) => {
						const room = membershipByClassroom.get(record.classroom_id);
						return `<li><div><strong>${new Intl.DateTimeFormat('pt-BR').format(new Date(`${record.attendance_date}T00:00:00`))}</strong><span>${escapeHtml(room?.name ?? 'Turma')} · ${record.present ? 'Presente' : 'Ausente'}</span></div><b>${record.present ? '✓' : '—'}</b></li>`;
					}).join('')}</ul>` : '<p class="empty-state">Nenhuma frequência registrada.</p>'}</div>
				</div>
			`;
			detail.querySelector<HTMLButtonElement>('[data-close-student-performance]')?.addEventListener('click', () => {
				detailSequence += 1;
				detail.hidden = true;
				detail.innerHTML = '';
				delete detail.dataset.studentId;
			});
			detail.querySelector<HTMLElement>('[data-performance-detail-title]')?.focus();
		} catch (error) {
			if (requestSequence !== detailSequence) return;
			console.error('Não foi possível carregar o desempenho do aluno.', error);
			detail.innerHTML = '<p class="performance-demo-notice" role="alert">Não foi possível carregar o desempenho deste aluno.</p>';
		}
	};

	const searchStudents = async (): Promise<void> => {
		const query = search.value.trim();
		const requestSequence = ++searchSequence;
		detailSequence += 1;
		detail.hidden = true;
		detail.innerHTML = '';
		delete detail.dataset.studentId;
		if (query.length < 2) {
			searchStatus.textContent = 'Digite pelo menos dois caracteres para pesquisar.';
			results.innerHTML = '';
			return;
		}

		searchStatus.textContent = 'Pesquisando alunos...';
		results.innerHTML = '';
		try {
			const studentsResult = await supabase
				.from('profiles')
				.select('id, full_name')
				.eq('role', 'student')
				.ilike('full_name', `%${query}%`)
				.order('full_name')
				.limit(30);
			if (studentsResult.error) throw studentsResult.error;
			if (requestSequence !== searchSequence) return;

			type StudentProfile = { id: string; full_name: string | null };
			const students = (studentsResult.data ?? []) as StudentProfile[];
			if (!students.length) {
				searchStatus.textContent = 'Nenhum aluno encontrado.';
				return;
			}
			searchStatus.textContent = `${students.length} aluno(s) encontrado(s). Selecione um para consultar o desempenho.`;
			results.innerHTML = students.map((student) => `
				<button type="button" class="teacher-performance-result" data-student-id="${escapeHtml(student.id)}" data-student-name="${escapeHtml(student.full_name ?? 'Aluno')}">
					<span class="performance-medal" aria-hidden="true">👤</span><span>${escapeHtml(student.full_name ?? 'Aluno')}</span><span aria-hidden="true">Ver desempenho →</span>
				</button>
			`).join('');
			results.querySelectorAll<HTMLButtonElement>('[data-student-id]').forEach((button) => {
				button.addEventListener('click', () => {
					const studentId = button.dataset.studentId;
					if (studentId) void renderStudentDetail(studentId, button.dataset.studentName ?? 'Aluno');
				});
			});
		} catch (error) {
			if (requestSequence !== searchSequence) return;
			console.error('Não foi possível pesquisar alunos.', error);
			searchStatus.textContent = 'Não foi possível pesquisar alunos. Tente novamente.';
		}
	};

	search.addEventListener('input', () => {
		window.clearTimeout(searchTimeout);
		searchTimeout = window.setTimeout(() => { void searchStudents(); }, 250);
	});
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
					<p>Professores autorizam os alunos que podem acessar cada sala.</p>
				</div>
				<span class="classroom-demo-badge">Salas conectadas</span>
			</header>
			<div class="classroom-demo-notice" data-classroom-status role="status">Carregando suas salas...</div>
			<div class="classroom-layout classroom-room-layout">
				<section class="classroom-call" aria-labelledby="classroom-list-title">
					<div class="classroom-panel-heading">
						<div><h3 id="classroom-list-title">Minhas turmas</h3><p>Salas disponíveis para você.</p></div>
					</div>
					<div data-classroom-list class="classroom-room-list"></div>
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
					<div class="classroom-empty-board-icon" aria-hidden="true">
						<svg viewBox="0 0 48 48" fill="none">
							<rect x="7" y="9" width="34" height="25" rx="5"></rect>
							<path d="M17 40h14M24 34v6M16 19h16M16 25h10"></path>
						</svg>
					</div>
					<p class="section-label">SUA PRÓXIMA AULA</p>
					<h3>Escolha uma sala</h3>
					<p>Selecione uma das suas turmas para ver quem está online e conversar com a classe.</p>
					<span class="classroom-empty-board-hint"><i aria-hidden="true"></i> Suas salas autorizadas aparecem à esquerda</span>
				</section>
			</div>
			<dialog class="classroom-confirm-dialog" data-classroom-confirm aria-labelledby="classroom-confirm-title">
				<div class="classroom-confirm-content">
					<p class="section-label">ENTRAR NA SALA</p>
					<h3 id="classroom-confirm-title">Deseja entrar nesta sala?</h3>
					<p>Você está prestes a entrar em <strong data-confirm-room-name></strong>.</p>
					<div class="classroom-confirm-actions">
						<button type="button" class="classroom-confirm-cancel" data-cancel-classroom-entry>Cancelar</button>
						<button type="button" class="classroom-confirm-enter" data-confirm-classroom-entry>Entrar na sala</button>
					</div>
				</div>
			</dialog>
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
		.select('role, full_name')
		.eq('id', userId)
		.maybeSingle();
	if (profileError) {
		console.error('Não foi possível carregar o perfil do usuário.', profileError);
		status.textContent = 'Não foi possível identificar seu tipo de conta.';
		return;
	}

	let classrooms: Classroom[] = [];
	let students: Array<{ id: string; full_name: string | null }> = [];
	if (profile?.role === 'teacher') {
		const result = await supabase.from('classrooms').select('id, teacher_id, name, subject, access_mode, created_at').eq('teacher_id', userId).order('created_at', { ascending: false });
		if (result.error) throw result.error;
		classrooms = result.data ?? [];
		const studentsResult = await supabase.from('profiles').select('id, full_name').eq('role', 'student').order('full_name');
		if (studentsResult.error) throw studentsResult.error;
		students = studentsResult.data ?? [];
		const createForm = pageContent.querySelector<HTMLFormElement>('[data-classroom-create]');
		if (createForm) createForm.hidden = false;
	} else {
		const memberships = await supabase.from('classroom_members').select('classroom_id').eq('student_id', userId).eq('status', 'approved');
		if (memberships.error) throw memberships.error;
		const ids = (memberships.data ?? []).map((membership: { classroom_id: string }) => membership.classroom_id);
		if (ids.length) {
			const result = await supabase.from('classrooms').select('id, teacher_id, name, subject, access_mode, created_at').in('id', ids).order('created_at', { ascending: false });
			if (result.error) throw result.error;
			classrooms = result.data ?? [];
		}
	}

	status.textContent = classrooms.length ? 'Escolha uma turma para entrar na sala.' : profile?.role === 'teacher' ? 'Você ainda não criou nenhuma sala.' : 'Você ainda não foi autorizado a entrar em uma sala.';
	list.innerHTML = classrooms.length
		? classrooms.map((classroom) => `
			<button type="button" class="classroom-room-option${classroom.id === selectedClassroomId ? ' is-active' : ''}" data-classroom-id="${classroom.id}">
				<span class="classroom-room-icon" aria-hidden="true">
					<svg viewBox="0 0 24 24" fill="none"><path d="M4 7.5A2.5 2.5 0 0 1 6.5 5h11A2.5 2.5 0 0 1 20 7.5v9a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5v-9Z"></path><path d="M8 9h8M8 12h8M8 15h5"></path></svg>
				</span>
				<span class="classroom-room-copy"><strong>${escapeHtml(classroom.name)}</strong><span>${escapeHtml(classroom.subject)}</span></span>
				<span class="classroom-room-status"><i aria-hidden="true"></i> Autorizado</span>
				<span class="classroom-room-arrow" aria-hidden="true">→</span>
			</button>
		`).join('')
		: `<p class="empty-state">${profile?.role === 'teacher' ? 'Você ainda não criou nenhuma sala.' : 'Peça ao professor para autorizar seu acesso à sala.'}</p>`;

	let pendingClassroom: Classroom | null = null;
	const confirmDialog = pageContent.querySelector<HTMLDialogElement>('[data-classroom-confirm]');
	const confirmRoomName = pageContent.querySelector<HTMLElement>('[data-confirm-room-name]');
	const openEntryConfirmation = (classroom: Classroom): void => {
		pendingClassroom = classroom;
		if (!confirmDialog || !confirmRoomName) throw new Error('A confirmação para entrar na sala não foi encontrada.');
		confirmRoomName.textContent = classroom.name;
		confirmDialog.showModal();
	};

	const enterClassroom = async (classroom: Classroom): Promise<void> => {
		if (classroomChannel) {
			await supabase.removeChannel(classroomChannel);
			classroomChannel = null;
		}
		selectedClassroomId = classroom.id;
		sessionStorage.setItem('selected-classroom', classroom.id);

		const memberResult = await supabase
			.from('classroom_members')
			.select('student_id, status, profile:profiles!student_id(full_name)')
			.eq('classroom_id', classroom.id)
			.order('joined_at');
		const messagesResult = await supabase
			.from('classroom_messages')
			.select('id, classroom_id, author_id, body, created_at, author:profiles!author_id(full_name)')
			.eq('classroom_id', classroom.id)
			.order('created_at', { ascending: true })
			.limit(100);
		if (memberResult.error || messagesResult.error) throw memberResult.error ?? messagesResult.error;

		const classroomMembers = (memberResult.data ?? []) as Array<{ student_id: string; status: string; profile: { full_name: string | null } | null }>;
		const approvedMembers = classroomMembers.filter((member) => member.status === 'approved');
		const approvedStudentIds = new Set(approvedMembers.map((member) => member.student_id));
		const availableStudents = students.filter((student) => !approvedStudentIds.has(student.id));
		const isTeacher = profile?.role === 'teacher';
		const fullName = profile?.full_name?.trim() || userData.user.user_metadata.full_name?.trim() || userData.user.email?.split('@')[0] || 'Participante';
		const messages = (messagesResult.data ?? []) as ClassroomMessage[];

		pageContent.innerHTML = `
			<section class="classroom-live" aria-labelledby="classroom-live-title">
				<header class="classroom-live-header">
					<button class="classroom-live-back" type="button" data-classroom-leave aria-label="Sair da sala">← Salas</button>
					<div><p class="section-label">SALA DE AULA AO VIVO</p><h2 id="classroom-live-title">${escapeHtml(classroom.name)}</h2><p>${escapeHtml(classroom.subject)}</p></div>
					<span class="classroom-live-indicator"><i aria-hidden="true"></i> Sala ativa</span>
				</header>
				<div class="classroom-live-layout">
					<section class="classroom-live-stage" aria-labelledby="classroom-participants-title">
						<div class="classroom-live-stage-heading"><div><h3 id="classroom-participants-title">Na sala</h3><p data-classroom-presence-count>Conectando participantes...</p></div></div>
						<div class="classroom-live-participants" data-classroom-presence-list aria-live="polite"></div>
						<p class="classroom-live-note">Esta sala oferece presença e mensagens ao vivo. Áudio e vídeo ainda não estão disponíveis.</p>
						${isTeacher ? `
							<details class="classroom-member-manager classroom-live-settings">
								<summary>Gerenciar acesso e alunos</summary>
								${availableStudents.length ? `<form class="classroom-member-form" data-classroom-member-form><label for="classroom-student-access">Adicionar aluno<select id="classroom-student-access" name="student_id" required><option value="">Selecione um aluno</option>${availableStudents.map((student) => `<option value="${escapeHtml(student.id)}">${escapeHtml(student.full_name ?? 'Aluno')}</option>`).join('')}</select></label><button type="submit">Autorizar</button></form>` : '<p>Todos os alunos cadastrados já estão autorizados.</p>'}
								<ul class="classroom-member-list">${approvedMembers.map((member) => `<li><span>${escapeHtml(member.profile?.full_name ?? 'Aluno')}</span><button type="button" data-revoke-classroom-student="${escapeHtml(member.student_id)}">Remover</button></li>`).join('') || '<li class="empty-state">Nenhum aluno autorizado ainda.</li>'}</ul>
								<p class="classroom-member-status" data-classroom-member-status role="status" aria-live="polite"></p>
							</details>
						` : ''}
					</section>
					<section class="classroom-live-chat" aria-labelledby="classroom-chat-title">
						<div class="classroom-live-chat-heading"><h3 id="classroom-chat-title">Mensagens</h3><span>Ao vivo</span></div>
						<div class="classroom-chat-messages" data-classroom-messages aria-live="polite">${messages.map((message) => `<div class="classroom-message${message.author_id === userId ? ' classroom-message-self' : ''}"><strong>${escapeHtml(message.author?.full_name ?? 'Participante')} <time>${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.created_at))}</time></strong><p>${escapeHtml(message.body)}</p></div>`).join('')}</div>
						<form class="classroom-chat-form classroom-live-chat-form" data-classroom-chat><input name="message" maxlength="300" placeholder="Escreva uma mensagem..." autocomplete="off" required><button type="submit">Enviar</button></form>
					</section>
				</div>
			</section>
		`;

		const participantsList = pageContent.querySelector<HTMLElement>('[data-classroom-presence-list]');
		const participantsCount = pageContent.querySelector<HTMLElement>('[data-classroom-presence-count]');
		const renderParticipants = (): void => {
			if (!classroomChannel || !participantsList || !participantsCount) return;
			const presenceState = classroomChannel.presenceState();
			const onlineParticipants = Object.values(presenceState).flat() as Array<{ user_id?: string; full_name?: string; role?: string }>;
			const uniqueParticipants = [...new Map(onlineParticipants.map((participant) => [participant.user_id, participant])).values()];
			participantsCount.textContent = `${uniqueParticipants.length} participante(s) conectado(s)`;
			participantsList.innerHTML = uniqueParticipants.length
				? uniqueParticipants.map((participant) => {
					const name = participant.full_name || 'Participante';
					const initials = name.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toLocaleUpperCase('pt-BR');
					return `<article class="classroom-live-participant"><span class="classroom-live-avatar">${escapeHtml(initials)}</span><span><strong>${escapeHtml(name)}${participant.user_id === userId ? ' (você)' : ''}</strong><small>${participant.role === 'teacher' ? 'Professor' : 'Aluno'} · Online</small></span><i aria-label="Online"></i></article>`;
				}).join('')
				: '<p class="empty-state">Aguardando participantes.</p>';
		};

		const refreshMessages = async (): Promise<void> => {
			const result = await supabase
				.from('classroom_messages')
				.select('id, classroom_id, author_id, body, created_at, author:profiles!author_id(full_name)')
				.eq('classroom_id', classroom.id)
				.order('created_at', { ascending: true })
				.limit(100);
			if (result.error) {
				console.error('Não foi possível atualizar as mensagens da sala.', result.error);
				return;
			}
			const messagesElement = pageContent?.querySelector<HTMLElement>('[data-classroom-messages]');
			if (!messagesElement || selectedClassroomId !== classroom.id) return;
			const currentMessages = messagesElement.scrollTop + messagesElement.clientHeight >= messagesElement.scrollHeight - 40;
			const loadedMessages = (result.data ?? []) as ClassroomMessage[];
			messagesElement.innerHTML = loadedMessages.map((message) => `<div class="classroom-message${message.author_id === userId ? ' classroom-message-self' : ''}"><strong>${escapeHtml(message.author?.full_name ?? 'Participante')} <time>${new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(message.created_at))}</time></strong><p>${escapeHtml(message.body)}</p></div>`).join('');
			if (currentMessages) messagesElement.scrollTop = messagesElement.scrollHeight;
		};

		const showMemberStatus = (message: string): void => {
			const element = pageContent?.querySelector<HTMLElement>('[data-classroom-member-status]');
			if (element) element.textContent = message;
		};

		pageContent.querySelector<HTMLButtonElement>('[data-classroom-leave]')?.addEventListener('click', async () => {
			if (classroomChannel) {
				await supabase.removeChannel(classroomChannel);
				classroomChannel = null;
			}
			selectedClassroomId = null;
			sessionStorage.removeItem('selected-classroom');
			await renderClassroom();
		});
		pageContent.querySelector<HTMLFormElement>('[data-classroom-chat]')?.addEventListener('submit', async (event) => {
			event.preventDefault();
			const form = event.currentTarget;
			if (!(form instanceof HTMLFormElement)) return;
			const input = form.elements.namedItem('message');
			const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
			if (!(input instanceof HTMLInputElement) || !input.value.trim() || !button) return;
			button.disabled = true;
			const result = await supabase.from('classroom_messages').insert({ classroom_id: classroom.id, author_id: userId, body: input.value.trim() });
			if (result.error) {
				console.error('Não foi possível enviar a mensagem.', result.error);
				button.disabled = false;
				return;
			}
			input.value = '';
			await refreshMessages();
			button.disabled = false;
			input.focus();
		});
		pageContent.querySelector<HTMLFormElement>('[data-classroom-member-form]')?.addEventListener('submit', async (event) => {
			event.preventDefault();
			const form = event.currentTarget;
			if (!(form instanceof HTMLFormElement)) return;
			const studentId = String(new FormData(form).get('student_id') ?? '');
			if (!studentId) return;
			const result = await supabase.rpc('set_classroom_member', { target_classroom_id: classroom.id, target_student_id: studentId, new_status: 'approved' });
			if (result.error) {
				console.error('Não foi possível autorizar o aluno na sala.', result.error);
				showMemberStatus('Não foi possível autorizar o aluno.');
				return;
			}
			await enterClassroom(classroom);
		});
		pageContent.querySelectorAll<HTMLButtonElement>('[data-revoke-classroom-student]').forEach((button) => {
			button.addEventListener('click', async () => {
				const studentId = button.dataset.revokeClassroomStudent;
				if (!studentId) return;
				button.disabled = true;
				const result = await supabase.rpc('set_classroom_member', { target_classroom_id: classroom.id, target_student_id: studentId, new_status: 'denied' });
				if (result.error) {
					console.error('Não foi possível remover o acesso do aluno.', result.error);
					showMemberStatus('Não foi possível remover o acesso do aluno.');
					button.disabled = false;
					return;
				}
				await enterClassroom(classroom);
			});
		});

		classroomChannel = supabase.channel(`classroom-${classroom.id}`, { config: { presence: { key: userId } } })
			.on('presence', { event: 'sync' }, renderParticipants)
			.on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'classroom_messages', filter: `classroom_id=eq.${classroom.id}` }, () => { void refreshMessages(); })
			.subscribe(async (channelStatus: string) => {
				if (channelStatus === 'SUBSCRIBED' && classroomChannel) {
					const trackResult = await classroomChannel.track({ user_id: userId, full_name: fullName, role: profile?.role === 'teacher' ? 'teacher' : 'student' });
					if (trackResult !== 'ok') {
						console.error('Não foi possível publicar sua presença na sala.', trackResult);
						if (participantsCount) participantsCount.textContent = 'Não foi possível publicar sua presença.';
					}
					return;
				}
				if (channelStatus === 'CHANNEL_ERROR' || channelStatus === 'TIMED_OUT') {
					console.error('Não foi possível conectar aos recursos ao vivo da sala.', channelStatus);
					if (participantsCount) participantsCount.textContent = 'Falha ao conectar. Recarregue a sala para tentar novamente.';
				}
			});
	};

	pageContent.querySelector<HTMLButtonElement>('[data-cancel-classroom-entry]')?.addEventListener('click', () => {
		confirmDialog?.close();
		pendingClassroom = null;
	});
	pageContent.querySelector<HTMLButtonElement>('[data-confirm-classroom-entry]')?.addEventListener('click', async (event) => {
		const button = event.currentTarget;
		if (!(button instanceof HTMLButtonElement) || !pendingClassroom) return;
		const classroom = pendingClassroom;
		button.disabled = true;
		try {
			confirmDialog?.close();
			pendingClassroom = null;
			await enterClassroom(classroom);
		} catch (error) {
			console.error('Não foi possível entrar na sala.', error);
			status.textContent = 'Não foi possível entrar na sala. Verifique sua autorização e tente novamente.';
		} finally {
			button.disabled = false;
		}
	});
	pageContent.querySelectorAll<HTMLButtonElement>('[data-classroom-id]').forEach((button) => {
		button.addEventListener('click', () => {
			const classroom = classrooms.find((item) => item.id === button.dataset.classroomId);
			if (classroom) openEntryConfirmation(classroom);
		});
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
			access_mode: 'restricted',
		}).select().single();
		if (result.error) {
			console.error('Não foi possível criar a sala.', result.error);
			status.textContent = 'Não foi possível criar a sala.';
			return;
		}
		form.reset();
		await renderClassroom();
	});
}

function isSubjectFilter(value: string | undefined): value is SubjectFilter {
	return value !== undefined && categories.some((category) => category === value);
}

function isContentTypeFilter(value: string): value is ContentTypeFilter {
	return value === 'Todos' || value === 'material' || value === 'summary' || value === 'activity';
}

function updateSubjectCategories(): void {
	const uniqueSubjects = new Map<string, string>();
	for (const subject of publishedContents.map((content) => content.subject)) {
		const trimmedSubject = subject.trim();
		if (trimmedSubject && !uniqueSubjects.has(trimmedSubject.toLocaleLowerCase('pt-BR'))) {
			uniqueSubjects.set(trimmedSubject.toLocaleLowerCase('pt-BR'), trimmedSubject);
		}
	}
	categories = ['Todos', ...Array.from(uniqueSubjects.values()).sort((a, b) => a.localeCompare(b, 'pt-BR'))];
	if (!categories.includes(activeCategory)) activeCategory = 'Todos';

	const picker = pageContent?.querySelector<HTMLElement>('[data-filter-picker="subject"]');
	if (!picker) return;
	const optionsPanel = picker.querySelector<HTMLElement>('[data-filter-options] .subject-options-panel');
	const selectedLabel = picker.querySelector<HTMLElement>('[data-selected-filter]');
	if (!optionsPanel || !selectedLabel) return;
	selectedLabel.textContent = activeCategory === 'Todos' ? 'Todas as disciplinas' : activeCategory;
	optionsPanel.innerHTML = categories.map((value) => `
		<button class="subject-option" type="button" data-filter-option="subject" data-filter-value="${escapeHtml(value)}" aria-pressed="${value === activeCategory}">
			<span>${value === 'Todos' ? 'Todas as disciplinas' : escapeHtml(value)}</span>
			<span class="subject-check" aria-hidden="true">&#10003;</span>
		</button>
	`).join('');
}

function getContentTypeLabel(contentType: 'material' | ContentType): string {
	switch (contentType) {
		case 'summary': return 'Resumo';
		case 'activity': return 'Atividade';
		default: return 'Outro material';
	}
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
		const responseStatus = currentUserRole === 'student' && content.content_type === 'activity'
			? !studentActivityStatusesLoaded
				? '<span class="activity-response-badge activity-response-badge-unavailable">Status indisponível</span>'
				: studentAnsweredActivityIds.has(content.id)
				? '<span class="activity-response-badge activity-response-badge-answered">Respondida</span>'
				: '<span class="activity-response-badge activity-response-badge-pending">Não respondida</span>'
			: '';
		return `
			<article class="material-card ${visual.cardClass}">
				<div class="material-card-art" aria-hidden="true"><span>${visual.icon}</span></div>
				<div class="material-card-meta"><span class="material-subject">${escapeHtml(content.subject)}</span><span class="material-format">${getContentTypeLabel(content.content_type)}</span>${responseStatus}</div>
				<h3>${escapeHtml(content.title)}</h3>
				${content.description ? `<p class="material-card-description">${escapeHtml(content.description)}</p>` : content.activity_questions?.length ? `<p class="material-card-description">${content.activity_questions.length} questão(ões) · ${content.activity_questions.filter((question) => question.type === 'objective').length} objetiva(s) e ${content.activity_questions.filter((question) => question.type === 'subjective').length} subjetiva(s)</p>` : ''}
				${content.relatedContents?.length ? `<div class="material-related-content"><span>Conteúdo relacionado</span>${content.relatedContents.map((related) => `<button type="button" data-related-published-id="${escapeHtml(related.id)}"><span>${escapeHtml(getContentTypeLabel(related.content_type))}</span>${escapeHtml(related.title)}</button>`).join('')}</div>` : ''}
				<div class="material-card-actions">
					<button class="material-details-button" type="button" data-published-content-id="${escapeHtml(content.id)}">Ver detalhes <span aria-hidden="true">→</span></button>
					${currentUserRole === 'teacher' && content.content_type === 'activity' ? `<button class="material-details-button" type="button" data-activity-responses-id="${escapeHtml(content.id)}">Ver respostas</button>` : ''}
					${currentUserRole === 'teacher' ? `<button class="material-delete-button" type="button" data-delete-published-content-id="${escapeHtml(content.id)}">Excluir</button>` : ''}
				</div>
			</article>
		`;
	}).join('');
}

function attachContentDetails(): void {
	if (!pageContent) return;
	pageContent.querySelectorAll<HTMLButtonElement>('[data-related-published-id]').forEach((button) => {
		button.addEventListener('click', () => {
			const content = publishedContents.find((item) => item.id === button.dataset.relatedPublishedId);
			if (content) showContentDetails(content.title, content.subject, content.description ?? '', content.attachment_url, content.attachment_name, content.activity_questions, content.id);
		});
	});
	pageContent.querySelectorAll<HTMLButtonElement>('[data-published-content-id]').forEach((button) => {
		button.addEventListener('click', () => {
			const content = publishedContents.find((item) => item.id === button.dataset.publishedContentId);
			if (content) showContentDetails(content.title, content.subject, content.description ?? '', content.attachment_url, content.attachment_name, content.activity_questions, content.id);
		});
	});
	pageContent.querySelectorAll<HTMLButtonElement>('[data-activity-responses-id]').forEach((button) => {
		button.addEventListener('click', () => {
			const content = publishedContents.find((item) => item.id === button.dataset.activityResponsesId);
			if (content?.content_type === 'activity') void showActivityResponses(content);
		});
	});
	pageContent.querySelectorAll<HTMLButtonElement>('[data-delete-published-content-id]').forEach((button) => {
		button.addEventListener('click', () => {
			const content = publishedContents.find((item) => item.id === button.dataset.deletePublishedContentId);
			if (!content || currentUserRole !== 'teacher' || !currentUserId) return;
			openMaterialDeletionConfirmation(content.id, content.title);
		});
	});
}

function openMaterialDeletionConfirmation(id: string, title: string): void {
	const dialog = pageContent?.querySelector<HTMLDialogElement>('[data-material-delete-dialog]');
	const name = dialog?.querySelector<HTMLElement>('[data-delete-material-name]');
	const status = pageContent?.querySelector<HTMLElement>('[data-content-action-status]');
	if (!dialog || !name) throw new Error('A confirmação para excluir o conteúdo não foi encontrada.');
	dialog.dataset.contentId = id;
	name.textContent = title;
	if (status) status.textContent = '';
	dialog.showModal();
}

function attachMaterialDeletionDialog(): void {
	const dialog = pageContent?.querySelector<HTMLDialogElement>('[data-material-delete-dialog]');
	const form = dialog?.querySelector<HTMLFormElement>('[data-material-delete-form]');
	const confirmButton = form?.querySelector<HTMLButtonElement>('[data-confirm-material-delete]');
	if (!dialog || !form || !confirmButton) return;

	dialog.querySelector<HTMLButtonElement>('[data-cancel-material-delete]')?.addEventListener('click', () => dialog.close());
	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (currentUserRole !== 'teacher' || !currentUserId) return;
		const contentId = dialog.dataset.contentId;
		const status = pageContent?.querySelector<HTMLElement>('[data-content-action-status]');
		if (!contentId) {
			if (status) status.textContent = 'Não foi possível identificar o conteúdo selecionado.';
			return;
		}

		confirmButton.disabled = true;
		try {
			const content = publishedContents.find((item) => item.id === contentId);
			if (!content) {
				if (status) status.textContent = 'Este conteúdo não está mais disponível.';
				dialog.close();
				return;
			}
			const result = await supabase
				.from('teacher_contents')
				.delete()
				.eq('id', content.id)
				.select('id')
				.maybeSingle();
			if (result.error) {
				console.error('Não foi possível excluir o conteúdo.', result.error);
				if (status) status.textContent = 'Não foi possível excluir o conteúdo.';
				return;
			}
			if (!result.data) {
				if (status) status.textContent = 'O conteúdo não existe mais ou você não tem permissão para excluí-lo.';
				return;
			}

			let attachmentCleanupFailed = false;
			const storagePaths: string[] = [];
			if (content.attachment_url) {
				const storagePath = getTeacherAttachmentStoragePath(content.attachment_url);
				if (!storagePath) {
					attachmentCleanupFailed = true;
					console.error('O conteúdo foi excluído, mas não foi possível identificar o caminho do arquivo anexado.');
				} else storagePaths.push(storagePath);
			}
			for (const question of content.activity_questions ?? []) {
				if (!question.image_url) continue;
				const imagePath = getTeacherAttachmentStoragePath(question.image_url);
				if (!imagePath) {
					attachmentCleanupFailed = true;
					console.error('O conteúdo foi excluído, mas não foi possível identificar o caminho de uma imagem de questão.');
				} else storagePaths.push(imagePath);
			}
			if (storagePaths.length) {
				const removal = await supabase.storage.from('teacher-contents').remove([...new Set(storagePaths)]);
				if (removal.error) {
					attachmentCleanupFailed = true;
					console.error('O conteúdo foi excluído, mas um ou mais arquivos anexados não puderam ser removidos.', removal.error);
				}
			}

			dialog.close();
			await renderMaterials();
			const refreshedStatus = pageContent?.querySelector<HTMLElement>('[data-content-action-status]');
			if (refreshedStatus) refreshedStatus.textContent = attachmentCleanupFailed
				? 'Conteúdo excluído, mas não foi possível remover todos os arquivos anexados.'
				: 'Conteúdo excluído com sucesso.';
		} catch (error) {
			console.error('Erro ao excluir conteúdo.', error);
			if (status) status.textContent = 'Ocorreu um erro ao excluir o conteúdo.';
		} finally {
			confirmButton.disabled = false;
		}
	});
}

function getTeacherAttachmentStoragePath(attachmentUrl: string): string | null {
	try {
		const pathname = new URL(attachmentUrl).pathname;
		const bucketPrefix = '/storage/v1/object/public/teacher-contents/';
		const bucketIndex = pathname.indexOf(bucketPrefix);
		if (bucketIndex < 0) return null;
		return decodeURIComponent(pathname.slice(bucketIndex + bucketPrefix.length));
	} catch {
		return null;
	}
}

function showContentDetails(
	title: string,
	subject: string,
	description: string,
	attachmentUrl: string | null,
	attachmentName: string | null,
	activityQuestions: ActivityQuestion[] | null = null,
	activityId: string | null = null,
): void {
	const modal = document.createElement('dialog');
	modal.className = 'content-modal';
	modal.setAttribute('aria-labelledby', 'content-details-title');
	const studentCanAnswer = currentUserRole === 'student' && Boolean(activityId) && Boolean(activityQuestions?.length);
	const activityMarkup = activityQuestions?.length ? `
		${studentCanAnswer ? `<form class="content-details-activity" data-activity-answer-form><h4>Responda à atividade</h4>` : '<section class="content-details-activity" aria-label="Questões da atividade"><h4>Questões</h4>'}
			${activityQuestions.map((question, index) => `
				<article class="content-details-question">
					<h5>Questão ${index + 1} · ${question.type === 'objective' ? 'Objetiva' : 'Subjetiva'}</h5>
					${question.image_url ? `<img class="activity-question-image" src="${escapeHtml(question.image_url)}" alt="Imagem da questão ${index + 1}" loading="lazy">` : ''}
					${question.type === 'objective' ? `
						<p>${escapeHtml(question.prompt)}</p>
						${studentCanAnswer
							? `<fieldset class="activity-answer-options"><legend>Selecione uma alternativa</legend>${question.options.map((option, optionIndex) => `<label><input type="radio" name="${escapeHtml(question.id)}" value="${optionIndex}" required><span>${getAlphabeticLabel(optionIndex, true)}.</span><span class="activity-answer-option-text">${escapeHtml(option)}</span></label>`).join('')}</fieldset>`
							: `<ol type="A">${question.options.map((option) => `<li>${escapeHtml(option)}</li>`).join('')}</ol>`}
					` : `
						<p>${escapeHtml(question.prompt)}</p>
						<ol type="a">${question.subquestions.map((subquestion, subquestionIndex) => `<li>${escapeHtml(subquestion)}${studentCanAnswer ? `<textarea name="${escapeHtml(question.id)}.${subquestionIndex}" rows="3" placeholder="Digite sua resposta para o item ${getAlphabeticLabel(subquestionIndex)})" required></textarea>` : ''}</li>`).join('')}</ol>
					`}
					${studentCanAnswer ? `<p class="activity-grade-feedback" data-question-feedback="${escapeHtml(question.id)}" hidden></p>` : ''}
				</article>
			`).join('')}
			${studentCanAnswer ? '<p class="activity-answer-status" data-activity-answer-status role="status" aria-live="polite"></p><button class="activity-answer-submit" type="submit">Enviar respostas</button><button class="activity-answer-submit" type="button" data-request-activity-retry hidden>Solicitar nova tentativa</button></form>' : '</section>'}
	` : '';
	modal.innerHTML = `<article class="content-details"><div class="content-modal-heading"><div class="content-details-heading-copy"><p class="section-label">${escapeHtml(subject)}</p><h3 id="content-details-title">${escapeHtml(title)}</h3></div><button type="button" class="modal-close" aria-label="Fechar">×</button></div>${description ? `<div class="content-details-body">${escapeHtml(description).replace(/\n/g, '<br>')}</div>` : ''}${activityMarkup}${attachmentUrl ? `<a class="home-primary-link content-details-attachment" href="${escapeHtml(attachmentUrl)}" target="_blank" rel="noopener noreferrer" download><span aria-hidden="true">↓</span><span>${escapeHtml(attachmentName ?? 'Baixar arquivo')}</span></a>` : ''}</article>`;
	document.body.append(modal);
	modal.querySelector<HTMLButtonElement>('.modal-close')?.addEventListener('click', () => modal.close());
	modal.addEventListener('close', () => modal.remove(), { once: true });
	modal.showModal();

	if (studentCanAnswer && activityId && activityQuestions) {
		const answerForm = modal.querySelector<HTMLFormElement>('[data-activity-answer-form]');
		const submitButton = answerForm?.querySelector<HTMLButtonElement>('[type="submit"]');
		const status = answerForm?.querySelector<HTMLElement>('[data-activity-answer-status]');
		const retryRequestButton = answerForm?.querySelector<HTMLButtonElement>('[data-request-activity-retry]');
		if (!answerForm || !submitButton || !status || !retryRequestButton || !currentUserId) return;

		submitButton.disabled = true;
		status.textContent = 'Carregando tentativas anteriores...';
		void (async () => {
			try {
				const { data, error } = await supabase.from('activity_responses')
					.select('answers, attempt_number, score, grade_details, retry_status')
					.eq('activity_id', activityId)
					.eq('student_id', currentUserId)
					.order('attempt_number', { ascending: false })
					.limit(1)
					.maybeSingle();
				if (error) {
					console.error('Não foi possível carregar sua resposta salva.', error);
					status.textContent = 'Não foi possível carregar uma resposta anterior. Você ainda pode responder e enviar novamente.';
				} else if (data) {
					const previousAttempt = data as { answers: unknown; attempt_number: number; score: number | null; grade_details: unknown; retry_status: 'not_requested' | 'pending' | 'approved' | 'denied' };
					if (previousAttempt.retry_status === 'approved') {
						answerForm.querySelector('h4')!.textContent = `Nova tentativa autorizada · Tentativa ${previousAttempt.attempt_number + 1}`;
						status.textContent = 'O professor autorizou uma nova tentativa. Suas respostas e a correção anteriores não serão exibidas.';
					} else {
						const answers = normalizeActivityAnswers(previousAttempt.answers);
						const gradeDetails = normalizeActivityGradeDetails(previousAttempt.grade_details);
						for (const question of activityQuestions) {
							const answer = answers[question.id];
							if (question.type === 'objective' && typeof answer === 'string') {
								const input = answerForm.querySelector<HTMLInputElement>(`input[name="${CSS.escape(question.id)}"][value="${CSS.escape(answer)}"]`);
								if (input) input.checked = true;
							} else if (question.type === 'subjective' && Array.isArray(answer)) {
								answer.forEach((value, index) => {
									const input = answerForm.querySelector<HTMLTextAreaElement>(`textarea[name="${CSS.escape(question.id)}.${index}"]`);
									if (input) input.value = value;
								});
							}
							const questionGrade = gradeDetails.questions[question.id];
							const feedback = answerForm.querySelector<HTMLElement>(`[data-question-feedback="${CSS.escape(question.id)}"]`);
							if (feedback && (questionGrade?.explanation || (question.type === 'objective' && questionGrade?.correct_option !== null && questionGrade?.correct_option !== undefined))) {
								const correctOption = questionGrade?.correct_option;
								const answerKey = question.type === 'objective' && correctOption !== null && correctOption !== undefined && question.options[correctOption] !== undefined
									? `Gabarito: ${getAlphabeticLabel(correctOption, true)}. ${question.options[correctOption]}`
									: '';
								feedback.textContent = [answerKey, questionGrade?.explanation].filter(Boolean).join(' · ');
								feedback.hidden = false;
							}
						}
						answerForm.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[type="radio"], textarea').forEach((input) => {
							input.disabled = true;
						});
						submitButton.hidden = true;
						answerForm.querySelector('h4')!.textContent = `Suas respostas · Tentativa ${previousAttempt.attempt_number}`;
						if (previousAttempt.retry_status === 'pending') {
							status.textContent = 'Sua solicitação para refazer a atividade está aguardando o professor.';
							retryRequestButton.textContent = 'Aguardando autorização';
							retryRequestButton.disabled = true;
							retryRequestButton.hidden = false;
						} else if (previousAttempt.score === null) {
							status.textContent = 'Sua resposta foi enviada e está aguardando a avaliação do professor.';
						} else {
							status.textContent = `Nota recebida: ${Number(previousAttempt.score).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 10. ${previousAttempt.retry_status === 'denied' ? 'O pedido anterior foi recusado; você pode solicitar novamente.' : 'Você pode solicitar uma nova tentativa ao professor.'}`;
							retryRequestButton.textContent = 'Solicitar nova tentativa';
							retryRequestButton.disabled = false;
							retryRequestButton.hidden = false;
						}
					}
				} else {
					status.textContent = 'Responda a todas as questões para enviar.';
				}
			} catch (error) {
				console.error('Erro ao carregar resposta salva.', error);
				status.textContent = 'Não foi possível carregar uma resposta anterior. Você ainda pode responder e enviar novamente.';
			} finally {
				submitButton.disabled = false;
			}
		})();

		retryRequestButton.addEventListener('click', async () => {
			retryRequestButton.disabled = true;
			status.textContent = 'Enviando solicitação ao professor...';
			try {
				const result = await supabase.rpc('request_activity_retry', { target_activity_id: activityId });
				if (result.error) throw result.error;
				retryRequestButton.textContent = 'Aguardando autorização';
				status.textContent = 'Solicitação enviada. Você poderá refazer a atividade se o professor autorizar.';
			} catch (error) {
				console.error('Não foi possível solicitar uma nova tentativa.', error);
				retryRequestButton.disabled = false;
				status.textContent = error instanceof Error ? error.message : 'Não foi possível enviar a solicitação.';
			}
		});

		answerForm.addEventListener('submit', async (event) => {
			event.preventDefault();
			if (!answerForm.reportValidity()) return;
			submitButton.disabled = true;
			status.textContent = 'Enviando suas respostas...';
			try {
				const formData = new FormData(answerForm);
				const answers: ActivityAnswers = {};
				for (const question of activityQuestions) {
					answers[question.id] = question.type === 'objective'
						? String(formData.get(question.id) ?? '')
						: question.subquestions.map((_, index) => String(formData.get(`${question.id}.${index}`) ?? '').trim());
				}
				const result = await supabase.rpc('submit_activity_response', {
					target_activity_id: activityId,
					response_answers: answers,
				});
				if (result.error) {
					console.error('Não foi possível enviar as respostas da atividade.', result.error);
					status.textContent = `Não foi possível salvar suas respostas: ${result.error.message}`;
					return;
				}
				const attemptNumber = Number(result.data);
				if (!Number.isInteger(attemptNumber) || attemptNumber < 1) throw new Error('O banco não confirmou o número da tentativa.');
				studentAnsweredActivityIds.add(activityId);
				updateActivityResponseBadge(activityId);
				modal.close();
				showActivitySubmittedConfirmation(attemptNumber);
			} catch (error) {
				console.error('Erro ao enviar as respostas da atividade.', error);
				status.textContent = error instanceof Error
					? `Ocorreu um erro ao enviar suas respostas: ${error.message}`
					: 'Ocorreu um erro ao enviar suas respostas. Tente novamente.';
			} finally {
				submitButton.disabled = false;
			}
		});
	}
}

function normalizeActivityAnswers(value: unknown): ActivityAnswers {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const answers: ActivityAnswers = {};
	for (const [questionId, answer] of Object.entries(value)) {
		if (typeof answer === 'string') answers[questionId] = answer;
		else if (Array.isArray(answer) && answer.every((item): item is string => typeof item === 'string')) answers[questionId] = answer;
	}
	return answers;
}

function normalizeActivityGradeDetails(value: unknown): ActivityGradeDetails {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return { questions: {} };
	const rawQuestions = (value as { questions?: unknown }).questions;
	if (!rawQuestions || typeof rawQuestions !== 'object' || Array.isArray(rawQuestions)) return { questions: {} };
	const questions: ActivityGradeDetails['questions'] = {};
	for (const [questionId, rawGrade] of Object.entries(rawQuestions)) {
		if (!rawGrade || typeof rawGrade !== 'object' || Array.isArray(rawGrade)) continue;
		const grade = rawGrade as { correct_option?: unknown; subquestion_scores?: unknown; explanation?: unknown };
		questions[questionId] = {
			correct_option: typeof grade.correct_option === 'number' && Number.isInteger(grade.correct_option) ? grade.correct_option : null,
			subquestion_scores: Array.isArray(grade.subquestion_scores)
				? grade.subquestion_scores.filter((score): score is number => typeof score === 'number' && Number.isFinite(score))
				: [],
			explanation: typeof grade.explanation === 'string' ? grade.explanation : '',
		};
	}
	return { questions };
}

function updateActivityResponseBadge(activityId: string): void {
	const button = pageContent?.querySelector<HTMLButtonElement>(`[data-published-content-id="${CSS.escape(activityId)}"]`);
	const meta = button?.closest('.material-card')?.querySelector<HTMLElement>('.material-card-meta');
	if (!meta) return;
	let badge = meta.querySelector<HTMLElement>('.activity-response-badge');
	if (!badge) {
		badge = document.createElement('span');
		meta.append(badge);
	}
	badge.className = 'activity-response-badge activity-response-badge-answered';
	badge.textContent = 'Respondida';
}

function showActivitySubmittedConfirmation(attemptNumber: number): void {
	const modal = document.createElement('dialog');
	modal.className = 'content-modal';
	modal.setAttribute('aria-labelledby', 'activity-submitted-title');
	modal.innerHTML = `<section class="content-details activity-submitted-confirmation"><div class="content-modal-heading"><div class="content-details-heading-copy"><p class="section-label">ATIVIDADE ENVIADA</p><h3 id="activity-submitted-title">Resposta enviada!</h3></div><button type="button" class="modal-close" aria-label="Fechar">×</button></div><p>Sua tentativa ${attemptNumber} foi respondida e enviada para o professor.</p><button type="button" class="activity-answer-submit" data-close-submission-confirmation>Fechar</button></section>`;
	document.body.append(modal);
	const close = (): void => modal.close();
	modal.querySelector<HTMLButtonElement>('.modal-close')?.addEventListener('click', close);
	modal.querySelector<HTMLButtonElement>('[data-close-submission-confirmation]')?.addEventListener('click', close);
	modal.addEventListener('close', () => modal.remove(), { once: true });
	modal.showModal();
}

async function showActivityResponses(activity: PublishedContent): Promise<void> {
	if (currentUserRole !== 'teacher' || activity.content_type !== 'activity') return;
	const modal = document.createElement('dialog');
	modal.className = 'content-modal';
	modal.setAttribute('aria-labelledby', 'activity-responses-title');
	modal.innerHTML = `<section class="content-details"><div class="content-modal-heading"><div class="content-details-heading-copy"><p class="section-label">${escapeHtml(activity.subject)}</p><h3 id="activity-responses-title">Respostas: ${escapeHtml(activity.title)}</h3></div><button type="button" class="modal-close" aria-label="Fechar">×</button></div><p class="activity-responses-status" data-activity-responses-status role="status" aria-live="polite">Carregando respostas...</p><div class="activity-responses-filters" data-activity-responses-filters hidden><label>Aluno<select data-response-student aria-label="Selecionar aluno"></select></label><label>Tentativa<select data-response-attempt aria-label="Selecionar tentativa"></select></label></div><div class="activity-responses-list" data-activity-responses-list></div></section>`;
	document.body.append(modal);
	modal.querySelector<HTMLButtonElement>('.modal-close')?.addEventListener('click', () => modal.close());
	modal.addEventListener('close', () => modal.remove(), { once: true });
	modal.showModal();

	const status = modal.querySelector<HTMLElement>('[data-activity-responses-status]');
	const list = modal.querySelector<HTMLElement>('[data-activity-responses-list]');
	const filters = modal.querySelector<HTMLElement>('[data-activity-responses-filters]');
	const studentSelect = modal.querySelector<HTMLSelectElement>('[data-response-student]');
	const attemptSelect = modal.querySelector<HTMLSelectElement>('[data-response-attempt]');
	if (!status || !list || !filters || !studentSelect || !attemptSelect) throw new Error('A interface de respostas da atividade está incompleta.');
	let responses: ActivityResponse[];
	let activityAnswerKeys = new Map<string, ActivityAnswerKey>();
	try {
		const [result, answerKeysResult] = await Promise.all([
			supabase.from('activity_responses')
				.select('student_id, answers, submitted_at, attempt_number, score, grade_details, graded_at, retry_status')
				.eq('activity_id', activity.id)
				.order('submitted_at', { ascending: false })
				.order('attempt_number', { ascending: false }),
			supabase.from('activity_answer_keys').select('question_id, correct_option, weight, subquestion_weights').eq('activity_id', activity.id),
		]);
		if (result.error) throw result.error;
		if (answerKeysResult.error) throw answerKeysResult.error;
		activityAnswerKeys = new Map(((answerKeysResult.data ?? []) as Array<{ question_id: string; correct_option: number | null; weight: number; subquestion_weights: number[] }>).map((answerKey) => [
			answerKey.question_id,
			{
				correct_option: answerKey.correct_option,
				weight: Number.isFinite(Number(answerKey.weight)) ? Number(answerKey.weight) : 1,
				subquestion_weights: Array.isArray(answerKey.subquestion_weights) ? answerKey.subquestion_weights.map(Number) : [],
			},
		]));
		const responseRows = (result.data ?? []) as Array<{ student_id: string; answers: unknown; submitted_at: string; attempt_number: number; score: number | null; grade_details: unknown; graded_at: string | null; retry_status: ActivityResponse['retry_status'] }>;
		const studentIds = [...new Set(responseRows.map((response) => response.student_id))];
		const profilesResult = studentIds.length
			? await supabase.from('profiles').select('id, full_name').in('id', studentIds)
			: { data: [], error: null };
		if (profilesResult.error) throw profilesResult.error;
		const profileRows = (profilesResult.data ?? []) as Array<{ id: string; full_name: string | null }>;
		const profilesById = new Map(profileRows.map((profile) => [profile.id, profile.full_name]));
		responses = responseRows.map((response) => ({
			...response,
			answers: normalizeActivityAnswers(response.answers),
			grade_details: normalizeActivityGradeDetails(response.grade_details),
			profile: { full_name: profilesById.get(response.student_id) ?? null },
		}));
	} catch (error) {
		console.error('Não foi possível carregar as respostas da atividade.', error);
		status.textContent = `Não foi possível carregar as respostas: ${error instanceof Error ? error.message : 'erro desconhecido'}. Confira se a atualização SQL foi aplicada.`;
		return;
	}

	if (!responses.length) {
		status.textContent = 'Nenhum aluno respondeu a esta atividade ainda.';
		list.innerHTML = '';
		return;
	}

	const students = new Map<string, string>();
	for (const response of responses) {
		if (!students.has(response.student_id)) {
			students.set(response.student_id, response.profile?.full_name?.trim() || 'Aluno');
		}
	}
	studentSelect.innerHTML = [...students.entries()]
		.sort((left, right) => left[1].localeCompare(right[1], 'pt-BR'))
		.map(([studentId, fullName]) => `<option value="${escapeHtml(studentId)}">${escapeHtml(fullName)}</option>`)
		.join('');
	filters.hidden = false;

	const renderSelectedAttempt = (): void => {
		const selectedResponse = responses.find((response) =>
			response.student_id === studentSelect.value && response.attempt_number === Number(attemptSelect.value),
		);
		if (!selectedResponse) {
			list.innerHTML = '';
			status.textContent = 'Selecione uma tentativa para visualizar as respostas.';
			return;
		}
		status.textContent = `${students.get(selectedResponse.student_id) ?? 'Aluno'} · Tentativa ${selectedResponse.attempt_number} · ${formatDateTime(selectedResponse.submitted_at)}${selectedResponse.score === null ? ' · Aguardando nota' : ` · Nota ${Number(selectedResponse.score).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/10`}`;
		list.innerHTML = `
			<article class="activity-student-response">
				${selectedResponse.retry_status === 'pending' ? `<section class="activity-retry-request" aria-label="Pedido de nova tentativa"><p>O aluno solicitou autorização para refazer a atividade.</p><div><button type="button" class="activity-retry-approve" data-retry-decision="approve">Permitir nova tentativa</button><button type="button" class="activity-retry-deny" data-retry-decision="deny">Recusar solicitação</button></div></section>` : ''}
				<form class="activity-grade-form" data-activity-grade-form>
					<p class="activity-grade-instructions">O gabarito e os pesos são definidos ao publicar a atividade. Em cada item subjetivo, informe de 0 a 10 pontos. A nota de cada questão subjetiva é a média ponderada dos itens e a nota final é a média ponderada das questões.</p>
					${(activity.activity_questions ?? []).map((question, index) => {
						const answer = selectedResponse.answers[question.id];
						const selectedOption = typeof answer === 'string' && answer.trim() !== '' && Number.isInteger(Number(answer)) ? Number(answer) : -1;
						const savedGrade = selectedResponse.grade_details.questions[question.id];
						const answerKey = activityAnswerKeys.get(question.id);
						const correctOption = answerKey?.correct_option ?? savedGrade?.correct_option ?? null;
						const explanation = savedGrade?.explanation ?? '';
						const content = question.type === 'objective'
							? `<ol type="A" class="activity-response-options-list">${question.options.map((option, optionIndex) => `<li class="${selectedOption === optionIndex ? 'activity-response-option-selected' : ''}${correctOption === optionIndex ? ' activity-response-option-correct' : ''}"><span>${escapeHtml(option)}</span>${selectedOption === optionIndex ? '<strong>Resposta do aluno</strong>' : ''}${correctOption === optionIndex ? '<strong>Gabarito</strong>' : ''}</li>`).join('')}</ol>${selectedOption < 0 || question.options[selectedOption] === undefined ? '<p class="activity-response-no-answer">Sem resposta</p>' : ''}`
							: question.subquestions.map((subquestion, subquestionIndex) => {
								const subanswer = Array.isArray(answer) ? answer[subquestionIndex] : '';
								const savedPoints = savedGrade?.subquestion_scores[subquestionIndex];
								return `<li>${escapeHtml(getAlphabeticLabel(subquestionIndex))}) ${escapeHtml(subquestion)}<p>${escapeHtml(subanswer || 'Sem resposta')}</p><label class="activity-grade-field">Nota deste item (0 a 10)<input type="number" name="points-${escapeHtml(question.id)}-${subquestionIndex}" min="0" max="10" step="0.1" value="${savedPoints === undefined ? '' : savedPoints}" required></label></li>`;
							}).join('');
						const objectiveGradeControl = question.type === 'subjective'
							? '<p class="activity-grade-field-hint">A nota dos itens subjetivos é atribuída individualmente acima.</p>'
							: correctOption === null
								? '<p class="activity-response-no-answer">Esta atividade não tem gabarito salvo. Confira se foi publicada corretamente.</p>'
								: '';
						return `<section class="activity-student-answer"><h5>Questão ${index + 1} · ${question.type === 'objective' ? 'Objetiva' : 'Subjetiva'}</h5>${question.image_url ? `<img class="activity-question-image" src="${escapeHtml(question.image_url)}" alt="Imagem da questão ${index + 1}" loading="lazy">` : ''}<p>${escapeHtml(question.prompt)}</p>${question.type === 'objective' ? `${content}${objectiveGradeControl}` : `<ol type="a">${content}</ol>${objectiveGradeControl}`}<label class="activity-grade-field">Explicação da questão (opcional)<textarea name="explanation-${escapeHtml(question.id)}" maxlength="1000" rows="2" placeholder="Escreva um comentário para o aluno">${escapeHtml(explanation)}</textarea></label></section>`;
					}).join('')}
					<div class="activity-grade-actions"><button class="activity-answer-submit" type="submit">${selectedResponse.score === null ? 'Salvar nota' : 'Atualizar nota'}</button><p class="activity-grade-status" data-activity-grade-status role="status" aria-live="polite">${selectedResponse.score === null ? '' : `Nota atual: ${Number(selectedResponse.score).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 10`}</p></div>
				</form>
			</article>
		`;
		const gradeForm = list.querySelector<HTMLFormElement>('[data-activity-grade-form]');
		const gradeButton = gradeForm?.querySelector<HTMLButtonElement>('[type="submit"]');
		const gradeStatus = gradeForm?.querySelector<HTMLElement>('[data-activity-grade-status]');
		if (!gradeForm || !gradeButton || !gradeStatus) throw new Error('O formulário de avaliação está incompleto.');
		list.querySelectorAll<HTMLButtonElement>('[data-retry-decision]').forEach((decisionButton) => {
			decisionButton.addEventListener('click', async () => {
				const allowRetry = decisionButton.dataset.retryDecision === 'approve';
				const decisionButtons = [...list.querySelectorAll<HTMLButtonElement>('[data-retry-decision]')];
				decisionButtons.forEach((button) => { button.disabled = true; });
				try {
					const decision = await supabase.rpc('decide_activity_retry', {
						target_activity_id: activity.id,
						target_student_id: selectedResponse.student_id,
						target_attempt_number: selectedResponse.attempt_number,
						allow_retry: allowRetry,
					});
					if (decision.error) throw decision.error;
					selectedResponse.retry_status = allowRetry ? 'approved' : 'denied';
					renderSelectedAttempt();
				} catch (error) {
					console.error('Não foi possível registrar a decisão sobre a nova tentativa.', error);
					gradeStatus.textContent = error instanceof Error ? error.message : 'Não foi possível salvar a decisão.';
					decisionButtons.forEach((button) => { button.disabled = false; });
				}
			});
		});
		gradeForm.addEventListener('submit', async (event) => {
			event.preventDefault();
			if (!gradeForm.reportValidity()) return;
			gradeButton.disabled = true;
			gradeStatus.textContent = 'Salvando nota...';
			try {
				const formData = new FormData(gradeForm);
				const questionGrades: ActivityGradeDetails['questions'] = {};
				const weightedQuestionScores: Array<{ score: number; weight: number }> = [];
				for (const question of activity.activity_questions ?? []) {
					const explanation = String(formData.get(`explanation-${question.id}`) ?? '').trim();
					const answerKey = activityAnswerKeys.get(question.id);
					if (!answerKey) throw new Error('Esta atividade não tem gabarito e pesos salvos. Confira se foi publicada corretamente.');
					if (question.type === 'objective') {
						const correctOption = answerKey.correct_option;
						if (correctOption === null || question.options[correctOption] === undefined) {
							throw new Error('Esta atividade não tem gabarito objetivo salvo.');
						}
						const answer = selectedResponse.answers[question.id];
						const studentOption = typeof answer === 'string' && answer.trim() !== '' && Number.isInteger(Number(answer)) ? Number(answer) : -1;
						questionGrades[question.id] = { correct_option: correctOption, subquestion_scores: [], explanation };
						weightedQuestionScores.push({ score: studentOption === correctOption ? 10 : 0, weight: answerKey.weight });
					} else {
						if (answerKey.subquestion_weights.length !== question.subquestions.length) {
							throw new Error('Esta atividade não tem todos os pesos dos itens subjetivos salvos.');
						}
						const subquestionScores = question.subquestions.map((_, subquestionIndex) => {
							const value = Number(formData.get(`points-${question.id}-${subquestionIndex}`));
							if (!Number.isFinite(value) || value < 0 || value > 10) throw new Error('Informe notas entre 0 e 10 para todos os itens subjetivos.');
							return value;
						});
						questionGrades[question.id] = { correct_option: null, subquestion_scores: subquestionScores, explanation };
						const itemWeightTotal = answerKey.subquestion_weights.reduce((total, weight) => total + weight, 0);
						if (itemWeightTotal <= 0) throw new Error('Defina um peso maior que zero em pelo menos um item subjetivo.');
						const questionScore = subquestionScores.reduce((total, points, index) => total + points * answerKey.subquestion_weights[index], 0) / itemWeightTotal;
						weightedQuestionScores.push({ score: questionScore, weight: answerKey.weight });
					}
				}
				if (!weightedQuestionScores.length) throw new Error('A atividade não possui critérios para avaliação.');
				const totalQuestionWeight = weightedQuestionScores.reduce((total, question) => total + question.weight, 0);
				if (totalQuestionWeight <= 0) throw new Error('Defina um peso maior que zero em pelo menos uma questão.');
				const score = Math.round((weightedQuestionScores.reduce((total, question) => total + question.score * question.weight, 0) / totalQuestionWeight) * 100) / 100;
				const gradedAt = new Date().toISOString();
				const result = await supabase.from('activity_responses').update({
					score,
					grade_details: { questions: questionGrades },
					graded_at: gradedAt,
					graded_by: currentUserId,
				}).eq('activity_id', activity.id)
					.eq('student_id', selectedResponse.student_id)
					.eq('attempt_number', selectedResponse.attempt_number)
					.select('score')
					.single();
				if (result.error) throw result.error;
				selectedResponse.score = Number(result.data.score);
				selectedResponse.grade_details = { questions: questionGrades };
				selectedResponse.graded_at = gradedAt;
				gradeButton.textContent = 'Atualizar nota';
				gradeStatus.textContent = `Nota ${score.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} / 10 salva com sucesso.`;
				status.textContent = `${students.get(selectedResponse.student_id) ?? 'Aluno'} · Tentativa ${selectedResponse.attempt_number} · ${formatDateTime(selectedResponse.submitted_at)} · Nota ${score.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}/10`;
			} catch (error) {
				console.error('Não foi possível salvar a nota da atividade.', error);
				gradeStatus.textContent = error instanceof Error ? error.message : 'Não foi possível salvar a nota.';
			} finally {
				gradeButton.disabled = false;
			}
		});
	};

	const updateAttemptOptions = (): void => {
		const studentResponses = responses
			.filter((response) => response.student_id === studentSelect.value)
			.sort((left, right) => right.attempt_number - left.attempt_number);
		attemptSelect.innerHTML = studentResponses
			.map((response) => `<option value="${response.attempt_number}">Tentativa ${response.attempt_number}</option>`)
			.join('');
		attemptSelect.disabled = studentResponses.length === 0;
		renderSelectedAttempt();
	};

	studentSelect.addEventListener('change', updateAttemptOptions);
	attemptSelect.addEventListener('change', renderSelectedAttempt);
	updateAttemptOptions();
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
		: (['Todos', 'summary', 'activity', 'material'] as ContentTypeFilter[])
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
	await loadCurrentProfile();
	await loadPublishedContents();
	await loadStudentActivityResponseStatuses();
	attachTeacherContentPublisher();
	updateSubjectCategories();
	updateRelatedContentOptions();

	const filteredPublished = publishedContents.filter((content) =>
		(activeContentType === 'Todos' || content.content_type === activeContentType)
		&& (activeCategory === 'Todos' || content.subject === activeCategory)
		&& `${content.title} ${content.subject} ${content.description ?? ''}`.toLocaleLowerCase('pt-BR').includes(searchQuery.trim().toLocaleLowerCase('pt-BR')),
	);
	const list = pageContent.querySelector<HTMLElement>('[data-material-list]');
	const count = pageContent.querySelector<HTMLElement>('[data-material-count]');
	if (!list || !count) return;

	const total = filteredPublished.length;
	const resultLabel = total === 1 ? 'material encontrado' : 'materiais encontrados';
	count.textContent = `${total} ${resultLabel}`;
	list.innerHTML = total
		? renderPublishedCards(filteredPublished)
		: '<p class="empty-state">Nenhum material encontrado. Tente outro termo ou disciplina.</p>';
	attachContentDetails();
}

async function loadStudentActivityResponseStatuses(): Promise<void> {
	studentAnsweredActivityIds = new Set();
	studentActivityStatusesLoaded = false;
	if (currentUserRole !== 'student' || !currentUserId) return;
	const { data, error } = await supabase
		.from('activity_responses')
		.select('activity_id')
		.eq('student_id', currentUserId);
	if (error) {
		console.error('Não foi possível carregar o status das respostas das atividades.', error);
		return;
	}
	studentAnsweredActivityIds = new Set(((data ?? []) as Array<{ activity_id: string }>).map((response) => response.activity_id));
	studentActivityStatusesLoaded = true;
}

function renderPage(page: Page): void {
	if (!pageContent) return;
	if (page !== 'classroom' && classroomChannel) {
		const activeChannel = classroomChannel;
		classroomChannel = null;
		void supabase.removeChannel(activeChannel);
	}
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
								<span>Consulte os resumos publicados pelos seus professores.</span>
							</span>
							<span class="home-shortcut-arrow" aria-hidden="true">→</span>
						</a>
						<a class="home-shortcut" href="#materials">
							<span class="home-shortcut-icon" aria-hidden="true">◷</span>
							<span class="home-shortcut-copy">
								<strong>Explorar materiais</strong>
								<span>Encontre conteúdos e atividades disponíveis para você.</span>
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
					: '<p class="login-register-prompt">Não tem uma conta? <a href="#register" data-page="register">Cadastre-se</a></p>'}
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
				<p>Encontre resumos e atividades para continuar aprendendo.</p>
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
			<p class="materials-action-status" data-content-action-status role="status" aria-live="polite"></p>
			<dialog class="material-delete-dialog" data-material-delete-dialog aria-labelledby="material-delete-title">
				<form class="material-delete-dialog-content" data-material-delete-form>
					<p class="section-label">REMOVER MATERIAL</p>
					<h3 id="material-delete-title">Tem certeza?</h3>
					<p>Deseja excluir <strong data-delete-material-name></strong>? Esta ação não pode ser desfeita.</p>
					<div class="material-delete-dialog-actions">
						<button type="button" class="material-delete-cancel" data-cancel-material-delete>Cancelar</button>
						<button type="submit" class="material-delete-confirm" data-confirm-material-delete>Excluir material</button>
					</div>
				</form>
			</dialog>
			<div class="materials-grid" data-material-list></div>
		</section>
	`;
	attachMaterialDeletionDialog();

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