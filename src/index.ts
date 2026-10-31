const themeButtons = document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]');
const pageContent = document.querySelector<HTMLElement>('#page-content');
const pageLinks = document.querySelectorAll<HTMLAnchorElement>('[data-page]');
const savedTheme = localStorage.getItem('theme');
const initialTheme = savedTheme === 'dark' ? 'dark' : 'light';

type Page = 'home' | 'materials' | 'summaries' | 'settings';
type Category = 'Matemática' | 'Português' | 'Ciências';
type TextSize = 'normal' | 'large';

interface Material {
	title: string;
	subject: Category;
	description: string;
	summary: string;
	format: string;
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

const categories: Array<'Todos' | Category> = ['Todos', 'Matemática', 'Português', 'Ciências'];
let activeCategory: 'Todos' | Category = 'Todos';
let searchQuery = '';

function getDailyGoal(): number {
	const savedGoal = Number(localStorage.getItem('studyDailyGoal'));
	return Number.isFinite(savedGoal) && savedGoal >= 15 && savedGoal <= 120 ? savedGoal : 45;
}

function getPreferredSubject(): Category | null {
	const savedSubject = localStorage.getItem('studyFocusSubject');
	return categories.includes(savedSubject as Category) && savedSubject !== 'Todos' ? savedSubject as Category : null;
}

function applyStudentPreferences(): void {
	const savedTextSize = localStorage.getItem('studyTextSize');
	document.documentElement.dataset.textSize = savedTextSize === 'large' ? 'large' : 'normal';
	document.documentElement.dataset.motion = localStorage.getItem('studyReduceMotion') === 'true' ? 'reduced' : 'full';
}

function setTheme(theme: 'light' | 'dark'): void {
	document.documentElement.dataset.theme = theme;
	localStorage.setItem('theme', theme);

	themeButtons.forEach((button) => {
		button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
	});
}

function renderSubjectPicker(page: 'materials' | 'summaries'): string {
	const optionsId = `${page}-subject-options`;
	return `
		<div class="subject-picker" data-subject-picker data-open="false">
			<span class="subject-picker-label">Disciplina</span>
			<button class="subject-picker-trigger" type="button" data-subject-trigger aria-expanded="false" aria-controls="${optionsId}">
				<span class="subject-picker-value" data-selected-subject>Todas as disciplinas</span>
				<svg class="subject-chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m7 10 5 5 5-5" /></svg>
			</button>
			<div class="subject-options" id="${optionsId}" data-subject-options aria-hidden="true" inert>
				<div class="subject-options-panel" role="group" aria-label="Filtrar por disciplina">
					${categories.map((category) => `
						<button class="subject-option" type="button" data-category="${category}" aria-pressed="${category === activeCategory}">
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

	const normalizedQuery = searchQuery.trim().toLocaleLowerCase('pt-BR');
	const filteredMaterials = materials.filter((material) => {
		const matchesCategory = activeCategory === 'Todos' || material.subject === activeCategory;
		const searchableText = `${material.title} ${material.subject} ${material.description}`.toLocaleLowerCase('pt-BR');
		return matchesCategory && searchableText.includes(normalizedQuery);
	});

	const list = pageContent.querySelector<HTMLElement>('[data-material-list]');
	const count = pageContent.querySelector<HTMLElement>('[data-material-count]');
	if (!list || !count) return;

	count.textContent = `${filteredMaterials.length} ${filteredMaterials.length === 1 ? 'material encontrado' : 'materiais encontrados'}`;
	list.innerHTML = filteredMaterials.length
		? filteredMaterials.map((material) => `
			<article class="material-card">
				<div class="material-card-meta">
					<span class="material-subject">${material.subject}</span>
					<span class="material-format">${material.format}</span>
				</div>
				<h3>${material.title}</h3>
				<p>${material.description}</p>
			</article>
		`).join('')
		: '<p class="empty-state">Nenhum material encontrado. Tente outro termo ou disciplina.</p>';
}

function renderSummaries(): void {
	if (!pageContent) return;

	const normalizedQuery = searchQuery.trim().toLocaleLowerCase('pt-BR');
	const filteredMaterials = materials.filter((material) => {
		const matchesCategory = activeCategory === 'Todos' || material.subject === activeCategory;
		const searchableText = `${material.title} ${material.subject} ${material.summary}`.toLocaleLowerCase('pt-BR');
		return matchesCategory && searchableText.includes(normalizedQuery);
	});

	const list = pageContent.querySelector<HTMLElement>('[data-summary-list]');
	const count = pageContent.querySelector<HTMLElement>('[data-summary-count]');
	if (!list || !count) return;

	count.textContent = `${filteredMaterials.length} ${filteredMaterials.length === 1 ? 'resumo encontrado' : 'resumos encontrados'}`;
	list.innerHTML = filteredMaterials.length
		? filteredMaterials.map((material) => `
			<article class="material-card">
				<div class="material-card-meta">
					<span class="material-subject">${material.subject}</span>
					<span class="material-format">${material.format}</span>
				</div>
				<h3>${material.title}</h3>
				<p class="material-summary">${material.summary}</p>
			</article>
		`).join('')
		: '<p class="empty-state">Nenhum resumo encontrado. Tente outro termo ou disciplina.</p>';
}

function renderSettings(): void {
	if (!pageContent) return;

	const preferredSubject = getPreferredSubject() ?? '';
	const textSize = localStorage.getItem('studyTextSize') === 'large' ? 'large' : 'normal';
	const reduceMotion = localStorage.getItem('studyReduceMotion') === 'true';
	const dailyGoal = getDailyGoal();

	pageContent.innerHTML = `
		<section class="settings-page" aria-labelledby="settings-title">
			<div class="materials-heading">
				<p class="section-label">SEU ESPAÇO DE ESTUDO</p>
				<h2 id="settings-title">Configurações</h2>
				<p>Personalize sua rotina e a forma como você estuda.</p>
			</div>
			<div class="settings-list">
				<section class="setting-row" aria-labelledby="daily-goal-title">
					<div class="setting-description">
						<h3 id="daily-goal-title">Meta diária de estudo</h3>
						<p>Escolha quanto tempo quer dedicar aos estudos por dia.</p>
					</div>
					<label class="setting-control goal-control">
						<output data-goal-output for="daily-goal">${dailyGoal} min</output>
						<input id="daily-goal" type="range" min="15" max="120" step="15" value="${dailyGoal}" data-daily-goal>
						<span class="range-labels"><span>15 min</span><span>2 h</span></span>
					</label>
				</section>
				<section class="setting-row" aria-labelledby="focus-subject-title">
					<div class="setting-description">
						<h3 id="focus-subject-title">Disciplina de foco</h3>
						<p>Ela será usada como filtro inicial em Materiais e Resumos.</p>
					</div>
					<label class="setting-control">
						<span class="visually-hidden">Escolher disciplina de foco</span>
						<select class="settings-select" data-focus-subject>
							<option value="">Sem preferência</option>
							${categories.filter((category): category is Category => category !== 'Todos').map((category) => `<option value="${category}" ${category === preferredSubject ? 'selected' : ''}>${category}</option>`).join('')}
						</select>
					</label>
				</section>
				<section class="setting-row" aria-labelledby="text-size-title">
					<div class="setting-description">
						<h3 id="text-size-title">Tamanho do texto</h3>
						<p>Aumente o texto dos materiais para facilitar a leitura.</p>
					</div>
					<label class="setting-control">
						<span class="visually-hidden">Tamanho do texto</span>
						<select class="settings-select" data-text-size>
							<option value="normal" ${textSize === 'normal' ? 'selected' : ''}>Padrão</option>
							<option value="large" ${textSize === 'large' ? 'selected' : ''}>Maior</option>
						</select>
					</label>
				</section>
				<section class="setting-row" aria-labelledby="motion-title">
					<div class="setting-description">
						<h3 id="motion-title">Reduzir animações</h3>
						<p>Deixe as transições da interface mais discretas.</p>
					</div>
					<label class="setting-control setting-toggle">
						<span class="visually-hidden">Reduzir animações</span>
						<input type="checkbox" data-reduce-motion ${reduceMotion ? 'checked' : ''}>
						<span aria-hidden="true"></span>
					</label>
				</section>
			</div>
			<p class="settings-saved" role="status">As alterações são salvas automaticamente neste dispositivo.</p>
		</section>
	`;

	pageContent.querySelector<HTMLInputElement>('[data-daily-goal]')?.addEventListener('input', (event) => {
		const goal = (event.currentTarget as HTMLInputElement).value;
		localStorage.setItem('studyDailyGoal', goal);
		const output = pageContent.querySelector<HTMLOutputElement>('[data-goal-output]');
		if (output) output.value = `${goal} min`;
	});

	pageContent.querySelector<HTMLSelectElement>('[data-focus-subject]')?.addEventListener('change', (event) => {
		const subject = (event.currentTarget as HTMLSelectElement).value;
		if (subject) {
			localStorage.setItem('studyFocusSubject', subject);
		} else {
			localStorage.removeItem('studyFocusSubject');
		}
	});

	pageContent.querySelector<HTMLSelectElement>('[data-text-size]')?.addEventListener('change', (event) => {
		const size = (event.currentTarget as HTMLSelectElement).value as TextSize;
		localStorage.setItem('studyTextSize', size);
		applyStudentPreferences();
	});

	pageContent.querySelector<HTMLInputElement>('[data-reduce-motion]')?.addEventListener('change', (event) => {
		const isEnabled = (event.currentTarget as HTMLInputElement).checked;
		localStorage.setItem('studyReduceMotion', String(isEnabled));
		applyStudentPreferences();
	});
}

function renderPage(page: Page): void {
	if (!pageContent) return;

	pageLinks.forEach((link) => {
		if (link.dataset.page === page) {
			link.setAttribute('aria-current', 'page');
		} else {
			link.removeAttribute('aria-current');
		}
	});

	if (page === 'home') {
		pageContent.innerHTML = `
			<h2>Bem-vindo ao Reforço Escolar</h2>
			<p>Este é o seu painel de reforço escolar. Aqui você pode acessar materiais de estudo, acompanhar seu progresso e muito mais.</p>
			<p class="home-study-goal">Sua meta diária: <strong>${getDailyGoal()} minutos</strong> de estudo.</p>
		`;
		return;
	}

	if (page === 'settings') {
		renderSettings();
		return;
	}

	activeCategory = getPreferredSubject() ?? 'Todos';
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
		const option = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-category]');
		const category = option?.dataset.category;
		if (!option || !categories.includes(category as 'Todos' | Category)) return;

		activeCategory = category as 'Todos' | Category;
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

		const target = event.target as HTMLElement;
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
	if (window.location.hash === '#settings') return 'settings';
	return 'home';
}

pageLinks.forEach((link) => {
	link.addEventListener('click', (event) => {
		const page = link.dataset.page;
		if (page !== 'home' && page !== 'materials' && page !== 'summaries' && page !== 'settings') return;

		event.preventDefault();
		const hash = page === 'materials' ? '#materials' : page === 'summaries' ? '#summaries' : page === 'settings' ? '#settings' : '#home';
		if (window.location.hash !== hash) {
			window.history.pushState(null, '', hash);
		}
		renderPage(page);
	});
});

window.addEventListener('popstate', () => renderPage(pageFromHash()));

document.addEventListener('pointerdown', (event) => {
	const subjectPicker = pageContent?.querySelector<HTMLElement>('[data-subject-picker]');
	if (subjectPicker?.dataset.open === 'true' && !subjectPicker.contains(event.target as Node)) {
		setSubjectMenuOpen(subjectPicker, false);
	}
});

themeButtons.forEach((button) => {
	button.addEventListener('click', () => {
		const theme = button.dataset.themeChoice;

		if (theme === 'light' || theme === 'dark') {
			setTheme(theme);
		}
	});
});

setTheme(initialTheme);
applyStudentPreferences();
renderPage(pageFromHash());
