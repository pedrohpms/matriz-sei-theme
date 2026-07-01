/*
 * Calculadora da matriz de priorização do SEI — initializer do Discourse.
 *
 * Migrado do app.js do protótipo standalone (pedrohpms/matriz-sei). Fluxo de
 * seis passos, regras de validação (teto de complexidade, ato vinculado,
 * filtro 0+0) e a memória de cálculo em dois formatos permanecem idênticos
 * ao protótipo — só a forma de carregar dados e de entrar em execução mudou
 * para se adequar ao ambiente do Discourse. Ver README para o resumo das
 * adaptações.
 *
 * Iteração 2 (assets): este initializer só PROVA que os dados carregam
 * (regua.json/tooltips.json) e loga no console. Ele NÃO renderiza a
 * calculadora — o template em common/head_tag.html ainda não foi clonado no
 * DOM (isso é Iteração 3, quando o botão que abre o modal existir). Por
 * isso, `montarInterface()` está definida mas não é chamada aqui: chamá-la
 * agora quebraria, porque os elementos que ela procura (#id-natureza,
 * #criterios, etc.) não existem enquanto o template não for instanciado.
 */

import { withPluginApi } from "discourse/lib/plugin-api";

export default {
  name: "matriz-sei-calc-init",

  initialize() {
    withPluginApi("0.11.1", (api) => {
      console.info("Matriz SEI calc initializer carregado");

      /* ---------------------------------------------------------------- *
       * Dados de domínio (fonte única da verdade)
       * ---------------------------------------------------------------- */

      // Opções de listas controladas. Reaproveitadas em mais de um passo.
      // `tooltip` aponta para a chave em tooltips.json (conteúdo contextual).
      const NATUREZAS = [
        { valor: "problema", rotulo: "Problema a resolver", tooltip: "natureza_problema" },
        { valor: "pratica", rotulo: "Prática em curso a difundir", tooltip: "natureza_pratica" },
      ];

      // Corretiva é tratada via Central de Atendimento, fora desta calculadora.
      const TRILHAS = ["Melhoria", "Evolutiva", "Normativa"];

      // Camadas em ordem crescente de complexidade/abrangência.
      const CAMADAS = [
        { valor: "uso-local", rotulo: "Uso local", tooltip: "camada_uso_local" },
        { valor: "grupo", rotulo: "Grupo", tooltip: "camada_grupo" },
        { valor: "vitrine", rotulo: "Vitrine", tooltip: "camada_vitrine" },
        { valor: "modulo-pen", rotulo: "Módulo PEN", tooltip: "camada_modulo_pen" },
        { valor: "core-sei", rotulo: "Core SEI", tooltip: "camada_core_sei" },
      ];

      // Teto da nota de Complexidade (escala invertida) por camada validada.
      // O teto é a nota MÁXIMA permitida sem justificativa. Core SEI fixa em 0
      // (sem override). Notas acima do teto, nas demais camadas, exigem override.
      const TETOS_CAMADA = {
        "uso-local": 4,
        grupo: 3,
        vitrine: 3, // nota 2 cabível em vitrine exigente
        "modulo-pen": 1,
        "core-sei": 0, // nota fixa, sem override
      };

      // Gatilhos do ato vinculado / piso (Passo 2 — Triagem).
      const GATILHOS_PISO = [
        { chave: "obrigacaoLegal", rotulo: "Obrigação legal", tooltip: "piso_obrigacao_legal" },
        { chave: "determinacaoControle", rotulo: "Determinação de órgão de controle", tooltip: "piso_determinacao_controle" },
        { chave: "seguranca", rotulo: "Falha de segurança", tooltip: "piso_falha_seguranca" },
        { chave: "sustentacao", rotulo: "Sustentação tecnológica", tooltip: "piso_sustentacao_tecnologica" },
        { chave: "continuidade", rotulo: "Continuidade do serviço", tooltip: "piso_continuidade_operacional" },
      ];

      // Os cinco critérios da matriz vêm da régua canônica (assets/regua.json,
      // exposta pelo Discourse em settings.theme_uploads.regua), carregada em
      // carregarDadosBase(). O fluxo só consome este array — não conhece os
      // textos dos descritores.
      let CRITERIOS = [];

      // Conteúdo dos tooltips (assets/tooltips.json), no formato { chave: texto }.
      // Preenchido por carregarTooltips(); vazio se a carga falhar (enhancement).
      let TOOLTIPS = {};

      // Versão semver da régua (regua.json → versao). Antes vinha de
      // window.REGUA.versao (script global); agora é um estado local,
      // preenchido junto com CRITERIOS.
      let reguaVersao = "desconhecida";

      const TOTAL_PASSOS = 6;

      // Rótulos dos passos (para o indicador visual / stepper).
      const PASSOS = ["Identificação", "Triagem", "Curadoria", "Pontuação", "Filtros", "Memória"];

      /* ---------------------------------------------------------------- *
       * Estado da aplicação
       * ---------------------------------------------------------------- */

      const estado = {
        passoAtual: 0, // índice 0..5
        identificacao: {
          avaliador: "",
          titulo: "",
          descricao: "",
          link: "",
          natureza: "",
          trilha: "",
          camada: "",
          dependencias: "",
          evidencia: "",
        },
        // Procedência dos dados do Passo 1 (extração automática do tópico vs.
        // manual). Não há mais cache de JSON bruto (era da chamada fetch à API
        // pública, removida nesta iteração): o raw do post vem direto da Store
        // a cada abertura do modal, não precisa ser reaproveitado.
        origem: {
          viaTopico: false,    // dados vieram do primeiro post do tópico
          url: "",             // URL do tópico de origem
          snapshot: {},        // valores logo após a carga, p/ detectar ajustes
          camposAjustados: [], // chaves de campos editados manualmente pós-carga
        },
        triagem: {
          obrigacaoLegal: false,
          determinacaoControle: false,
          seguranca: false,
          sustentacao: false,
          continuidade: false,
        },
        curadoria: {
          camadaValidada: "",
        },
        // pontuacao[chave] = nota 0..4 ou null se não pontuado.
        // As chaves são preenchidas dinamicamente a partir da régua (regua.json).
        pontuacao: {},
        // observacoes[chave] = evidência/observação livre do critério.
        observacoes: {},
        // Override do teto de Complexidade (Passo 4).
        override: {
          ativo: false,       // nota de complexidade acima do teto da camada
          nota: null,         // nota atribuída
          teto: null,         // teto da camada na hora do override
          justificativa: "",  // texto obrigatório enquanto ativo
        },
      };

      /* ---------------------------------------------------------------- *
       * Helpers
       * ---------------------------------------------------------------- */

      const $ = (sel, raiz = document) => raiz.querySelector(sel);
      const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

      function rotuloPorValor(lista, valor) {
        const item = lista.find((o) => o.valor === valor);
        return item ? item.rotulo : "(não informado)";
      }

      // Remove acentos/marcas combinantes — base para comparações tolerantes.
      function semAcento(s) {
        return (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "");
      }

      function piosAcionados() {
        return GATILHOS_PISO.filter((g) => estado.triagem[g.chave]);
      }

      function pisoAcionado() {
        return piosAcionados().length > 0;
      }

      // Teto de Complexidade pela camada validada. null se não há camada definida.
      function tetoComplexidade() {
        const c = estado.curadoria.camadaValidada;
        return Object.prototype.hasOwnProperty.call(TETOS_CAMADA, c) ? TETOS_CAMADA[c] : null;
      }

      function camadaCore() {
        return estado.curadoria.camadaValidada === "core-sei";
      }

      // Condição do filtro 0+0 (só conta notas efetivamente 0, não null).
      function condicaoConvenienciaLocal() {
        return estado.pontuacao.impacto === 0 && estado.pontuacao.ganho === 0;
      }

      // Desfecho do fluxo. Piso tem precedência sobre o filtro 0+0.
      function desfechoAtual() {
        if (pisoAcionado()) return "piso";
        if (condicaoConvenienciaLocal()) return "conveniencia-local";
        return "normal";
      }

      // Soma simples das cinco notas. Notas não pontuadas contam como 0.
      function calcularScore() {
        return CRITERIOS.reduce((soma, c) => {
          const nota = estado.pontuacao[c.chave];
          return soma + (typeof nota === "number" ? nota : 0);
        }, 0);
      }

      function todosCriteriosPontuados() {
        return CRITERIOS.every((c) => typeof estado.pontuacao[c.chave] === "number");
      }

      /* ---------------------------------------------------------------- *
       * Tooltips contextuais (ícone ⓘ + popover discreto)
       *
       * Gatilhos: hover, foco (Tab) e clique/tap. Fecham com ESC ou clique fora.
       * O conteúdo vem de tooltips.json (TOOLTIPS[chave]); aria-describedby liga
       * o ícone ao texto, lido por leitores de tela quando o ícone recebe foco.
       * ---------------------------------------------------------------- */

      let tooltipAberto = null; // só um popover aberto por vez
      let fechamentoGlobalTooltipLigado = false; // evita ligar 2x entre reaberturas do modal

      function mostrarTooltip(wrap) {
        if (tooltipAberto && tooltipAberto !== wrap) esconderTooltip(tooltipAberto, true);
        wrap.querySelector(".tip-popover").hidden = false;
        tooltipAberto = wrap;
      }

      function esconderTooltip(wrap, forcar) {
        if (!forcar && wrap.dataset.fixado) return; // mantém aberto se foi "fixado" por clique
        if (forcar) delete wrap.dataset.fixado;
        wrap.querySelector(".tip-popover").hidden = true;
        if (tooltipAberto === wrap) tooltipAberto = null;
      }

      // Cria o ícone ⓘ + popover para uma chave de tooltips.json. Retorna null
      // se não houver texto (assim, sem tooltips.json, nenhum ícone vazio é
      // renderizado).
      function criarTooltipEl(chave) {
        const texto = TOOLTIPS && TOOLTIPS[chave];
        if (!texto) return null;

        const wrap = document.createElement("span");
        wrap.className = "tip-wrap";
        const id = `tip-${chave}`;

        const icone = document.createElement("button");
        icone.type = "button";
        icone.className = "tip-icon";
        icone.tabIndex = 0;
        icone.setAttribute("aria-describedby", id);
        icone.setAttribute("aria-label", "Mais informações");
        icone.textContent = "ⓘ";

        const pop = document.createElement("div");
        pop.className = "tip-popover";
        pop.id = id;
        pop.setAttribute("role", "tooltip");
        pop.textContent = texto;
        pop.hidden = true;

        wrap.appendChild(icone);
        wrap.appendChild(pop);

        icone.addEventListener("mouseenter", () => mostrarTooltip(wrap));
        icone.addEventListener("mouseleave", () => esconderTooltip(wrap, false));
        icone.addEventListener("focus", () => mostrarTooltip(wrap));
        icone.addEventListener("blur", () => esconderTooltip(wrap, false));
        icone.addEventListener("click", (e) => {
          // Tap (mobile) e clique alternam um estado "fixado" que ignora mouseleave/blur.
          e.preventDefault();
          e.stopPropagation();
          if (wrap.dataset.fixado) {
            esconderTooltip(wrap, true);
          } else {
            wrap.dataset.fixado = "1";
            mostrarTooltip(wrap);
          }
        });

        return wrap;
      }

      // Liga ESC e clique-fora para fechar o popover aberto. Só liga uma vez:
      // como o modal pode ser aberto e fechado várias vezes na mesma sessão de
      // página (Iteração 3), sem esse guard cada reabertura empilharia mais um
      // listener global duplicado.
      function ligarFechamentoGlobalTooltip() {
        if (fechamentoGlobalTooltipLigado) return;
        fechamentoGlobalTooltipLigado = true;
        document.addEventListener("keydown", (e) => {
          if (e.key === "Escape" && tooltipAberto) esconderTooltip(tooltipAberto, true);
        });
        document.addEventListener("click", (e) => {
          if (tooltipAberto && !e.target.closest(".tip-wrap")) esconderTooltip(tooltipAberto, true);
        });
      }

      // Anexa o ícone de tooltip ao <label for="..."> de um campo.
      function tooltipNoLabel(seletorCampo, chave) {
        const campo = $(seletorCampo);
        if (!campo) return;
        const label = document.querySelector(`label[for="${campo.id}"]`);
        const el = criarTooltipEl(chave);
        if (label && el) label.appendChild(el);
      }

      // Preenche uma lista <ul> com um item por opção (rótulo + ícone de tooltip).
      // Usado para campos <select> (natureza, camada), onde cada opção tem tooltip.
      function preencherTooltipsOpcoes(seletorLista, lista) {
        const ul = $(seletorLista);
        if (!ul) return;
        ul.innerHTML = "";
        lista.forEach((item) => {
          if (!item.tooltip) return;
          const el = criarTooltipEl(item.tooltip);
          if (!el) return;
          const li = document.createElement("li");
          const nome = document.createElement("span");
          nome.textContent = item.rotulo;
          li.appendChild(nome);
          li.appendChild(el);
          ul.appendChild(li);
        });
      }

      // Aplica os tooltips dos campos estáticos e das listas de opções (Passos 1 e 3).
      // Os gatilhos do Passo 2 recebem tooltip direto em renderTriagem().
      function aplicarTooltips() {
        tooltipNoLabel("#id-dependencias", "dependencias");
        tooltipNoLabel("#id-evidencia", "evidencia");
        preencherTooltipsOpcoes("#natureza-tips", NATUREZAS);
        preencherTooltipsOpcoes("#camada-tips", CAMADAS);
      }

      /* ---------------------------------------------------------------- *
       * Construção dinâmica de campos
       * ---------------------------------------------------------------- */

      function popularSelect(select, lista, opcoesComoObjeto = true) {
        select.innerHTML = '<option value="">— selecione —</option>';
        lista.forEach((item) => {
          const valor = opcoesComoObjeto ? item.valor : item;
          const rotulo = opcoesComoObjeto ? item.rotulo : item;
          const opt = document.createElement("option");
          opt.value = valor;
          opt.textContent = rotulo;
          select.appendChild(opt);
        });
      }

      // Renderiza os blocos de gatilhos do piso (Passo 2).
      function renderTriagem() {
        const container = $("#triagem-gatilhos");
        container.innerHTML = "";
        GATILHOS_PISO.forEach((g) => {
          const id = `gatilho-${g.chave}`;
          const wrap = document.createElement("label");
          wrap.className = "checkbox-linha";
          wrap.innerHTML = `
            <input type="checkbox" id="${id}" data-gatilho="${g.chave}" />
            <span>${g.rotulo}</span>`;
          // O ícone ⓘ é conteúdo interativo dentro do label: clicar nele não
          // alterna o checkbox (o handler ainda faz stopPropagation por garantia).
          const tip = g.tooltip && criarTooltipEl(g.tooltip);
          if (tip) wrap.appendChild(tip);
          container.appendChild(wrap);
        });
      }

      // Renderiza uma descrição estruturada (intro + aspectos em lista + regra +
      // observações destacadas). Usada pelo critério Impacto institucional.
      function renderDescricaoEstruturada(bloco, d) {
        const paragrafo = (texto) => {
          const p = document.createElement("p");
          p.className = "criterio-descricao";
          p.textContent = texto;
          bloco.appendChild(p);
        };

        if (d.intro) paragrafo(d.intro);
        if (d.aspectosIntro) paragrafo(d.aspectosIntro);
        if (Array.isArray(d.aspectos) && d.aspectos.length) {
          const ul = document.createElement("ul");
          ul.className = "criterio-aspectos";
          d.aspectos.forEach((a) => {
            const li = document.createElement("li");
            li.textContent = a;
            ul.appendChild(li);
          });
          bloco.appendChild(ul);
        }
        if (d.regra) paragrafo(d.regra);
        (d.observacoes || []).forEach((obs) => {
          const p = document.createElement("p");
          p.className = "criterio-observacao";
          p.textContent = obs;
          bloco.appendChild(p);
        });
      }

      // Renderiza os cinco critérios com cinco descritores cada (Passo 4).
      function renderCriterios() {
        const container = $("#criterios");
        container.innerHTML = "";

        CRITERIOS.forEach((c) => {
          const bloco = document.createElement("fieldset");
          bloco.className = "criterio";
          bloco.dataset.criterio = c.chave;

          const escalaNota = c.invertido
            ? '<span class="tag">escala invertida — 4 = melhor</span>'
            : "";

          const legenda = document.createElement("legend");
          legenda.innerHTML = `${c.rotulo} ${escalaNota}`;
          bloco.appendChild(legenda);

          if (typeof c.descricao === "string" && c.descricao) {
            const desc = document.createElement("p");
            desc.className = "criterio-descricao";
            desc.textContent = c.descricao;
            bloco.appendChild(desc);
          } else if (c.descricao && typeof c.descricao === "object") {
            renderDescricaoEstruturada(bloco, c.descricao);
          }

          c.descritores.forEach((texto, nota) => {
            const id = `crit-${c.chave}-${nota}`;
            const linha = document.createElement("label");
            linha.className = "descritor-linha";
            linha.setAttribute("for", id);
            linha.innerHTML = `
              <input type="radio" name="crit-${c.chave}" id="${id}"
                     data-criterio="${c.chave}" value="${nota}" />
              <span class="nota-badge">${nota}</span>
              <span class="descritor-texto">${texto}</span>`;
            bloco.appendChild(linha);
          });

          // Evidência / observação livre do critério.
          const obs = document.createElement("div");
          obs.className = "campo observacao-campo";
          obs.innerHTML = `
            <label for="obs-${c.chave}">Evidência / observação (opcional)</label>
            <textarea id="obs-${c.chave}" data-observacao="${c.chave}" rows="2"
              placeholder="Métrica, relato ou justificativa que ancora a nota"></textarea>`;
          bloco.appendChild(obs);

          container.appendChild(bloco);
        });
      }

      /* ---------------------------------------------------------------- *
       * Navegação entre passos
       * ---------------------------------------------------------------- */

      function mostrarPasso(indice) {
        estado.passoAtual = Math.max(0, Math.min(TOTAL_PASSOS - 1, indice));

        $$(".passo").forEach((sec) => {
          const n = Number(sec.dataset.passo);
          sec.hidden = n !== estado.passoAtual;
        });

        // Indicador de progresso
        $("#progresso-atual").textContent = estado.passoAtual + 1;

        // Botões de navegação
        $("#btn-voltar").disabled = estado.passoAtual === 0;
        const ultimo = estado.passoAtual === TOTAL_PASSOS - 1;
        $("#btn-avancar").hidden = ultimo;

        // Atualizações específicas ao entrar em certos passos
        if (estado.passoAtual === 1) atualizarAvisoTriagem();
        if (estado.passoAtual === 2) sincronizarCuradoria();
        if (estado.passoAtual === 3) atualizarTetoComplexidade();
        if (estado.passoAtual === 4) atualizarPainelFiltros();
        if (estado.passoAtual === 5) { gerarMemoria(); atualizarDesfechoMemoria(); }

        renderStepper();
        atualizarScoreVisivel();
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      // Indicador de passos: marca o atual (aria-current) e os concluídos, e
      // permite voltar a um passo anterior (os dados ficam preservados).
      function renderStepper() {
        const lista = $("#stepper-lista");
        lista.innerHTML = "";
        PASSOS.forEach((rotulo, i) => {
          const li = document.createElement("li");
          const concluido = i < estado.passoAtual;
          const atual = i === estado.passoAtual;
          if (concluido) li.classList.add("completo");
          if (atual) li.classList.add("atual");

          const btn = document.createElement("button");
          btn.type = "button";
          btn.innerHTML = `<span class="passo-num" aria-hidden="true">${concluido ? "✓" : i + 1}</span>`
            + `<span class="passo-rotulo">${rotulo}</span>`;
          // Só permite navegar para o passo atual ou anteriores (volta sem perder dados).
          btn.disabled = i > estado.passoAtual;
          if (atual) btn.setAttribute("aria-current", "step");
          btn.setAttribute("aria-label",
            `Passo ${i + 1} de ${TOTAL_PASSOS}: ${rotulo}`
            + (atual ? " (atual)" : concluido ? " (concluído)" : ""));
          btn.addEventListener("click", () => { if (i <= estado.passoAtual) mostrarPasso(i); });

          li.appendChild(btn);
          lista.appendChild(li);
        });
      }

      /* ---------------------------------------------------------------- *
       * Sincronizações de tela
       * ---------------------------------------------------------------- */

      // O score fica visível no rodapé e no passo de pontuação. Sob ato
      // vinculado a demanda recebe score fixo de 20 (prioridade absoluta).
      function atualizarScoreVisivel() {
        const score = pisoAcionado() ? 20 : calcularScore();
        $("#score-rodape").textContent = `${score} / 20`;
        $("#score-live").textContent = `${score} / 20`;
      }

      // Passo 2 — aviso de ato vinculado. Informativo: explica o score fixo de
      // 20; o avaliador pode desmarcar para avaliar a demanda pela matriz.
      function atualizarAvisoTriagem() {
        const el = $("#triagem-aviso");
        const pisos = piosAcionados();
        if (!pisos.length) {
          el.hidden = true;
          return;
        }
        el.hidden = false;
        el.className = "aviso alerta";
        el.innerHTML =
          "<strong>Ato vinculado acionado.</strong> Demanda "
          + "enquadrada como ato vinculado — score fixo de 20 (prioridade absoluta). "
          + "A demanda entra na fila já no topo do ranking. Gatilho(s): "
          + pisos.map((p) => p.rotulo).join(", ") + ". Desmarque para avaliar pela matriz.";
      }

      // Passo 4 — aplica o teto de Complexidade pela camada validada.
      //  - Core SEI: nota fixa em 0, radios desabilitados, sem override.
      //  - Demais camadas: nota acima do teto marca override e exige justificativa.
      function atualizarTetoComplexidade() {
        const bloco = $('.criterio[data-criterio="complexidade"]');
        if (!bloco) return;

        const teto = tetoComplexidade();
        const radios = $$('input[name="crit-complexidade"]', bloco);
        const rotuloCamada = rotuloPorValor(CAMADAS, estado.curadoria.camadaValidada);
        const overlay = $("#override-complexidade");

        // Nota de teto (criada uma única vez, logo após a descrição/legenda).
        let notaEl = bloco.querySelector(".teto-nota");
        if (!notaEl) {
          notaEl = document.createElement("p");
          notaEl.className = "teto-nota";
          const ancora = bloco.querySelector(".criterio-descricao") || bloco.querySelector("legend");
          ancora.insertAdjacentElement("afterend", notaEl);
        }

        const limparMarca = () => radios.forEach((r) =>
          r.closest(".descritor-linha").classList.remove("acima-teto"));

        // Sem camada definida — sem teto a aplicar.
        if (teto === null) {
          notaEl.className = "teto-nota";
          notaEl.textContent = "Defina a camada na curadoria (Passo 3) para aplicar o teto de complexidade.";
          radios.forEach((r) => { r.disabled = false; });
          limparMarca();
          estado.override.ativo = false;
          if (overlay) overlay.hidden = true;
          return;
        }

        // Core SEI — nota fixa em 0, sem override possível.
        if (camadaCore()) {
          estado.pontuacao.complexidade = 0;
          radios.forEach((r) => {
            r.checked = Number(r.value) === 0;
            r.disabled = true;
          });
          limparMarca();
          notaEl.className = "teto-nota fixa";
          notaEl.textContent = "Camada Core SEI: Complexidade fixada em 0 (altíssima), sem possibilidade de override.";
          estado.override.ativo = false;
          if (overlay) overlay.hidden = true;
          return;
        }

        // Demais camadas — override possível acima do teto.
        notaEl.className = "teto-nota";
        notaEl.textContent =
          `Teto pela camada ${rotuloCamada}: nota máxima ${teto}. `
          + "Notas acima do teto exigem justificativa (override).";
        radios.forEach((r) => {
          r.disabled = false;
          r.closest(".descritor-linha").classList.toggle("acima-teto", Number(r.value) > teto);
        });

        const nota = estado.pontuacao.complexidade;
        const ehOverride = typeof nota === "number" && nota > teto;
        estado.override.ativo = ehOverride;

        if (ehOverride) {
          estado.override.nota = nota;
          estado.override.teto = teto;
          if (overlay) {
            overlay.hidden = false;
            $("#override-alerta").textContent =
              `Nota ${nota} está acima do teto ${teto} da camada ${rotuloCamada}. `
              + "Justifique o override para prosseguir.";
            $("#override-justificativa").value = estado.override.justificativa;
          }
        } else if (overlay) {
          overlay.hidden = true;
          const pend = $("#override-pendencia");
          if (pend) pend.hidden = true;
        }
      }

      // Passo 6 — banner de desfecho. Mostra o que aconteceu, o score e um atalho
      // para retomar o passo anterior. Não esconde a memória nem o restante.
      function atualizarDesfechoMemoria() {
        const el = $("#memoria-desfecho");
        const score = calcularScore();
        el.hidden = false;

        switch (desfechoAtual()) {
          case "piso":
            el.className = "aviso alerta";
            el.innerHTML =
              "<strong>Enquadrada por ato vinculado.</strong> Score "
              + "fixo de 20/20 (prioridade absoluta) — a demanda entra na fila já no topo "
              + "do ranking. "
              + '<button type="button" class="link" id="retomar-triagem">Voltar à triagem</button>';
            break;
          case "conveniencia-local":
            el.className = "aviso alerta";
            el.innerHTML =
              "<strong>Fluxo encerrado por filtro automático.</strong> Demanda "
              + "tratada como conveniência estritamente local — não disputa fila, e é "
              + "encaminhada à camada de uso local. Score apurado: " + score + "/20. "
              + '<button type="button" class="link" id="retomar-pontuacao">Voltar à pontuação</button>';
            break;
          default:
            el.className = "aviso ok";
            el.innerHTML =
              "<strong>Avaliação completa pela matriz.</strong> Score final: "
              + score + "/20.";
        }
      }

      // Passo 3 herda a camada proposta no Passo 1 como ponto de partida.
      function sincronizarCuradoria() {
        const select = $("#curadoria-camada");
        if (!estado.curadoria.camadaValidada) {
          estado.curadoria.camadaValidada = estado.identificacao.camada;
        }
        select.value = estado.curadoria.camadaValidada || "";
        $("#curadoria-proposta").textContent =
          rotuloPorValor(CAMADAS, estado.identificacao.camada);
      }

      // Passo 5 — filtro 0+0. Aciona o desfecho "conveniência local" e mostra
      // mensagem informativa com o score parcial.
      function atualizarPainelFiltros() {
        const impacto = estado.pontuacao.impacto;
        const ganho = estado.pontuacao.ganho;
        $("#filtro-impacto").textContent = impacto === null ? "—" : impacto;
        $("#filtro-ganho").textContent = ganho === null ? "—" : ganho;

        const alvo = $("#filtro-status");
        if (impacto === null || ganho === null) {
          alvo.textContent = "Pontue impacto institucional e ganho operacional para avaliar o filtro.";
          alvo.className = "aviso neutro";
        } else if (condicaoConvenienciaLocal()) {
          alvo.textContent =
            "Filtro acionado — Demanda tratada como conveniência estritamente local "
            + "— não disputa fila, e é encaminhada à camada de uso local. Score "
            + "parcial: " + calcularScore() + "/20. Volte à pontuação se classificou errado.";
          alvo.className = "aviso alerta";
        } else {
          alvo.textContent = "Filtro não acionado — a demanda segue para a memória de cálculo com o score apurado.";
          alvo.className = "aviso ok";
        }
      }

      /* ---------------------------------------------------------------- *
       * Integração com o ParticiPEN (Discourse)
       *
       * ADAPTAÇÃO desta iteração: o protótipo standalone (e as duas
       * primeiras iterações do theme component) liam o tópico via fetch à
       * API pública ({base}/t/{id}.json), sujeita a CORS e a um campo de URL
       * preenchido à mão. Isso saiu por completo — o parser
       * (parseFormTemplateBody) agora só recebe o `raw` markdown do primeiro
       * post, já obtido pela Store do Discourse em abrirCalculadoraParaTopico().
       * Nenhuma chamada de rede acontece aqui.
       * ---------------------------------------------------------------- */

      // Campos do Passo 1 que podem vir do tópico (para snapshot/ajustes).
      // Dependências saiu do Form Template do ParticiPEN — a GPSEI coleta na curadoria.
      const CAMPOS_TOPICO = ["titulo", "descricao", "natureza", "trilha", "camada", "evidencia"];

      const ROTULOS_CAMPO = {
        titulo: "Título",
        descricao: "Descrição",
        natureza: "Natureza",
        trilha: "Trilha",
        camada: "Camada proposta",
        dependencias: "Dependências",
        evidencia: "Evidência",
      };

      // Form Template do ParticiPEN (Discourse): o corpo do post vem em cabeçalhos
      // (### Pergunta) com o texto literal de cada pergunta, e a resposta na(s)
      // linha(s) seguinte(s). Mapeia cabeçalho → campo; `tipo` indica a tradução.
      const PERGUNTAS_TEMPLATE = [
        { pergunta: "Título da demanda", campo: "titulo", tipo: "texto" },
        { pergunta: "O que você está trazendo?", campo: "natureza", tipo: "natureza" },
        { pergunta: "O que você gostaria que mudasse?", campo: "trilha", tipo: "trilha" },
        { pergunta: "Descreva a demanda apresentada", campo: "descricao", tipo: "texto" },
        { pergunta: "Quem se beneficia da sua demanda?", campo: "camada", tipo: "camada" },
        { pergunta: "Evidências", campo: "evidencia", tipo: "texto" },
        { pergunta: "Anexos", campo: "anexos", tipo: "ignorar" },
      ];

      // Tradução das respostas em linguagem natural → valor canônico da calculadora.
      // A comparação é normalizada (sem acento, minúsculas, espaços colapsados), então
      // as chaves podem ser escritas aqui na forma natural exibida no Form Template.
      const TRAD_NATUREZA = {
        "Um problema a resolver": "problema",
        "Uma prática em uso, a difundir": "pratica",
      };
      const TRAD_TRILHA = {
        "Quero melhorar algo que já existe, mas pode ficar melhor": "Melhoria",
        "Quero acrescentar uma funcionalidade que ainda não existe no SEI": "Evolutiva",
        "Quero mudar uma regra, um padrão ou uma orientação de como o SEI deve ser usado": "Normativa",
      };
      const TRAD_CAMADA = {
        "Só o meu órgão, nas rotinas de trabalho daqui": "uso-local",
        "Alguns poucos órgãos que vivem contexto parecido com o meu": "grupo",
        "Muitos órgãos que usam o SEI": "vitrine",
        "Praticamente todos os órgãos da Administração Pública Federal": "modulo-pen",
        "Isso deveria ser parte do SEI": "core-sei",
      };

      // Normaliza para comparação tolerante: sem acento, minúsculas, espaços colapsados.
      function normalizaTexto(s) {
        return semAcento(String(s || "")).toLowerCase().replace(/\s+/g, " ").trim();
      }

      // Procura, numa tabela de tradução, o valor canônico para uma resposta natural.
      function traduzirResposta(tabela, resposta) {
        const alvo = normalizaTexto(resposta);
        for (const [chaveNatural, valor] of Object.entries(tabela)) {
          if (normalizaTexto(chaveNatural) === alvo) return valor;
        }
        return "";
      }

      // Quebra o markdown RAW de um post em seções por cabeçalho ATX (`#` a
      // `######`): [{ titulo, conteudo }]. O conteúdo é o texto das linhas
      // seguintes até o próximo cabeçalho. Único parser de seções desta
      // iteração — não há mais variante para HTML "cooked" (essa dependia do
      // fetch à API pública, removido).
      function extrairSecoesPorCabecalhoRaw(raw) {
        const linhas = (raw || "").split(/\r?\n/);
        const ehCabecalho = (linha) => linha.match(/^#{1,6}\s+(.*)$/);
        const secoes = [];
        let atual = null;
        linhas.forEach((linha) => {
          const m = ehCabecalho(linha);
          if (m) {
            atual = { titulo: m[1].replace(/\s+/g, " ").trim(), linhas: [] };
            secoes.push(atual);
          } else if (atual) {
            const t = linha.trim();
            if (t) atual.linhas.push(t);
          }
        });
        return secoes.map((s) => ({ titulo: s.titulo, conteudo: s.linhas.join("\n").trim() }));
      }

      // Casa uma lista de seções {titulo, conteudo} (vinda de
      // extrairSecoesPorCabecalhoRaw) com PERGUNTAS_TEMPLATE, produzindo os
      // campos do Passo 1.
      function casarCamposComSecoes(secoes, tituloFallback) {
        const r = {
          titulo: "", descricao: "", natureza: "", trilha: "", camada: "", evidencia: "",
          encontrados: [], naoReconhecidos: [], ausentes: [], temAnexos: false,
          semCabecalhos: false,
        };
        if (!secoes.length) { r.semCabecalhos = true; return r; }

        const tabelaDe = (tipo) => (tipo === "natureza" ? TRAD_NATUREZA
          : tipo === "trilha" ? TRAD_TRILHA
            : tipo === "camada" ? TRAD_CAMADA : null);

        PERGUNTAS_TEMPLATE.forEach((q) => {
          const alvo = normalizaTexto(q.pergunta);
          const sec = secoes.find((s) => normalizaTexto(s.titulo).includes(alvo));

          if (q.tipo === "ignorar") { // Anexos: não importar, só sinalizar
            if (sec && sec.conteudo) r.temAnexos = true;
            return;
          }
          if (!sec || !sec.conteudo.trim()) { r.ausentes.push(q.campo); return; }

          const resposta = sec.conteudo.trim();
          if (q.tipo === "texto") {
            r[q.campo] = resposta;
            r.encontrados.push(q.campo);
          } else {
            const valor = traduzirResposta(tabelaDe(q.tipo), resposta);
            if (valor) { r[q.campo] = valor; r.encontrados.push(q.campo); }
            else r.naoReconhecidos.push(q.campo);
          }
        });

        // Fallback do título: se o cabeçalho não trouxe, usa o título do tópico.
        if (!r.titulo && tituloFallback) {
          r.titulo = String(tituloFallback).trim();
          if (r.titulo) {
            r.encontrados.push("titulo");
            r.ausentes = r.ausentes.filter((c) => c !== "titulo");
          }
        }

        return r;
      }

      // Função pura: do markdown raw do primeiro post do tópico (obtido pela
      // Store do Discourse em abrirCalculadoraParaTopico) para os campos do
      // Passo 1 — é o parser do Form Template do ParticiPEN (Patch 4),
      // reescrito nesta iteração para não depender mais de fetch/JSON.
      function parseFormTemplateBody(raw, tituloTopico) {
        const secoes = extrairSecoesPorCabecalhoRaw(raw);
        return casarCamposComSecoes(secoes, tituloTopico);
      }

      function mostrarAvisoTopico(tipo, msg) {
        const el = $("#topico-aviso");
        el.hidden = false;
        el.className = "aviso " + (tipo === "ok" ? "ok" : tipo === "erro" ? "alerta" : "neutro");
        el.textContent = msg;
      }

      function snapshotIdentificacao() {
        const snap = {};
        CAMPOS_TOPICO.forEach((c) => { snap[c] = estado.identificacao[c] || ""; });
        return snap;
      }

      // Recalcula quais campos foram editados manualmente após a carga do tópico.
      function recomputarAjustes() {
        if (!estado.origem.viaTopico) return;
        estado.origem.camposAjustados = CAMPOS_TOPICO
          .filter((c) => (estado.identificacao[c] || "") !== (estado.origem.snapshot[c] || ""));
      }

      function origemDosDados() {
        if (!estado.origem.viaTopico) return "preenchimento manual";
        return estado.origem.camposAjustados.length
          ? "tópico Discourse + ajuste manual"
          : "tópico Discourse";
      }

      // Escreve no estado e na interface os campos extraídos (só os encontrados).
      function popularIdentificacao(campos) {
        const aplicar = (chave, sel) => {
          if (!campos[chave]) return;
          estado.identificacao[chave] = campos[chave];
          const el = $(sel);
          if (el) el.value = campos[chave];
        };
        aplicar("titulo", "#id-titulo");
        aplicar("descricao", "#id-descricao");
        aplicar("natureza", "#id-natureza");
        aplicar("trilha", "#id-trilha");
        aplicar("camada", "#id-camada");
        aplicar("evidencia", "#id-evidencia");
        // Sincroniza a curadoria com a camada carregada, se ainda não tocada.
        if (campos.camada && !estado.curadoria.camadaValidada) {
          estado.curadoria.camadaValidada = campos.camada;
        }
      }

      // Aplica os campos extraídos do raw markdown do post (parseFormTemplateBody)
      // ao Passo 1 e gera o aviso correspondente — sucesso liso, sucesso
      // parcial (campos ausentes/não reconhecidos, com a mensagem de
      // fallback graceful do Patch 4) ou falha total (sem cabeçalhos
      // reconhecíveis). Chamada uma vez por abertura do modal, em
      // abrirCalculadoraParaTopico(); não há mais recarregar/re-extrair —
      // reabrir o modal já refaz a extração do zero.
      function aplicarCamposDoTopico(campos, url) {
        if (campos.semCabecalhos) {
          mostrarAvisoTopico("erro",
            "Este tópico não está no formato esperado pelo Form Template do "
            + "ParticiPEN. Preencha os campos manualmente.");
          return;
        }

        popularIdentificacao(campos);
        estado.origem.viaTopico = true;
        estado.origem.url = url;
        estado.origem.snapshot = snapshotIdentificacao();
        estado.origem.camposAjustados = [];
        atualizarScoreVisivel();

        // Avisos de falha graceful (campos ausentes / respostas não reconhecidas).
        const partes = [];
        if (campos.ausentes.length) {
          partes.push("Não detectados (preencha manualmente): "
            + campos.ausentes.map((c) => ROTULOS_CAMPO[c] || c).join(", ") + ".");
        }
        if (campos.naoReconhecidos.length) {
          partes.push("Respostas não reconhecidas (preencha manualmente): "
            + campos.naoReconhecidos.map((c) => ROTULOS_CAMPO[c] || c).join(", ") + ".");
        }
        if (campos.temAnexos) partes.push("Há anexos — ver no tópico original.");

        if (!partes.length) {
          mostrarAvisoTopico("ok", "Campos carregados automaticamente deste tópico (Form Template do ParticiPEN).");
        } else {
          mostrarAvisoTopico(campos.encontrados.length ? "neutro" : "erro",
            (campos.encontrados.length
              ? "Campos carregados do tópico. "
              : "Pouca coisa pôde ser extraída. ") + partes.join(" "));
        }
      }

      /* ---------------------------------------------------------------- *
       * Carregar exemplo / memória salva (JSON)
       *
       * aplicarMemoria() é o inverso de montarMemoria(): recebe um objeto de
       * memória de cálculo (formato da Iteração 4) e reidrata o fluxo inteiro.
       * ---------------------------------------------------------------- */

      function mostrarAvisoExemplo(tipo, msg) {
        const el = $("#exemplo-aviso");
        el.hidden = false;
        el.className = "aviso " + (tipo === "ok" ? "ok" : tipo === "erro" ? "alerta" : "neutro");
        el.textContent = msg;
      }

      // Empurra o estado para os campos do formulário (DOM).
      function sincronizarFormularioComEstado() {
        const setVal = (sel, v) => { const el = $(sel); if (el) el.value = v || ""; };
        setVal("#id-avaliador", estado.identificacao.avaliador);
        setVal("#id-titulo", estado.identificacao.titulo);
        setVal("#id-descricao", estado.identificacao.descricao);
        setVal("#id-link", estado.identificacao.link);
        setVal("#id-natureza", estado.identificacao.natureza);
        setVal("#id-trilha", estado.identificacao.trilha);
        setVal("#id-camada", estado.identificacao.camada);
        setVal("#id-dependencias", estado.identificacao.dependencias);
        setVal("#id-evidencia", estado.identificacao.evidencia);
        setVal("#curadoria-camada", estado.curadoria.camadaValidada);

        GATILHOS_PISO.forEach((g) => {
          const el = $(`#gatilho-${g.chave}`);
          if (el) el.checked = !!estado.triagem[g.chave];
        });

        CRITERIOS.forEach((c) => {
          const nota = estado.pontuacao[c.chave];
          $$(`input[name="crit-${c.chave}"]`).forEach((r) => {
            r.checked = Number(r.value) === nota;
          });
          const obs = $(`#obs-${c.chave}`);
          if (obs) obs.value = estado.observacoes[c.chave] || "";
        });

        const oj = $("#override-justificativa");
        if (oj) oj.value = estado.override.justificativa || "";
      }

      // Reidrata o estado a partir de um objeto de memória de cálculo.
      function aplicarMemoria(m) {
        if (!m || typeof m !== "object" || !m.identificacao) {
          throw new Error("estrutura de memória de cálculo não reconhecida");
        }
        const id = m.identificacao;

        estado.identificacao.avaliador = (m.avaliador && m.avaliador !== "não informado") ? m.avaliador : "";
        estado.identificacao.titulo = id.titulo || "";
        estado.identificacao.descricao = id.descricao || "";
        estado.identificacao.link = id.linkPublico || "";
        estado.identificacao.natureza = (id.natureza && id.natureza.valor) || "";
        estado.identificacao.trilha = id.trilha || "";
        estado.identificacao.camada = (id.camadaProposta && id.camadaProposta.valor) || "";
        estado.identificacao.dependencias = id.dependencias || "";
        estado.identificacao.evidencia = id.evidencia || "";

        GATILHOS_PISO.forEach((g) => { estado.triagem[g.chave] = false; });
        ((m.triagem && m.triagem.gatilhos) || []).forEach((g) => {
          if (g && Object.prototype.hasOwnProperty.call(estado.triagem, g.chave)) {
            estado.triagem[g.chave] = !!g.marcado;
          }
        });

        estado.curadoria.camadaValidada =
          (m.curadoria && m.curadoria.camadaValidada && m.curadoria.camadaValidada.valor)
          || estado.identificacao.camada || "";

        CRITERIOS.forEach((c) => { estado.pontuacao[c.chave] = null; estado.observacoes[c.chave] = ""; });
        (m.criterios || []).forEach((cr) => {
          if (cr && Object.prototype.hasOwnProperty.call(estado.pontuacao, cr.chave)) {
            estado.pontuacao[cr.chave] = typeof cr.nota === "number" ? cr.nota : null;
            estado.observacoes[cr.chave] = cr.observacao || "";
          }
        });

        estado.override = { ativo: false, nota: null, teto: null, justificativa: "" };
        const ov = (m.overrides || []).find((o) => o && o.criterio === "complexidade");
        if (ov) {
          estado.override = {
            ativo: true, nota: ov.nota, teto: ov.teto, justificativa: ov.justificativa || "",
          };
        }

        // Procedência. camposAjustadosManualmente é salvo como rótulos; remapeia p/ chaves.
        const viaTopico = !!m.origemDosDados && m.origemDosDados !== "preenchimento manual";
        const chavePorRotulo = Object.fromEntries(
          Object.entries(ROTULOS_CAMPO).map(([k, v]) => [v, k]),
        );
        estado.origem.viaTopico = viaTopico;
        estado.origem.url = m.urlTopico || "";
        estado.origem.camposAjustados = viaTopico
          ? (m.camposAjustadosManualmente || []).map((r) => chavePorRotulo[r]).filter(Boolean)
          : [];
        estado.origem.snapshot = snapshotIdentificacao();

        sincronizarFormularioComEstado();
        mostrarPasso(0);
      }

      // Lê um arquivo JSON selecionado e reidrata o fluxo.
      function carregarExemploArquivo(file) {
        const reader = new FileReader();
        reader.onload = () => {
          try {
            const m = JSON.parse(reader.result);
            aplicarMemoria(m);
            const titulo = (m.identificacao && m.identificacao.titulo) || "(sem título)";
            mostrarAvisoExemplo("ok", `Exemplo carregado: ${titulo}. Navegue pelos passos para revisar.`);
          } catch (e) {
            mostrarAvisoExemplo("erro", "JSON inválido ou incompatível: " + e.message);
          }
        };
        reader.onerror = () => mostrarAvisoExemplo("erro", "Falha ao ler o arquivo.");
        reader.readAsText(file, "utf-8");
      }

      /* ---------------------------------------------------------------- *
       * Memória de cálculo — um objeto interno, dois formatos
       *
       * montarMemoria() devolve o objeto completo. memoriaParaMarkdown() e
       * memoriaParaJSON() derivam dele — a paridade é garantida por construção.
       * ---------------------------------------------------------------- */

      let memoriaAtual = null; // último objeto montado, reusado por copiar/baixar

      function rotuloDesfecho(codigo) {
        if (codigo === "piso") return "Ato vinculado";
        if (codigo === "conveniencia-local") return "Conveniência estritamente local";
        return "Avaliação completa pela matriz";
      }

      function mensagemDesfecho(codigo) {
        if (codigo === "piso") {
          return "Demanda enquadrada como ato vinculado — score fixo "
            + "de 20 (prioridade absoluta). A demanda entra na fila já no topo do ranking.";
        }
        if (codigo === "conveniencia-local") {
          return "Demanda tratada como conveniência estritamente local — não disputa "
            + "fila, e é encaminhada à camada de uso local.";
        }
        return "Avaliação completa pela matriz.";
      }

      // Timestamp ISO 8601 no fuso horário local, com precisão de segundos (sem
      // milissegundos). Ex.: 2026-06-23T18:42:58-03:00
      function timestampLocal(d = new Date()) {
        const pad = (n) => String(n).padStart(2, "0");
        const offMin = -d.getTimezoneOffset(); // minutos em relação a UTC (+ a leste)
        const sinal = offMin >= 0 ? "+" : "-";
        const abs = Math.abs(offMin);
        const offset = `${sinal}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
          + `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offset}`;
      }

      // Constrói o objeto-fonte da memória de cálculo. Tudo que aparece no
      // Markdown ou no JSON sai daqui.
      function montarMemoria() {
        const id = estado.identificacao;
        const desfecho = desfechoAtual();
        const pisos = piosAcionados();
        const teto = tetoComplexidade();
        const overrideAtivo = desfecho !== "piso" && estado.override.ativo;

        // Sob piso a demanda recebe score fixo de 20 (prioridade absoluta); os
        // cinco critérios não são pontuados.
        const ehPiso = desfecho === "piso";
        const scoreTotal = ehPiso ? 20 : calcularScore();

        const criterios = CRITERIOS.map((c) => {
          const notaBruta = estado.pontuacao[c.chave];
          const pontuado = desfecho !== "piso" && typeof notaBruta === "number";
          return {
            chave: c.chave,
            rotulo: c.rotulo,
            invertido: !!c.invertido,
            nota: pontuado ? notaBruta : null,
            descritor: pontuado ? c.descritores[notaBruta] : null,
            observacao: (estado.observacoes[c.chave] || "").trim(),
          };
        });

        const overrides = [];
        if (overrideAtivo) {
          overrides.push({
            criterio: "complexidade",
            rotulo: "Complexidade",
            nota: estado.override.nota,
            teto: estado.override.teto,
            camada: {
              valor: estado.curadoria.camadaValidada,
              rotulo: rotuloPorValor(CAMADAS, estado.curadoria.camadaValidada),
            },
            justificativa: estado.override.justificativa.trim(),
          });
        }

        return {
          versaoRegua: reguaVersao,
          timestamp: timestampLocal(), // ISO 8601 (fuso local, precisão de segundos)
          avaliador: id.avaliador.trim() || "não informado",
          origemDosDados: origemDosDados(),
          urlTopico: estado.origem.viaTopico ? estado.origem.url : null,
          camposAjustadosManualmente: estado.origem.viaTopico
            ? estado.origem.camposAjustados.map((c) => ROTULOS_CAMPO[c] || c)
            : [],
          pisoAcionado: ehPiso,
          pisoJustificativa: ehPiso && pisos.length ? pisos[0].chave : null,
          desfecho: {
            codigo: desfecho,
            rotulo: rotuloDesfecho(desfecho),
            mensagem: mensagemDesfecho(desfecho),
          },
          identificacao: {
            titulo: id.titulo.trim(),
            descricao: id.descricao.trim(),
            linkPublico: id.link.trim(),
            natureza: { valor: id.natureza, rotulo: rotuloPorValor(NATUREZAS, id.natureza) },
            trilha: id.trilha,
            camadaProposta: { valor: id.camada, rotulo: rotuloPorValor(CAMADAS, id.camada) },
            dependencias: id.dependencias.trim(),
            evidencia: id.evidencia.trim(),
          },
          triagem: {
            pisoAcionado: pisos.length > 0,
            gatilhos: GATILHOS_PISO.map((g) => ({
              chave: g.chave,
              rotulo: g.rotulo,
              marcado: !!estado.triagem[g.chave],
            })),
          },
          curadoria: {
            camadaValidada: {
              valor: estado.curadoria.camadaValidada,
              rotulo: rotuloPorValor(CAMADAS, estado.curadoria.camadaValidada),
            },
            tetoComplexidade: teto,
          },
          criterios,
          filtros: {
            pisoObrigatorio: {
              acionado: desfecho === "piso",
              passo: 2,
              gatilhos: pisos.map((p) => p.rotulo),
            },
            convenienciaLocal: {
              acionado: desfecho === "conveniencia-local",
              passo: 5,
            },
          },
          overrides,
          score: { total: scoreTotal, maximo: 20, texto: `${scoreTotal}/20` },
        };
      }

      // Markdown estruturado, para colar no Discourse/ParticiPEN.
      function memoriaParaMarkdown(m) {
        const ni = (v) => (v && String(v).trim() ? v : "(não informado)");

        const blocosCriterios = m.criterios.map((c) => {
          const escala = c.invertido ? " _(escala invertida — 4 = melhor)_" : "";
          const nota = c.nota === null ? "não pontuado" : String(c.nota);
          const descritor = c.descritor === null ? "—" : c.descritor;
          const obs = c.observacao || "(não informada)";
          const ovr = m.overrides.find((o) => o.criterio === c.chave);
          const linhaOvr = ovr
            ? `\n- **Override de teto:** nota ${ovr.nota} acima do teto ${ovr.teto} (camada ${ovr.camada.rotulo})`
            : "";
          return `### ${c.rotulo}${escala}\n`
            + `- **Nota:** ${nota}\n`
            + `- **Descritor:** ${descritor}\n`
            + `- **Evidência/observação:** ${obs}${linhaOvr}`;
        }).join("\n\n");

        const acionados = [];
        if (m.filtros.pisoObrigatorio.acionado) {
          acionados.push(
            `Ato vinculado (Passo ${m.filtros.pisoObrigatorio.passo}): `
            + m.filtros.pisoObrigatorio.gatilhos.join(", "),
          );
        }
        if (m.filtros.convenienciaLocal.acionado) {
          acionados.push(`Conveniência estritamente local (Passo ${m.filtros.convenienciaLocal.passo})`);
        }
        const filtrosTexto = acionados.length ? acionados.join("; ") : "Nenhum";

        const overridesTexto = m.overrides.length
          ? m.overrides.map((o) =>
              `${o.rotulo}: nota ${o.nota} acima do teto ${o.teto} (camada ${o.camada.rotulo}) `
              + `— justificativa: "${o.justificativa}"`).join("; ")
          : "Nenhum";

        let tetoTxt;
        if (m.curadoria.tetoComplexidade === null) tetoTxt = "(camada não definida)";
        else if (m.curadoria.camadaValidada.valor === "core-sei") tetoTxt = "0 (fixo, sem override)";
        else tetoTxt = String(m.curadoria.tetoComplexidade);

        const pisoLinha = m.triagem.pisoAcionado
          ? `acionado (${m.filtros.pisoObrigatorio.gatilhos.join(", ")})`
          : "não acionado";
        const gatilhosLinhas = m.triagem.gatilhos
          .map((g) => `  - ${g.rotulo}: ${g.marcado ? "sim" : "não"}`)
          .join("\n");

        const ajustadosTexto = m.camposAjustadosManualmente.length
          ? m.camposAjustadosManualmente.join(", ")
          : "(nenhum)";

        // Sob ato vinculado não há pontuação: a seção de critérios dá lugar a um
        // bloco de enquadramento com o score fixo.
        const rodapeMeta =
          `- **Timestamp (ISO 8601):** ${m.timestamp}\n`
          + `- **Avaliador:** ${m.avaliador}\n`
          + `- **Versão da régua:** ${m.versaoRegua}`;

        let corpoFinal;
        if (m.pisoAcionado) {
          const gatilhosAcionados = m.triagem.gatilhos.filter((g) => g.marcado).map((g) => g.rotulo);
          corpoFinal = `## Enquadramento por ato vinculado
- **Gatilho(s) acionado(s):** ${gatilhosAcionados.join(", ") || "—"}
- **Score:** ${m.score.texto} (fixo, prioridade absoluta)
${rodapeMeta}`;
        } else {
          corpoFinal = `## Critérios

${blocosCriterios}

## Resultado
- **Score total:** ${m.score.texto}
- **Filtros acionados:** ${filtrosTexto}
- **Overrides de teto:** ${overridesTexto}
${rodapeMeta}`;
        }

        return `# Memória de cálculo — Matriz de priorização do SEI

## Origem dos dados
- **Origem:** ${m.origemDosDados}
- **URL do tópico:** ${m.urlTopico || "(não aplicável)"}
- **Campos ajustados manualmente:** ${ajustadosTexto}

## Identificação da demanda
- **Título:** ${ni(m.identificacao.titulo)}
- **Descrição:** ${ni(m.identificacao.descricao)}
- **Link público:** ${ni(m.identificacao.linkPublico)}
- **Natureza do input:** ${m.identificacao.natureza.rotulo}
- **Trilha:** ${ni(m.identificacao.trilha)}
- **Camada proposta:** ${m.identificacao.camadaProposta.rotulo}
- **Dependências:** ${ni(m.identificacao.dependencias)}
- **Evidência:** ${ni(m.identificacao.evidencia)}

## Triagem e curadoria
- **Gatilhos do ato vinculado:**
${gatilhosLinhas}
- **Ato vinculado:** ${pisoLinha}
- **Camada validada:** ${m.curadoria.camadaValidada.rotulo}
- **Teto de complexidade pela camada:** ${tetoTxt}

## Desfecho
**${m.desfecho.rotulo}** — ${m.desfecho.mensagem}

${corpoFinal}
`;
      }

      function memoriaParaJSON(m) {
        return JSON.stringify(m, null, 2);
      }

      // (Re)monta a memória e exibe o Markdown na textarea.
      function gerarMemoria() {
        memoriaAtual = montarMemoria();
        $("#memoria-saida").value = memoriaParaMarkdown(memoriaAtual);
      }

      /* ---------------------------------------------------------------- *
       * Saídas: copiar Markdown e baixar JSON
       * ---------------------------------------------------------------- */

      function slugify(texto) {
        const base = semAcento(texto)
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, "")
          .slice(0, 60);
        return base || "sem-titulo";
      }

      function nomeArquivoJSON(m) {
        const slug = slugify(m.identificacao.titulo);
        // Timestamp seguro para nome de arquivo (data e hora locais, sem fuso): 2026-06-23T18-42-58
        const ts = m.timestamp
          .replace(/(?:Z|[+-]\d{2}:\d{2})$/, "") // remove o fuso (offset ou Z)
          .replace(/\.\d+/, "")                  // remove milissegundos, se houver
          .replace(/:/g, "-");
        return `memoria-${slug}-${ts}.json`;
      }

      function flash(msg, ms = 3000) {
        const feedback = $("#copia-feedback");
        feedback.textContent = msg;
        setTimeout(() => { feedback.textContent = ""; }, ms);
      }

      async function copiarMarkdown() {
        if (!memoriaAtual) gerarMemoria();
        const texto = $("#memoria-saida").value;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(texto);
          } else {
            // Fallback para contextos sem Clipboard API
            const ta = $("#memoria-saida");
            ta.focus();
            ta.select();
            document.execCommand("copy");
          }
          flash("Markdown copiado!");
        } catch (e) {
          flash("Não foi possível copiar automaticamente — selecione e copie manualmente.");
        }
      }

      function baixarJSON() {
        if (!memoriaAtual) gerarMemoria();
        const json = memoriaParaJSON(memoriaAtual);
        const nome = nomeArquivoJSON(memoriaAtual);
        // Blob a partir de string JS é codificado em UTF-8 (sem BOM).
        const blob = new Blob([json], { type: "application/json;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nome;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        flash("JSON baixado: " + nome, 4000);
      }

      /* ---------------------------------------------------------------- *
       * Ligações de eventos
       * ---------------------------------------------------------------- */

      function ligarEventos() {
        // Passo 1 — carregar exemplo / memória salva (JSON)
        $("#id-exemplo-file").addEventListener("change", (e) => {
          if (e.target.files && e.target.files[0]) carregarExemploArquivo(e.target.files[0]);
        });

        // Passo 1 — identificação. Campos derivados do tópico chamam
        // recomputarAjustes() para registrar edições manuais pós-carga.
        $("#id-avaliador").addEventListener("input", (e) => {
          estado.identificacao.avaliador = e.target.value;
        });
        $("#id-titulo").addEventListener("input", (e) => {
          estado.identificacao.titulo = e.target.value;
          recomputarAjustes();
        });
        $("#id-descricao").addEventListener("input", (e) => {
          estado.identificacao.descricao = e.target.value;
          recomputarAjustes();
        });
        $("#id-link").addEventListener("input", (e) => {
          estado.identificacao.link = e.target.value;
        });
        $("#id-natureza").addEventListener("change", (e) => {
          estado.identificacao.natureza = e.target.value;
          recomputarAjustes();
        });
        $("#id-trilha").addEventListener("change", (e) => {
          estado.identificacao.trilha = e.target.value;
          recomputarAjustes();
        });
        $("#id-camada").addEventListener("change", (e) => {
          estado.identificacao.camada = e.target.value;
          // Se a curadoria ainda não foi tocada, mantém em sincronia.
          if (!estado.curadoria.camadaValidada) {
            estado.curadoria.camadaValidada = e.target.value;
          }
          recomputarAjustes();
        });
        $("#id-dependencias").addEventListener("input", (e) => {
          estado.identificacao.dependencias = e.target.value;
          recomputarAjustes();
        });
        $("#id-evidencia").addEventListener("input", (e) => {
          estado.identificacao.evidencia = e.target.value;
          recomputarAjustes();
        });

        // Passo 2 — triagem (delegação de evento)
        $("#triagem-gatilhos").addEventListener("change", (e) => {
          const chave = e.target.dataset.gatilho;
          if (chave) {
            estado.triagem[chave] = e.target.checked;
            atualizarAvisoTriagem();
            atualizarScoreVisivel();
          }
        });

        // Passo 3 — curadoria
        $("#curadoria-camada").addEventListener("change", (e) => {
          estado.curadoria.camadaValidada = e.target.value;
        });

        // Passo 4 — pontuação (delegação de evento)
        $("#criterios").addEventListener("change", (e) => {
          const chave = e.target.dataset.criterio;
          if (!chave) return;
          estado.pontuacao[chave] = Number(e.target.value);
          if (chave === "complexidade") atualizarTetoComplexidade();
          atualizarScoreVisivel();
        });

        // Passo 4 — evidência/observação por critério (delegação de evento)
        $("#criterios").addEventListener("input", (e) => {
          const chave = e.target.dataset.observacao;
          if (chave) estado.observacoes[chave] = e.target.value;
        });

        // Passo 4 — justificativa do override
        $("#override-justificativa").addEventListener("input", (e) => {
          estado.override.justificativa = e.target.value;
          if (e.target.value.trim()) $("#override-pendencia").hidden = true;
        });

        // Navegação
        $("#btn-avancar").addEventListener("click", avancar);
        $("#btn-voltar").addEventListener("click", voltar);

        // Passo 6 — atalhos de retomada no banner de desfecho (delegação)
        $("#memoria-desfecho").addEventListener("click", (e) => {
          if (e.target.id === "retomar-triagem") mostrarPasso(1);
          if (e.target.id === "retomar-pontuacao") mostrarPasso(3);
        });

        // Passo 6 — saídas
        $("#btn-copiar-md").addEventListener("click", copiarMarkdown);
        $("#btn-baixar-json").addEventListener("click", baixarJSON);
        $("#btn-regenerar").addEventListener("click", () => { gerarMemoria(); atualizarDesfechoMemoria(); });
      }

      /* ---------------------------------------------------------------- *
       * Navegação com regras de fluxo
       * ---------------------------------------------------------------- */

      // Avança respeitando: trava do override (Passo 4) e salto do piso (Passo 2).
      function avancar() {
        const atual = estado.passoAtual;

        // Passo 4 — override sem justificativa não avança.
        if (atual === 3 && estado.override.ativo && !estado.override.justificativa.trim()) {
          const pend = $("#override-pendencia");
          if (pend) pend.hidden = false;
          return;
        }

        // Passo 2 — ato vinculado pula a pontuação e vai direto à memória
        // (score fixo de 20, prioridade absoluta).
        if (atual === 1 && pisoAcionado()) {
          mostrarPasso(5);
          return;
        }

        mostrarPasso(atual + 1);
      }

      // Volta respeitando o bypass: da memória, se chegou por piso, retorna à triagem.
      function voltar() {
        const atual = estado.passoAtual;
        if (atual === 5 && pisoAcionado()) {
          mostrarPasso(1);
          return;
        }
        mostrarPasso(atual - 1);
      }

      /* ---------------------------------------------------------------- *
       * Carregamento dos dados-base (régua + tooltips)
       *
       * ADAPTAÇÃO relevante: no protótipo standalone, regua.js/tooltips.js
       * eram carregados injetando um <script> clássico que expunha um objeto
       * global (window.REGUA/window.TOOLTIPS) — truque para contornar o
       * bloqueio de fetch/import em file://. Como theme component, os dados
       * já são assets HTTP normais do Discourse (declarados em about.json,
       * expostos em settings.theme_uploads.<nome>), então o truque de script
       * global não faz mais sentido: carregamos com fetch() + JSON, como em
       * qualquer app web comum.
       * ---------------------------------------------------------------- */

      async function carregarRegua() {
        const resp = await fetch(settings.theme_uploads.regua);
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const regua = await resp.json();
        if (!regua || !Array.isArray(regua.criterios)) {
          throw new Error("regua.json carregou, mas .criterios não está definido.");
        }
        return regua;
      }

      async function carregarTooltips() {
        const resp = await fetch(settings.theme_uploads.tooltips);
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        return resp.json();
      }

      // Carrega régua e tooltips e popula CRITERIOS/TOOLTIPS/reguaVersao.
      // É a única coisa que este initializer executa nesta iteração — não
      // toca no DOM da calculadora, que ainda não existe (ver comentário no
      // topo do arquivo e em montarInterface()).
      async function carregarDadosBase() {
        try {
          const regua = await carregarRegua();
          CRITERIOS = regua.criterios;
          reguaVersao = regua.versao || "desconhecida";
          CRITERIOS.forEach((c) => {
            estado.pontuacao[c.chave] = null;
            estado.observacoes[c.chave] = "";
          });
          console.info("Matriz SEI calc: regua.json carregada", regua);
        } catch (erro) {
          console.error("Matriz SEI calc: falha ao carregar regua.json —", erro.message);
          return;
        }

        // Tooltips são um aprimoramento — se a carga falhar, segue sem eles.
        try {
          TOOLTIPS = await carregarTooltips();
          console.info("Matriz SEI calc: tooltips.json carregado", TOOLTIPS);
        } catch (erro) {
          TOOLTIPS = {};
          console.error("Matriz SEI calc: falha ao carregar tooltips.json —", erro.message);
        }
      }

      /* ---------------------------------------------------------------- *
       * Montagem da interface
       *
       * Equivale ao antigo init() do protótipo standalone, menos a carga de
       * dados (que já rodou em carregarDadosBase()). Só pode ser chamada
       * DEPOIS que o conteúdo do <template id="matriz-sei-calc-template">
       * (common/head_tag.html) já foi clonado para dentro do DOM — antes
       * disso, os seletores abaixo (#id-natureza, #criterios, etc.) não
       * encontram nada. Quem garante essa ordem é abrirCalculadoraParaTopico(),
       * que clona o template antes de chamar esta função.
       * ---------------------------------------------------------------- */

      function montarInterface() {
        // Listas controladas
        popularSelect($("#id-natureza"), NATUREZAS);
        popularSelect($("#id-trilha"), TRILHAS, false);
        popularSelect($("#id-camada"), CAMADAS);
        popularSelect($("#curadoria-camada"), CAMADAS);

        renderTriagem();
        renderCriterios();
        aplicarTooltips();
        ligarEventos();
        ligarFechamentoGlobalTooltip();

        $("#progresso-total").textContent = TOTAL_PASSOS;
        mostrarPasso(0);
      }

      /* ---------------------------------------------------------------- *
       * Modal (Iteração 3)
       *
       * ADAPTAÇÃO relevante: a forma "oficial" atual de abrir um modal no
       * Discourse é api.container.lookup("service:modal").show(Componente),
       * mas isso exige um componente Glimmer (.gjs) registrado — e essa API
       * mudou entre versões do Discourse nos últimos anos (é o que o pedido
       * chamou de "volátil"). Como não há uma instância do ParticiPEN para
       * testar contra, optamos pelo fallback expressamente autorizado: um
       * overlay próprio (div fixed + backdrop), sem depender de nenhum
       * serviço interno do Ember/Discourse além do que já usamos (DOM puro).
       * Isso é mais portátil entre versões, ao custo de não herdar a moldura
       * visual padrão dos modais do Discourse (sem título padronizado, etc.).
       * ---------------------------------------------------------------- */

      // Remove o overlay do DOM e desliga o listener de ESC criado para ele.
      function fecharOverlay(overlay, onKeydownEsc) {
        document.removeEventListener("keydown", onKeydownEsc);
        overlay.remove();
      }

      // Cria o overlay (backdrop + diálogo), clona o template da calculadora
      // para dentro dele e o insere no <body>. Fecha com ESC, clique no
      // backdrop ou clique no botão "×". Retorna o elemento <div class=
      // "matriz-sei-calc"> recém-inserido (já no DOM), pronto para
      // montarInterface() popular.
      function criarOverlayComCalculadora() {
        const template = document.getElementById("matriz-sei-calc-template");
        if (!template) {
          console.error(
            "Matriz SEI calc: template #matriz-sei-calc-template não encontrado "
            + "(common/head_tag.html não carregou).",
          );
          return null;
        }

        const overlay = document.createElement("div");
        overlay.className = "matriz-sei-overlay";

        const backdrop = document.createElement("div");
        backdrop.className = "matriz-sei-backdrop";

        const dialog = document.createElement("div");
        dialog.className = "matriz-sei-dialog";
        dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        dialog.setAttribute("aria-label", "Calculadora da matriz de priorização do SEI");

        const btnFechar = document.createElement("button");
        btnFechar.type = "button";
        btnFechar.className = "matriz-sei-fechar";
        btnFechar.setAttribute("aria-label", "Fechar");
        btnFechar.textContent = "×";

        dialog.appendChild(btnFechar);
        dialog.appendChild(template.content.cloneNode(true));
        overlay.appendChild(backdrop);
        overlay.appendChild(dialog);
        document.body.appendChild(overlay);

        const onKeydownEsc = (e) => {
          if (e.key === "Escape") fecharOverlay(overlay, onKeydownEsc);
        };
        document.addEventListener("keydown", onKeydownEsc);
        backdrop.addEventListener("click", () => fecharOverlay(overlay, onKeydownEsc));
        btnFechar.addEventListener("click", () => fecharOverlay(overlay, onKeydownEsc));

        return dialog.querySelector(".matriz-sei-calc");
      }

      // Handler do botão de rodapé "Abrir na calculadora". Abre o overlay,
      // monta a interface e popula os campos a partir do raw markdown do
      // primeiro post do tópico — via Store do Discourse, sem nenhuma
      // chamada de rede própria da calculadora (fetch à API pública foi
      // removido nesta iteração).
      async function abrirCalculadoraParaTopico(topic) {
        if (document.querySelector(".matriz-sei-overlay")) return; // já aberto, não duplica

        const raiz = criarOverlayComCalculadora();
        if (!raiz) return;

        // Se o clique veio antes de carregarDadosBase() terminar (ex.: clique
        // muito rápido após o carregamento da página), espera a régua/tooltips
        // — montarInterface() depende de CRITERIOS já populado.
        await dadosBaseProntos;
        montarInterface();

        // store.find("post", id) devolve o post via Store interna do
        // Discourse (mesmo objeto que o resto do app usa) — não é uma
        // chamada HTTP arbitrária da calculadora, é a mesma via de acesso a
        // dados que qualquer componente Ember do fórum usa.
        const firstPostId = topic
          && topic.postStream
          && topic.postStream.posts
          && topic.postStream.posts[0]
          && topic.postStream.posts[0].id;

        let raw = "";
        if (firstPostId) {
          try {
            const store = api.container.lookup("service:store");
            const post = await store.find("post", firstPostId);
            raw = (post && post.raw) || "";
          } catch (erro) {
            console.error("Matriz SEI calc: falha ao buscar o post via Store —", erro.message);
          }
        }

        const campos = raw
          ? parseFormTemplateBody(raw, topic && topic.title)
          : { semCabecalhos: true, ausentes: [], naoReconhecidos: [], encontrados: [], temAnexos: false };
        const urlTopico = topic && topic.url ? `${window.location.origin}${topic.url}` : "";
        aplicarCamposDoTopico(campos, urlTopico);

        // Só pula direto para a Triagem (Passo 2) se os campos centrais da
        // Identificação vieram todos preenchidos; qualquer lacuna manda para
        // a Identificação (Passo 1) para completar à mão — o fallback manual
        // do Patch 4 continua disponível ali.
        const camposCentrais = ["titulo", "natureza", "trilha", "camada"];
        const tudoPreenchido = camposCentrais.every((c) => estado.identificacao[c]);
        mostrarPasso(tudoPreenchido ? 1 : 0);
      }

      /* ---------------------------------------------------------------- *
       * Botão de rodapé do tópico
       *
       * Só aparece em tópicos da categoria configurada em
       * settings.demandas_category_id, E (Iteração 5) só para membros do
       * grupo configurado em settings.grupo_autorizado — se esse setting
       * estiver vazio, qualquer usuário logado vê o botão (registerTopicFooter
       * Button já restringe a usuários logados por padrão).
       * ---------------------------------------------------------------- */

      // Confere se o usuário atual pertence ao grupo configurado em
      // settings.grupo_autorizado. Setting vazio = sem restrição de grupo
      // (true). currentUser ausente ou sem grupos = nunca autorizado quando
      // a restrição está ativa.
      function usuarioNoGrupoAutorizado() {
        const nomeGrupo = (settings.grupo_autorizado || "").toString().trim();
        if (!nomeGrupo) return true; // sem restrição de grupo

        const currentUser = api.getCurrentUser();
        if (!currentUser || !currentUser.groups) return false;

        return currentUser.groups.some((g) => g && g.name === nomeGrupo);
      }

      api.registerTopicFooterButton({
        id: "matriz-sei-open",
        icon: "calculator",
        label: "topic.matriz_sei.open_button",
        title: "topic.matriz_sei.open_button_title",
        action() {
          abrirCalculadoraParaTopico(this.topic);
        },
        displayed() {
          const bruto = (settings.demandas_category_id || "").toString().trim();
          if (!bruto) return false; // modo desligado
          const catId = parseInt(bruto, 10);
          if (Number.isNaN(catId)) return false;
          if (this.topic.category_id !== catId) return false;
          return usuarioNoGrupoAutorizado();
        },
      });

      // Carrega e valida os dados-base assim que o initializer roda; guardado
      // em dadosBaseProntos para abrirCalculadoraParaTopico() poder aguardar
      // caso o clique no botão aconteça antes da carga terminar.
      const dadosBaseProntos = carregarDadosBase();
    });
  },
};
