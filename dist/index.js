const pageContent = document.querySelector('#page-content');
const pageLinks = document.querySelectorAll('[data-page]');
const sidebar = document.querySelector('#primary-navigation');
const menuToggle = document.querySelector('.menu-toggle');
const savedTheme = localStorage.getItem('theme');
const initialTheme = savedTheme === 'dark' ? 'dark' : 'light';
const materials = [
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
const categories = ['Todos', 'Matemática', 'Português', 'Ciências'];
const pageHashes = {
    home: '#home',
    materials: '#materials',
    summaries: '#summaries',
    login: '#login',
    register: '#register',
};
let activeCategory = 'Todos';
let searchQuery = '';
function isSubjectFilter(value) {
    return value !== undefined && categories.some((category) => category === value);
}
function getFilteredMaterials(getSearchText) {
    const normalizedQuery = searchQuery.trim().toLocaleLowerCase('pt-BR');
    return materials.filter((material) => {
        const matchesCategory = activeCategory === 'Todos' || material.subject === activeCategory;
        const searchableText = getSearchText(material).toLocaleLowerCase('pt-BR');
        return matchesCategory && searchableText.includes(normalizedQuery);
    });
}
function renderMaterialCards(items, showSummary = false) {
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
			</article>
		`;
    }).join('');
}
function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('theme', theme);
    document.querySelectorAll('[data-theme-choice]').forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
    });
}
function setMobileMenuOpen(isOpen) {
    if (!sidebar || !menuToggle)
        return;
    sidebar.dataset.open = String(isOpen);
    menuToggle.setAttribute('aria-expanded', String(isOpen));
    menuToggle.setAttribute('aria-label', isOpen ? 'Fechar menu' : 'Abrir menu');
    const label = menuToggle.querySelector('[data-menu-label]');
    if (label)
        label.textContent = isOpen ? 'Fechar' : 'Menu';
}
function renderSubjectPicker(page) {
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
function setSubjectMenuOpen(picker, isOpen) {
    picker.dataset.open = String(isOpen);
    picker.querySelector('[data-subject-trigger]')?.setAttribute('aria-expanded', String(isOpen));
    const options = picker.querySelector('[data-subject-options]');
    options?.setAttribute('aria-hidden', String(!isOpen));
    options?.toggleAttribute('inert', !isOpen);
}
function renderMaterials() {
    if (!pageContent)
        return;
    const filteredMaterials = getFilteredMaterials((material) => `${material.title} ${material.subject} ${material.description}`);
    const list = pageContent.querySelector('[data-material-list]');
    const count = pageContent.querySelector('[data-material-count]');
    if (!list || !count)
        return;
    count.textContent = `${filteredMaterials.length} ${filteredMaterials.length === 1 ? 'material encontrado' : 'materiais encontrados'}`;
    list.innerHTML = filteredMaterials.length
        ? renderMaterialCards(filteredMaterials)
        : '<p class="empty-state">Nenhum material encontrado. Tente outro termo ou disciplina.</p>';
}
function renderSummaries() {
    if (!pageContent)
        return;
    const filteredMaterials = getFilteredMaterials((material) => `${material.title} ${material.subject} ${material.summary}`);
    const list = pageContent.querySelector('[data-summary-list]');
    const count = pageContent.querySelector('[data-summary-count]');
    if (!list || !count)
        return;
    count.textContent = `${filteredMaterials.length} ${filteredMaterials.length === 1 ? 'resumo encontrado' : 'resumos encontrados'}`;
    list.innerHTML = filteredMaterials.length
        ? renderMaterialCards(filteredMaterials, true)
        : '<p class="empty-state">Nenhum resumo encontrado. Tente outro termo ou disciplina.</p>';
}
function renderPage(page) {
    if (!pageContent)
        return;
    const isAuthPage = page === 'login' || page === 'register';
    document.body.classList.toggle('login-mode', isAuthPage);
    pageContent.classList.toggle('login-content', isAuthPage);
    pageContent.classList.toggle('home-content', page === 'home');
    pageLinks.forEach((link) => {
        if (link.dataset.page === page) {
            link.setAttribute('aria-current', 'page');
        }
        else {
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
						required
					>
					<button class="login-submit" type="submit">${isRegisterPage ? 'Criar conta' : 'Entrar'}</button>
					<p class="login-status" data-login-status role="status" aria-live="polite"></p>
				</form>
				${isRegisterPage
					? '<a class="login-back" href="#login" data-page="login">Já tem uma conta? Entrar</a>'
					: '<p class="login-register-prompt">Caso não tenha login, <a href="#register" data-page="register">clique aqui para registrar sua conta</a>.</p><a class="login-back" href="#home" data-page="home">Voltar ao início</a>'}
			</section>
		`;
        pageContent.querySelector('[data-auth-form]')?.addEventListener('submit', (event) => {
            event.preventDefault();
            const status = pageContent.querySelector('[data-login-status]');
            if (!status)
                throw new Error('O campo de status do login não foi encontrado.');
            status.textContent = isRegisterPage
                ? 'O cadastro ainda não está conectado ao servidor. O formulário está pronto para integração.'
                : 'A autenticação ainda não está conectada. O formulário está pronto para integração com o servidor.';
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
    const searchInput = pageContent.querySelector(searchSelector);
    searchInput?.addEventListener('input', (event) => {
        searchQuery = event.currentTarget.value;
        isSummariesPage ? renderSummaries() : renderMaterials();
    });
    const subjectPicker = pageContent.querySelector('[data-subject-picker]');
    const subjectTrigger = subjectPicker?.querySelector('[data-subject-trigger]');
    const subjectOptions = subjectPicker?.querySelector('[data-subject-options]');
    if (subjectPicker && subjectTrigger) {
        subjectTrigger.addEventListener('click', () => {
            setSubjectMenuOpen(subjectPicker, subjectPicker.dataset.open !== 'true');
        });
    }
    subjectPicker?.addEventListener('click', (event) => {
        if (!(event.target instanceof Element))
            return;
        const option = event.target.closest('[data-category]');
        const category = option?.dataset.category;
        if (!option || !isSubjectFilter(category))
            return;
        activeCategory = category;
        const selectedSubject = subjectPicker.querySelector('[data-selected-subject]');
        if (selectedSubject) {
            selectedSubject.textContent = activeCategory === 'Todos' ? 'Todas as disciplinas' : activeCategory;
        }
        subjectPicker.querySelectorAll('[data-category]').forEach((button) => {
            button.setAttribute('aria-pressed', String(button === option));
        });
        setSubjectMenuOpen(subjectPicker, false);
        subjectTrigger?.focus();
        isSummariesPage ? renderSummaries() : renderMaterials();
    });
    subjectPicker?.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && subjectPicker.dataset.open === 'true') {
            event.preventDefault();
            setSubjectMenuOpen(subjectPicker, false);
            subjectTrigger?.focus();
            return;
        }
        if (!(event.target instanceof HTMLElement))
            return;
        const target = event.target;
        if (target.closest('[data-subject-trigger]') && event.key === 'ArrowDown') {
            event.preventDefault();
            setSubjectMenuOpen(subjectPicker, true);
            subjectOptions?.querySelector('[aria-pressed="true"]')?.focus();
            return;
        }
        if (!target.matches('[data-category]') || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp'))
            return;
        event.preventDefault();
        const options = Array.from(subjectPicker.querySelectorAll('[data-category]'));
        const currentIndex = options.indexOf(target);
        const offset = event.key === 'ArrowDown' ? 1 : -1;
        options[(currentIndex + offset + options.length) % options.length]?.focus();
    });
    isSummariesPage ? renderSummaries() : renderMaterials();
}
function pageFromHash() {
    if (window.location.hash === '#materials')
        return 'materials';
    if (window.location.hash === '#summaries')
        return 'summaries';
    if (window.location.hash === '#login')
        return 'login';
    if (window.location.hash === '#register')
        return 'register';
    return 'home';
}
pageLinks.forEach((link) => {
    link.addEventListener('click', (event) => {
        const page = link.dataset.page;
        if (page !== 'home' && page !== 'materials' && page !== 'summaries' && page !== 'login' && page !== 'register')
            return;
        event.preventDefault();
        const hash = pageHashes[page];
        if (window.location.hash !== hash) {
            window.history.pushState(null, '', hash);
        }
        renderPage(page);
        setMobileMenuOpen(false);
    });
});
menuToggle?.addEventListener('click', () => {
    setMobileMenuOpen(sidebar?.dataset.open !== 'true');
});
sidebar?.querySelectorAll('a').forEach((link) => {
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
    if (!(event.target instanceof Node))
        return;
    const target = event.target;
    if (sidebar?.dataset.open === 'true' && !sidebar.contains(target) && !menuToggle?.contains(target)) {
        setMobileMenuOpen(false);
    }
    const subjectPicker = pageContent?.querySelector('[data-subject-picker]');
    if (subjectPicker?.dataset.open === 'true' && !subjectPicker.contains(target)) {
        setSubjectMenuOpen(subjectPicker, false);
    }
});
document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element))
        return;
    const button = event.target.closest('[data-theme-choice]');
    const theme = button?.dataset.themeChoice;
    if (theme === 'light' || theme === 'dark') {
        setTheme(theme);
    }
});
setTheme(initialTheme);
renderPage(pageFromHash());
export {};
