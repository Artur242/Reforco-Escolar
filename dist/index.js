const paginas = {
    inicio: {
        titulo: 'Que bom ter você aqui, Ana! <span aria-hidden="true">☀️</span>',
        descricao: 'Continue aprendendo no seu ritmo. Você está indo muito bem!',
        conteudo: `
      <section class="stats-grid" aria-label="Seu progresso">
        <article class="stat-card">
          <span class="stat-icon icon-lilac" aria-hidden="true">▤</span>
          <div><p>Atividades pendentes</p><strong>02</strong></div>
          <span class="stat-caption">Vamos nessa!</span>
        </article>
        <article class="stat-card">
          <span class="stat-icon icon-mint" aria-hidden="true">✓</span>
          <div><p>Atividades concluídas</p><strong>08</strong></div>
          <span class="stat-caption">Muito bem!</span>
        </article>
        <article class="stat-card">
          <span class="stat-icon icon-peach" aria-hidden="true">◷</span>
          <div><p>Tempo de estudo</p><strong>4h 30</strong></div>
          <span class="stat-caption">nesta semana</span>
        </article>
      </section>
      <div class="section-heading">
        <div><p class="eyebrow">SEU ESPAÇO DE APRENDIZADO</p><h2>Continue de onde parou</h2></div>
      </div>
      <section class="learning-grid" aria-label="Conteúdos para estudar">
        <article class="content-card">
          <div class="card-topline"><span class="card-icon icon-lilac" aria-hidden="true">▤</span><span class="pill pill-purple">2 pendentes</span></div>
          <h3>Atividades</h3>
          <p>Pratique o que você aprendeu e acompanhe seu progresso.</p>
          <div class="task-preview"><span class="task-dot"></span><span>Frações e números decimais</span><span class="task-time">15 min</span></div>
          <a class="text-link" href="#atividades" data-route="atividades">Ver atividades <span aria-hidden="true">→</span></a>
        </article>
        <article class="content-card">
          <div class="card-topline"><span class="card-icon icon-mint" aria-hidden="true">▧</span><span class="pill pill-green">5 disponíveis</span></div>
          <h3>Resumos</h3>
          <p>Revise os principais conteúdos de um jeito simples e rápido.</p>
          <div class="subject-tags"><span>Matemática</span><span>Português</span><span>Ciências</span></div>
          <a class="text-link" href="#resumos" data-route="resumos">Explorar resumos <span aria-hidden="true">→</span></a>
        </article>
        <article class="content-card">
          <div class="card-topline"><span class="card-icon icon-peach" aria-hidden="true">▷</span><span class="pill pill-orange">Próxima aula</span></div>
          <h3>Aula de hoje</h3>
          <p>Uma revisão leve para você se preparar para os próximos desafios.</p>
          <div class="lesson-preview"><span class="lesson-play" aria-hidden="true">▶</span><span><strong>Matemática: frações</strong><small>Com a professora Julia · 20 min</small></span></div>
          <a class="text-link" href="#aula" data-route="aula">Acessar aula <span aria-hidden="true">→</span></a>
        </article>
      </section>`,
    },
    atividades: {
        titulo: 'Suas atividades',
        descricao: 'Um pouco de prática por dia faz toda a diferença.',
        conteudo: `
      <section class="route-grid" aria-label="Lista de atividades">
        <article class="content-card">
          <div class="card-topline"><span class="card-icon icon-lilac" aria-hidden="true">÷</span><span class="pill pill-purple">15 min</span></div>
          <h3>Frações e números decimais</h3><p>Pratique equivalência, comparação e operações com frações.</p>
          <button class="action-btn" type="button" data-action="concluir">Marcar como concluída</button>
        </article>
        <article class="content-card">
          <div class="card-topline"><span class="card-icon icon-mint" aria-hidden="true">✎</span><span class="pill pill-green">10 min</span></div>
          <h3>Interpretação de texto</h3><p>Leia com atenção e responda às perguntas sobre o texto.</p>
          <button class="action-btn" type="button" data-action="concluir">Marcar como concluída</button>
        </article>
      </section>`,
    },
    resumos: {
        titulo: 'Resumos para revisar',
        descricao: 'Encontre explicações rápidas para relembrar o que estudou.',
        conteudo: `
      <section class="route-grid" aria-label="Resumos disponíveis">
        <article class="content-card"><div class="card-topline"><span class="card-icon icon-lilac" aria-hidden="true">÷</span><span class="pill pill-purple">Matemática</span></div><h3>Frações sem complicação</h3><p>Numerador, denominador e equivalência explicados passo a passo.</p><details class="summary-details"><summary>Ler resumo</summary><p>Uma fração representa partes de um todo. O denominador indica em quantas partes iguais o todo foi dividido; o numerador mostra quantas partes foram consideradas. Frações equivalentes representam a mesma quantidade.</p></details></article>
        <article class="content-card"><div class="card-topline"><span class="card-icon icon-mint" aria-hidden="true">¶</span><span class="pill pill-green">Português</span></div><h3>Ideia principal do texto</h3><p>Aprenda a identificar o assunto e as informações mais importantes.</p><details class="summary-details"><summary>Ler resumo</summary><p>A ideia principal é a informação mais importante de um texto. Observe o título, as palavras que se repetem e o que cada parágrafo acrescenta ao assunto.</p></details></article>
        <article class="content-card"><div class="card-topline"><span class="card-icon icon-peach" aria-hidden="true">✦</span><span class="pill pill-orange">Ciências</span></div><h3>O ciclo da água</h3><p>Conheça as etapas que movimentam a água na natureza.</p><details class="summary-details"><summary>Ler resumo</summary><p>O calor do Sol evapora a água; o vapor esfria e se condensa em nuvens; depois, a precipitação devolve a água à superfície, onde o ciclo recomeça.</p></details></article>
      </section>`,
    },
    aula: {
        titulo: 'Sua aula',
        descricao: 'Acompanhe a aula de hoje e siga aprendendo no seu ritmo.',
        conteudo: `
      <section class="content-card lesson-detail">
        <div class="card-topline"><span class="card-icon icon-peach" aria-hidden="true">▷</span><span class="pill pill-orange">Matemática · 20 min</span></div>
        <h3>Frações: entendendo cada parte</h3>
        <p>Com a professora Julia</p>
        <div class="lesson-stage"><span aria-hidden="true">▶</span><p>A aula está pronta para começar.</p></div>
        <button class="action-btn" type="button" data-action="assistir">Começar aula</button>
      </section>`,
    },
};
function obterElemento(seletor) {
    const elemento = document.querySelector(seletor);
    if (!elemento) {
        throw new Error(`Não foi possível inicializar a aplicação: elemento "${seletor}" não encontrado.`);
    }
    return elemento;
}
const conteudoPrincipal = obterElemento('#main-content');
const navegacao = obterElemento('.navigation');
const saudacao = obterElemento('.welcome-label');
let atividadesConcluidas = 0;
function isRota(valor) {
    return Object.prototype.hasOwnProperty.call(paginas, valor);
}
function obterRotaAtual() {
    const rota = window.location.hash.slice(1);
    return isRota(rota) ? rota : 'inicio';
}
function renderizar(rota) {
    const pagina = paginas[rota];
    conteudoPrincipal.innerHTML = `
    <section class="welcome" aria-labelledby="page-title">
      <div>
        <p class="eyebrow">${rota === 'inicio' ? 'SEXTA-FEIRA, 30 DE OUTUBRO' : 'SEU ESPAÇO DE APRENDIZADO'}</p>
        <h2 id="page-title">${pagina.titulo}</h2>
        <p class="welcome-copy">${pagina.descricao}</p>
      </div>
      ${rota === 'inicio' ? '<div class="streak-card"><span aria-hidden="true">🔥</span><span><strong>3 dias</strong><small>de dedicação</small></span></div>' : ''}
    </section>
    ${pagina.conteudo}
    <footer class="page-footer">Aprender fica mais fácil quando caminhamos juntos. <span aria-hidden="true">♡</span></footer>`;
    saudacao.textContent = 'Olá, Ana!';
    document.title = `${rota === 'inicio' ? 'Área do aluno' : pagina.titulo.replace(/<[^>]*>/g, '')} | Reforço escolar`;
    navegacao.querySelectorAll('[data-route]').forEach((link) => {
        const ativo = link.dataset.route === rota;
        link.classList.toggle('active', ativo);
        if (ativo) {
            link.setAttribute('aria-current', 'page');
        }
        else {
            link.removeAttribute('aria-current');
        }
    });
}
navegacao.addEventListener('click', (evento) => {
    const alvo = evento.target;
    if (!(alvo instanceof Element))
        return;
    const link = alvo.closest('a[data-route]');
    if (!link || evento.button !== 0 || evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey)
        return;
    const rota = link.dataset.route;
    if (!rota || !isRota(rota))
        return;
    evento.preventDefault();
    if (window.location.hash !== `#${rota}`) {
        window.history.pushState(null, '', `#${rota}`);
    }
    renderizar(rota);
    window.scrollTo({ top: 0, behavior: 'smooth' });
});
conteudoPrincipal.addEventListener('click', (evento) => {
    const alvo = evento.target;
    if (!(alvo instanceof Element))
        return;
    const botao = alvo.closest('button[data-action]');
    if (!botao)
        return;
    if (botao.dataset.action === 'concluir') {
        atividadesConcluidas += 1;
        botao.disabled = true;
        botao.textContent = 'Atividade concluída!';
        botao.classList.add('action-btn-complete');
        const badge = document.querySelector('.nav-count');
        if (badge)
            badge.textContent = String(Math.max(0, 2 - atividadesConcluidas));
    }
    else if (botao.dataset.action === 'assistir') {
        const etapa = conteudoPrincipal.querySelector('.lesson-stage');
        if (etapa) {
            etapa.classList.add('lesson-stage-playing');
            etapa.innerHTML = '<span aria-hidden="true">✓</span><p>Aula iniciada! Bons estudos.</p>';
        }
        botao.disabled = true;
        botao.textContent = 'Aula em andamento';
    }
});
window.addEventListener('popstate', () => renderizar(obterRotaAtual()));
window.addEventListener('hashchange', () => renderizar(obterRotaAtual()));
const rotaInicial = obterRotaAtual();
if (window.location.hash !== `#${rotaInicial}`) {
    window.history.replaceState(null, '', `#${rotaInicial}`);
}
renderizar(rotaInicial);
export {};
