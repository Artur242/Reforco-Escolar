const themeButtons = document.querySelectorAll<HTMLButtonElement>('[data-theme-choice]');
const pageContent = document.querySelector<HTMLElement>('#page-content');
const pageLinks = document.querySelectorAll<HTMLAnchorElement>('[data-page]');
const savedTheme = localStorage.getItem('theme');
const initialTheme = savedTheme === 'dark' ? 'dark' : 'light';

type Page = 'home' | 'materials';
type Category = 'Matemática' | 'Português' | 'Ciências';

interface Material {
	title: string;
	subject: Category;
	description: string;
	format: string;
}

const materials: Material[] = [
	{
		title: 'Frações sem mistério',
		subject: 'Matemática',
		description: 'Aprenda a comparar, simplificar e operar frações com exemplos resolvidos.',
		format: 'Resumo · 8 min',
	},
	{
		title: 'Equações do 1º grau',
		subject: 'Matemática',
		description: 'Pratique como encontrar o valor da incógnita e conferir cada resultado.',
		format: 'Exercícios · 12 questões',
	},
	{
		title: 'Classes gramaticais',
		subject: 'Português',
		description: 'Um guia rápido para reconhecer substantivos, verbos, adjetivos e mais.',
		format: 'Guia · 6 min',
	},
	{
		title: 'Interpretação de texto',
		subject: 'Português',
		description: 'Estratégias para localizar informações e identificar ideias principais.',
		format: 'Atividade · 10 questões',
	},
	{
		title: 'Sistema solar',
		subject: 'Ciências',
		description: 'Conheça os planetas, seus movimentos e a organização do sistema solar.',
		format: 'Resumo · 7 min',
	},
	{
		title: 'Cadeia alimentar',
		subject: 'Ciências',
		description: 'Entenda como a energia circula entre produtores, consumidores e decompositores.',
		format: 'Guia · 5 min',
	},
];

const categories: Array<'Todos' | Category> = ['Todos', 'Matemática', 'Português', 'Ciências'];
let activeCategory: 'Todos' | Category = 'Todos';
let searchQuery = '';

function setTheme(theme: 'light' | 'dark'): void {
	document.documentElement.dataset.theme = theme;
	localStorage.setItem('theme', theme);

	themeButtons.forEach((button) => {
		button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
	});
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
		`;
		return;
	}

	activeCategory = 'Todos';
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
					<input type="search" placeholder="Buscar por tema ou disciplina" data-material-search>
				</label>
				<div class="material-filters" role="group" aria-label="Filtrar por disciplina">
					${categories.map((category) => `<button type="button" data-material-filter="${category}" aria-pressed="${category === 'Todos'}">${category}</button>`).join('')}
				</div>
			</div>
			<p class="materials-count" data-material-count aria-live="polite"></p>
			<div class="materials-grid" data-material-list></div>
		</section>
	`;

	pageContent.querySelector<HTMLInputElement>('[data-material-search]')?.addEventListener('input', (event) => {
		searchQuery = (event.currentTarget as HTMLInputElement).value;
		renderMaterials();
	});

	pageContent.querySelector<HTMLDivElement>('.material-filters')?.addEventListener('click', (event) => {
		const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-material-filter]');
		const category = button?.dataset.materialFilter;
		if (!button || !categories.includes(category as 'Todos' | Category)) return;

		activeCategory = category as 'Todos' | Category;
		pageContent.querySelectorAll<HTMLButtonElement>('[data-material-filter]').forEach((filter) => {
			filter.setAttribute('aria-pressed', String(filter === button));
		});
		renderMaterials();
	});

	renderMaterials();
}

function pageFromHash(): Page {
	return window.location.hash === '#materials' ? 'materials' : 'home';
}

pageLinks.forEach((link) => {
	link.addEventListener('click', (event) => {
		const page = link.dataset.page;
		if (page !== 'home' && page !== 'materials') return;

		event.preventDefault();
		const hash = page === 'materials' ? '#materials' : '#home';
		if (window.location.hash !== hash) {
			window.history.pushState(null, '', hash);
		}
		renderPage(page);
	});
});

window.addEventListener('popstate', () => renderPage(pageFromHash()));

themeButtons.forEach((button) => {
	button.addEventListener('click', () => {
		const theme = button.dataset.themeChoice;

		if (theme === 'light' || theme === 'dark') {
			setTheme(theme);
		}
	});
});

setTheme(initialTheme);
renderPage(pageFromHash());
