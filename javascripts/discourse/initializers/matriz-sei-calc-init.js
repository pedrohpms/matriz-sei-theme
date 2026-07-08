/*
 * Calculadora da matriz de priorização do SEI — initializer do Discourse.
 *
 * Migrado do app.js do protótipo standalone (pedrohpms/matriz-sei). Fluxo de
 * seis passos, regras de validação (piso de complexidade, ato vinculado,
 * filtro 0+0), o par valor × esforço com plotagem em quadrantes e a memória de
 * cálculo em dois formatos permanecem idênticos ao protótipo — só a forma de
 * carregar dados e de entrar em execução mudou para se adequar ao ambiente do
 * Discourse. Ver README para o resumo das adaptações.
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
      const TRILHAS = ["Aperfeiçoamento", "Evolutiva", "Normativa"];

      // Camadas em ordem crescente de complexidade/abrangência.
      const CAMADAS = [
        { valor: "uso-local", rotulo: "Uso local", tooltip: "camada_uso_local" },
        { valor: "grupo", rotulo: "Grupo", tooltip: "camada_grupo" },
        { valor: "vitrine", rotulo: "Vitrine", tooltip: "camada_vitrine" },
        { valor: "modulo-pen", rotulo: "Módulo PEN", tooltip: "camada_modulo_pen" },
        { valor: "core-sei", rotulo: "Core SEI", tooltip: "camada_core_sei" },
      ];

      // Piso da nota de Complexidade por camada validada (escala natural:
      // 0 = trivial, 4 = altíssima). É a nota MÍNIMA plausível: nota ABAIXO do
      // piso exige justificativa (override). Core SEI trava em 4 (sem override).
      // A calibragem vem da régua (REGUA_DATA.pisosComplexidade), atribuída em
      // carregarDadosBase(); os valores abaixo são fallback.
      let PISOS_CAMADA = {
        "uso-local": 1,
        grupo: 2,
        vitrine: 2,
        "modulo-pen": 3,
        "core-sei": 4, // trava, sem override
      };

      // Convenção de corte da plotagem valor × esforço (revisável; vem da régua).
      // valor >= CORTES.valor → valor alto; esforco >= CORTES.esforco → esforço alto.
      let CORTES = { valor: 6, esforco: 4 };

      // Quadrantes da plotagem valor × esforço, nomeados por (valor, esforço).
      const QUADRANTES = {
        janela: { rotulo: "Janela de oportunidade" },             // valor alto, esforço baixo
        aposta: { rotulo: "Aposta estratégica" },                 // valor alto, esforço alto
        preenchimento: { rotulo: "Preenchimento de capacidade" }, // valor baixo, esforço baixo
        revisao: { rotulo: "Revisão e devolutiva" },              // valor baixo, esforço alto
      };

      // Gatilhos do ato vinculado / piso (Passo 2 — Triagem).
      const GATILHOS_PISO = [
        { chave: "obrigacaoLegal", rotulo: "Obrigação legal", tooltip: "piso_obrigacao_legal" },
        { chave: "determinacaoControle", rotulo: "Determinação de órgão de controle", tooltip: "piso_determinacao_controle" },
        { chave: "seguranca", rotulo: "Falha de segurança", tooltip: "piso_falha_seguranca" },
        { chave: "sustentacao", rotulo: "Sustentação tecnológica", tooltip: "piso_sustentacao_tecnologica" },
        { chave: "continuidade", rotulo: "Continuidade do serviço", tooltip: "piso_continuidade_operacional" },
      ];

      // Os cinco critérios da matriz vêm da régua canônica (REGUA_DATA, mais
      // abaixo), populados por carregarDadosBase(). O fluxo só consome este
      // array — não conhece os textos dos descritores.
      let CRITERIOS = [];

      // Conteúdo dos tooltips (TOOLTIPS_DATA, mais abaixo), no formato
      // { chave: texto }. Preenchido por carregarDadosBase().
      let TOOLTIPS = {};

      // Versão semver da régua (REGUA_DATA.versao), preenchida junto com
      // CRITERIOS em carregarDadosBase().
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
        // Override do piso de Complexidade (Passo 4).
        override: {
          ativo: false,       // nota de complexidade abaixo do piso da camada
          nota: null,         // nota atribuída
          piso: null,         // piso da camada na hora do override
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

      // Piso de Complexidade pela camada validada. null se não há camada definida.
      function pisoComplexidade() {
        const c = estado.curadoria.camadaValidada;
        return Object.prototype.hasOwnProperty.call(PISOS_CAMADA, c) ? PISOS_CAMADA[c] : null;
      }

      function camadaCore() {
        return estado.curadoria.camadaValidada === "core-sei";
      }

      // Condição do filtro 0+0 (só conta notas efetivamente 0, não null).
      function condicaoConvenienciaLocal() {
        return estado.pontuacao.impacto === 0 && estado.pontuacao.ganho === 0;
      }

      // Desfecho do fluxo. Piso (ato vinculado) tem precedência sobre o filtro 0+0.
      function desfechoAtual() {
        if (pisoAcionado()) return "piso";
        if (condicaoConvenienciaLocal()) return "conveniencia-local";
        return "normal";
      }

      // Critérios de um bloco ("valor" ou "esforco"), soma e máximo do bloco.
      // Notas não pontuadas contam como 0. Máximo = nº de critérios do bloco × 4.
      function criteriosDoBloco(bloco) {
        return CRITERIOS.filter((c) => c.bloco === bloco);
      }
      function somaBloco(bloco) {
        return criteriosDoBloco(bloco).reduce((soma, c) => {
          const nota = estado.pontuacao[c.chave];
          return soma + (typeof nota === "number" ? nota : 0);
        }, 0);
      }
      function maxBloco(bloco) {
        return criteriosDoBloco(bloco).length * 4;
      }
      function calcularValor() { return somaBloco("valor"); }
      function calcularEsforco() { return somaBloco("esforco"); }

      // Quadrante da plotagem a partir do par (valor, esforço) e das linhas de corte.
      function quadranteDe(valor, esforco) {
        const valorAlto = valor >= CORTES.valor;
        const esforcoAlto = esforco >= CORTES.esforco;
        if (valorAlto && !esforcoAlto) return "janela";
        if (valorAlto && esforcoAlto) return "aposta";
        if (!valorAlto && !esforcoAlto) return "preenchimento";
        return "revisao";
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

      // Metadados de cada bloco de critérios (Passo 4). O texto do subtotal é
      // preenchido dinamicamente por atualizarScoreVisivel().
      const BLOCOS_CRITERIOS = [
        {
          chave: "valor",
          titulo: "Valor",
          ajuda: "Ordena a fila — quanto maior, mais alta a prioridade.",
        },
        {
          chave: "esforco",
          titulo: "Esforço de entrega",
          ajuda: "Orienta o tratamento e desempata (menor esforço primeiro).",
        },
      ];

      // Renderiza um critério (legenda, descrição, descritores e observação)
      // dentro de um container de bloco.
      function renderCriterio(container, c) {
        const bloco = document.createElement("fieldset");
        bloco.className = "criterio";
        bloco.dataset.criterio = c.chave;

        const legenda = document.createElement("legend");
        legenda.textContent = c.rotulo;
        // Tooltip contextual do critério (quando a régua declara `tooltip`).
        const tip = c.tooltip && criarTooltipEl(c.tooltip);
        if (tip) legenda.appendChild(tip);
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
      }

      // Renderiza os cinco critérios agrupados nos dois blocos (Passo 4): Valor
      // (0-12, ordena a fila) e Esforço de entrega (0-8, orienta e desempata).
      function renderCriterios() {
        const container = $("#criterios");
        container.innerHTML = "";

        BLOCOS_CRITERIOS.forEach((b) => {
          const criterios = criteriosDoBloco(b.chave);
          if (!criterios.length) return;

          const secao = document.createElement("section");
          secao.className = "bloco-criterios";
          secao.dataset.bloco = b.chave;

          const cabecalho = document.createElement("div");
          cabecalho.className = "bloco-cabecalho";
          cabecalho.innerHTML = `
            <h3 class="bloco-titulo">${b.titulo}
              <span class="bloco-subtotal" id="subtotal-${b.chave}">0/${criterios.length * 4}</span>
            </h3>
            <p class="bloco-ajuda">${b.ajuda}</p>`;
          secao.appendChild(cabecalho);

          criterios.forEach((c) => renderCriterio(secao, c));
          container.appendChild(secao);
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
        if (estado.passoAtual === 3) atualizarPisoComplexidade();
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

      // O par valor × esforço fica visível no rodapé e no passo de pontuação,
      // com os subtotais por bloco. Sob ato vinculado a demanda sai da matriz
      // discricionária (sem par valor × esforço).
      function atualizarScoreVisivel() {
        const v = calcularValor();
        const e = calcularEsforco();
        const maxV = maxBloco("valor");
        const maxE = maxBloco("esforco");

        const sv = $("#subtotal-valor");
        if (sv) sv.textContent = `${v}/${maxV}`;
        const se = $("#subtotal-esforco");
        if (se) se.textContent = `${e}/${maxE}`;

        const resumo = pisoAcionado()
          ? "ato vinculado"
          : `Valor ${v}/${maxV} · Esforço ${e}/${maxE}`;
        $("#score-rodape").textContent = resumo;
        const live = $("#score-live");
        if (live) live.textContent = resumo;
      }

      // Passo 2 — aviso de ato vinculado. Informativo: explica que a demanda sai
      // da matriz discricionária; o avaliador pode desmarcar para avaliar pela matriz.
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
          "<strong>Ato vinculado acionado.</strong> Demanda fora da matriz "
          + "discricionária — encaminhamento direto ao topo da fila, independentemente "
          + "do par valor × esforço. A pontuação é pulada. Gatilho(s): "
          + pisos.map((p) => p.rotulo).join(", ") + ". Desmarque para avaliar pela matriz.";
      }

      // Passo 4 — aplica o piso de Complexidade pela camada validada.
      //  - Core SEI: nota fixa em 4 (altíssima), radios desabilitados, sem override.
      //  - Demais camadas: nota ABAIXO do piso marca override e exige justificativa.
      function atualizarPisoComplexidade() {
        const bloco = $('.criterio[data-criterio="complexidade"]');
        if (!bloco) return;

        const piso = pisoComplexidade();
        const radios = $$('input[name="crit-complexidade"]', bloco);
        const rotuloCamada = rotuloPorValor(CAMADAS, estado.curadoria.camadaValidada);
        const overlay = $("#override-complexidade");

        // Nota de piso (criada uma única vez, logo após a descrição/legenda).
        let notaEl = bloco.querySelector(".piso-nota");
        if (!notaEl) {
          notaEl = document.createElement("p");
          notaEl.className = "piso-nota";
          const ancora = bloco.querySelector(".criterio-descricao") || bloco.querySelector("legend");
          ancora.insertAdjacentElement("afterend", notaEl);
        }

        const limparMarca = () => radios.forEach((r) =>
          r.closest(".descritor-linha").classList.remove("abaixo-piso"));

        // Sem camada definida — sem piso a aplicar.
        if (piso === null) {
          notaEl.className = "piso-nota";
          notaEl.textContent = "Defina a camada na curadoria (Passo 3) para aplicar o piso de complexidade.";
          radios.forEach((r) => { r.disabled = false; });
          limparMarca();
          estado.override.ativo = false;
          if (overlay) overlay.hidden = true;
          return;
        }

        // Core SEI — nota fixa em 4 (altíssima), sem override possível.
        if (camadaCore()) {
          estado.pontuacao.complexidade = 4;
          radios.forEach((r) => {
            r.checked = Number(r.value) === 4;
            r.disabled = true;
          });
          limparMarca();
          notaEl.className = "piso-nota fixa";
          notaEl.textContent = "Camada Core SEI: Complexidade fixada em 4 (altíssima), sem possibilidade de override.";
          estado.override.ativo = false;
          if (overlay) overlay.hidden = true;
          return;
        }

        // Demais camadas — override possível abaixo do piso.
        notaEl.className = "piso-nota";
        notaEl.textContent =
          `Piso pela camada ${rotuloCamada}: nota mínima ${piso}. `
          + "Notas abaixo do piso exigem justificativa (override).";
        radios.forEach((r) => {
          r.disabled = false;
          r.closest(".descritor-linha").classList.toggle("abaixo-piso", Number(r.value) < piso);
        });

        const nota = estado.pontuacao.complexidade;
        const ehOverride = typeof nota === "number" && nota < piso;
        estado.override.ativo = ehOverride;

        if (ehOverride) {
          estado.override.nota = nota;
          estado.override.piso = piso;
          if (overlay) {
            overlay.hidden = false;
            $("#override-alerta").textContent =
              `Nota ${nota} está abaixo do piso ${piso} da camada ${rotuloCamada}. `
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
        const v = calcularValor();
        const e = calcularEsforco();
        const maxV = maxBloco("valor");
        const maxE = maxBloco("esforco");
        el.hidden = false;

        switch (desfechoAtual()) {
          case "piso":
            el.className = "aviso alerta";
            el.innerHTML =
              "<strong>Enquadrada por ato vinculado.</strong> Fora da matriz "
              + "discricionária — encaminhamento direto ao topo da fila, "
              + "independentemente do par valor × esforço. "
              + '<button type="button" class="link" id="retomar-triagem">Voltar à triagem</button>';
            break;
          case "conveniencia-local":
            el.className = "aviso alerta";
            el.innerHTML =
              "<strong>Fluxo encerrado por filtro automático.</strong> Demanda "
              + "tratada como conveniência estritamente local — não disputa fila, e é "
              + "encaminhada à camada de uso local. Valor apurado: " + v + "/" + maxV
              + " · Esforço: " + e + "/" + maxE + ". "
              + '<button type="button" class="link" id="retomar-pontuacao">Voltar à pontuação</button>';
            break;
          default:
            el.className = "aviso ok";
            el.innerHTML =
              "<strong>Avaliação completa pela matriz.</strong> Valor: " + v + "/" + maxV
              + " · Esforço de entrega: " + e + "/" + maxE
              + " · Quadrante: " + QUADRANTES[quadranteDe(v, e)].rotulo + ".";
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
            + "— não disputa fila, e é encaminhada à camada de uso local. Valor "
            + "parcial: " + calcularValor() + "/" + maxBloco("valor")
            + ". Volte à pontuação se classificou errado.";
          alvo.className = "aviso alerta";
        } else {
          alvo.textContent = "Filtro não acionado — a demanda segue para a memória de cálculo com o par valor × esforço apurado.";
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
        "Quero melhorar algo que já existe, mas pode ficar melhor": "Aperfeiçoamento",
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

        estado.override = { ativo: false, nota: null, piso: null, justificativa: "" };
        const ov = (m.overrides || []).find((o) => o && o.criterio === "complexidade");
        if (ov) {
          estado.override = {
            ativo: true,
            nota: ov.nota,
            piso: (ov.piso != null ? ov.piso : (ov.teto != null ? ov.teto : null)),
            justificativa: ov.justificativa || "",
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
          return "Demanda enquadrada como ato vinculado — fora da matriz "
            + "discricionária. Encaminhamento direto ao topo da fila, independentemente "
            + "do par valor × esforço.";
        }
        if (codigo === "conveniencia-local") {
          return "Demanda tratada como conveniência estritamente local — não disputa "
            + "fila, e é encaminhada à camada de uso local.";
        }
        return "Avaliação completa pela matriz.";
      }

      // Rótulo humano de um gatilho de ato vinculado, a partir da chave.
      function rotuloGatilho(chave) {
        const g = GATILHOS_PISO.find((x) => x.chave === chave);
        return g ? g.rotulo : chave;
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
        const piso = pisoComplexidade();
        const ehPiso = desfecho === "piso";
        const overrideAtivo = !ehPiso && estado.override.ativo;

        // Sob ato vinculado a demanda sai da matriz discricionária: os cinco
        // critérios não são pontuados e não há par valor × esforço nem quadrante.
        const valor = ehPiso ? null : calcularValor();
        const esforco = ehPiso ? null : calcularEsforco();
        const maxV = maxBloco("valor");
        const maxE = maxBloco("esforco");
        const quad = ehPiso ? null : quadranteDe(valor, esforco);

        const criterios = CRITERIOS.map((c) => {
          const notaBruta = estado.pontuacao[c.chave];
          const pontuado = !ehPiso && typeof notaBruta === "number";
          return {
            chave: c.chave,
            rotulo: c.rotulo,
            bloco: c.bloco,
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
            piso: estado.override.piso,
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
          // Subtipo do ato vinculado (Patch 5): chave do gatilho, ou null.
          piso_obrigatorio: ehPiso && pisos.length ? pisos[0].chave : null,
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
            pisoComplexidade: piso,
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
          // Justificativa do override do piso de complexidade (Patch 5), ou null.
          override_complexidade: overrideAtivo ? estado.override.justificativa.trim() : null,
          // Par valor × esforço e quadrante (null sob ato vinculado).
          valor: ehPiso ? null : { total: valor, maximo: maxV, texto: `${valor}/${maxV}` },
          esforco: ehPiso ? null : { total: esforco, maximo: maxE, texto: `${esforco}/${maxE}` },
          quadrante: ehPiso ? null : { codigo: quad, rotulo: QUADRANTES[quad].rotulo },
        };
      }

      // SVG (string) da plotagem valor × esforço. String pura para reuso: render
      // no DOM (Passo 6), download e embutido no Markdown. Vazio sob ato
      // vinculado (a demanda não tem posição no quadrante — antecede a régua).
      function svgPlotagemString(m) {
        if (!m || !m.valor || !m.esforco) return "";

        const V = m.valor.total;
        const E = m.esforco.total;
        const VMAX = m.valor.maximo || 12;
        const EMAX = m.esforco.maximo || 8;
        const corteV = CORTES.valor;
        const corteE = CORTES.esforco;

        // Área útil de plotagem (deixa margem para eixos, ticks e rótulos).
        const X0 = 60, X1 = 540, YBASE = 340, YTOPO = 40;
        const W = X1 - X0, H = YBASE - YTOPO;
        const xFor = (e) => X0 + (e / EMAX) * W;   // esforço: 0 à esquerda, EMAX à direita
        const yFor = (v) => YBASE - (v / VMAX) * H; // valor: 0 embaixo, VMAX no topo

        const xCorte = xFor(corteE);
        const yCorte = yFor(corteV);
        const f = (n) => Number(n).toFixed(1);

        const esc = (s) => String(s == null ? "" : s)
          .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");

        const titulo = (m.identificacao && m.identificacao.titulo) || "(sem título)";
        const tituloCurto = titulo.length > 40 ? titulo.slice(0, 39) + "…" : titulo;
        const quadRotulo = m.quadrante ? m.quadrante.rotulo : "";

        const mx = xFor(E);
        const my = yFor(V);
        // Label do marcador: à esquerda se o ponto está na metade direita do gráfico.
        const labelDir = mx > (X0 + X1) / 2;
        const labelX = labelDir ? mx - 12 : mx + 12;
        const labelAnchor = labelDir ? "end" : "start";
        const labelY = Math.max(YTOPO + 14, Math.min(YBASE - 6, my - 12));
        const labelTexto = `${tituloCurto} (V=${V}, E=${E})`;

        // Ticks dos eixos, nos inteiros.
        let ticksX = "";
        for (let e = 0; e <= EMAX; e++) {
          const x = xFor(e);
          ticksX += `<line x1="${f(x)}" y1="${YBASE}" x2="${f(x)}" y2="${YBASE + 5}" stroke="#8895a3" stroke-width="1"/>`
            + `<text x="${f(x)}" y="${YBASE + 18}" text-anchor="middle" font-size="11" fill="#45525e">${e}</text>`;
        }
        let ticksY = "";
        for (let v = 0; v <= VMAX; v++) {
          const y = yFor(v);
          ticksY += `<line x1="${X0 - 5}" y1="${f(y)}" x2="${X0}" y2="${f(y)}" stroke="#8895a3" stroke-width="1"/>`
            + `<text x="${X0 - 9}" y="${f(y + 3.5)}" text-anchor="end" font-size="11" fill="#45525e">${v}</text>`;
        }

        const quadRect = (x, y, w, h, fill) =>
          `<rect x="${f(x)}" y="${f(y)}" width="${f(w)}" height="${f(h)}" fill="${fill}"/>`;
        const rotuloQuad = (x, y, texto) =>
          `<text x="${f(x)}" y="${f(y)}" text-anchor="middle" font-size="13" font-weight="600" fill="#5b6b7a" opacity="0.85">${esc(texto)}</text>`;

        const yMeio = (YTOPO + YBASE) / 2;

        return `<svg viewBox="0 0 600 400" xmlns="http://www.w3.org/2000/svg" role="img" aria-labelledby="plot-titulo plot-desc" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, Arial, sans-serif">`
          + `<title id="plot-titulo">Posição na matriz valor × esforço</title>`
          + `<desc id="plot-desc">Demanda "${esc(tituloCurto)}" com valor ${V} de ${VMAX} e esforço de entrega ${E} de ${EMAX}, no quadrante ${esc(quadRotulo)}. Linhas de corte em valor ${corteV} e esforço ${corteE}.</desc>`
          + `<text x="300" y="22" text-anchor="middle" font-size="15" font-weight="700" fill="#1c2733">Posição na matriz valor × esforço</text>`
          + quadRect(X0, YTOPO, xCorte - X0, yCorte - YTOPO, "#e8f2ea")          // sup. esq: janela
          + quadRect(xCorte, YTOPO, X1 - xCorte, yCorte - YTOPO, "#e9eff7")      // sup. dir: aposta
          + quadRect(X0, yCorte, xCorte - X0, YBASE - yCorte, "#f2f3f4")         // inf. esq: preenchimento
          + quadRect(xCorte, yCorte, X1 - xCorte, YBASE - yCorte, "#f6eeee")     // inf. dir: revisão
          + rotuloQuad((X0 + xCorte) / 2, (YTOPO + yCorte) / 2, "Janela de oportunidade")
          + rotuloQuad((xCorte + X1) / 2, (YTOPO + yCorte) / 2, "Aposta estratégica")
          + rotuloQuad((X0 + xCorte) / 2, (yCorte + YBASE) / 2, "Preenchimento de capacidade")
          + rotuloQuad((xCorte + X1) / 2, (yCorte + YBASE) / 2, "Revisão e devolutiva")
          + `<line x1="${f(xCorte)}" y1="${YTOPO}" x2="${f(xCorte)}" y2="${YBASE}" stroke="#8895a3" stroke-width="1.5" stroke-dasharray="6 4"/>`
          + `<line x1="${X0}" y1="${f(yCorte)}" x2="${X1}" y2="${f(yCorte)}" stroke="#8895a3" stroke-width="1.5" stroke-dasharray="6 4"/>`
          + `<rect x="${X0}" y="${YTOPO}" width="${W}" height="${H}" fill="none" stroke="#8895a3" stroke-width="1.5"/>`
          + ticksX + ticksY
          + `<text x="${(X0 + X1) / 2}" y="${YBASE + 36}" text-anchor="middle" font-size="12" font-weight="600" fill="#1c2733">Esforço de entrega →</text>`
          + `<text x="18" y="${yMeio}" text-anchor="middle" font-size="12" font-weight="600" fill="#1c2733" transform="rotate(-90 18 ${yMeio})">Valor ↑</text>`
          + `<circle cx="${f(mx)}" cy="${f(my)}" r="8" fill="#C0392B" stroke="#ffffff" stroke-width="1.5"/>`
          + `<text x="${f(labelX)}" y="${f(labelY)}" text-anchor="${labelAnchor}" font-size="12" font-weight="600" fill="#1c2733">${esc(labelTexto)}</text>`
          + `</svg>`;
      }

      // Markdown estruturado, para colar no Discourse/ParticiPEN.
      function memoriaParaMarkdown(m) {
        const ni = (v) => (v && String(v).trim() ? v : "(não informado)");

        const blocosCriterios = m.criterios.map((c) => {
          const bloco = c.bloco === "valor" ? "Valor" : "Esforço de entrega";
          const nota = c.nota === null ? "não pontuado" : String(c.nota);
          const descritor = c.descritor === null ? "—" : c.descritor;
          const obs = c.observacao || "(não informada)";
          const ovr = m.overrides.find((o) => o.criterio === c.chave);
          const linhaOvr = ovr
            ? `\n- **Override do piso:** nota ${ovr.nota} abaixo do piso ${ovr.piso} (camada ${ovr.camada.rotulo})`
            : "";
          return `### ${c.rotulo} _(${bloco})_\n`
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
              `${o.rotulo}: nota ${o.nota} abaixo do piso ${o.piso} (camada ${o.camada.rotulo}) `
              + `— justificativa: "${o.justificativa}"`).join("; ")
          : "Nenhum";

        let pisoTxt;
        if (m.curadoria.pisoComplexidade === null) pisoTxt = "(camada não definida)";
        else if (m.curadoria.camadaValidada.valor === "core-sei") pisoTxt = "4 (fixo, sem override)";
        else pisoTxt = String(m.curadoria.pisoComplexidade);

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
        // bloco de enquadramento; do contrário, sai o par valor × esforço, o
        // quadrante e o SVG da plotagem embutido.
        const rodapeMeta =
          `- **Timestamp (ISO 8601):** ${m.timestamp}\n`
          + `- **Avaliador:** ${m.avaliador}\n`
          + `- **Versão da régua:** ${m.versaoRegua}`;

        let corpoFinal;
        if (m.pisoAcionado) {
          const gatilhosAcionados = m.triagem.gatilhos.filter((g) => g.marcado).map((g) => g.rotulo);
          const subtipo = gatilhosAcionados.join(", ") || "—";
          corpoFinal = `## Enquadramento por ato vinculado
- **Piso obrigatório — ato vinculado (${subtipo}). Fora da matriz discricionária.**
- **Encaminhamento:** direto ao topo da fila, independentemente do par valor × esforço.
${rodapeMeta}`;
        } else {
          const overrideLinha = m.override_complexidade
            ? `\n- **Override do piso de complexidade:** ${m.override_complexidade}`
            : "";
          const svg = svgPlotagemString(m);
          const plotagem = svg
            ? `\n\n## Plotagem em quadrantes\n<!-- svg-plotagem -->\n\`\`\`xml\n${svg}\n\`\`\`\n`
              + `_Linhas de corte: valor ≥ ${CORTES.valor} alto, esforço ≥ ${CORTES.esforco} alto (convenção revisável)._`
            : "";
          corpoFinal = `## Critérios

${blocosCriterios}

## Resultado
- **Valor:** ${m.valor.texto}
- **Esforço de entrega:** ${m.esforco.texto}
- **Quadrante:** ${m.quadrante.rotulo}
- **Filtros acionados:** ${filtrosTexto}
- **Overrides:** ${overridesTexto}${overrideLinha}
${rodapeMeta}${plotagem}`;
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
- **Piso de complexidade pela camada:** ${pisoTxt}

## Desfecho
**${m.desfecho.rotulo}** — ${m.desfecho.mensagem}

${corpoFinal}
`;
      }

      function memoriaParaJSON(m) {
        return JSON.stringify(m, null, 2);
      }

      // (Re)monta a memória, exibe o Markdown na textarea e renderiza a plotagem.
      function gerarMemoria() {
        memoriaAtual = montarMemoria();
        $("#memoria-saida").value = memoriaParaMarkdown(memoriaAtual);
        renderPlotagem(memoriaAtual);
      }

      // Passo 6 — plotagem em quadrantes. Sob ato vinculado a demanda não tem
      // posição no quadrante (antecede a régua): mostra um card explicativo.
      function renderPlotagem(m) {
        const bloco = $("#plotagem-bloco");
        const card = $("#plotagem-piso-card");
        if (!bloco || !card) return;

        if (m.desfecho.codigo === "piso") {
          bloco.hidden = true;
          card.hidden = false;
          $("#plotagem-svg").innerHTML = ""; // limpa SVG de uma geração anterior
          const sub = m.piso_obrigatorio ? rotuloGatilho(m.piso_obrigatorio) : "—";
          card.innerHTML =
            "<strong>Piso obrigatório — ato vinculado.</strong> Fora da matriz "
            + "discricionária. Encaminhamento direto ao topo da fila, independentemente "
            + "do par valor × esforço.<br><span class=\"piso-card-sub\">Subtipo: "
            + sub + ".</span>";
          return;
        }

        card.hidden = true;
        bloco.hidden = false;
        $("#plotagem-svg").innerHTML = svgPlotagemString(m);
        const nota = $("#plotagem-nota");
        if (nota) {
          nota.textContent =
            `Linhas de corte: valor ≥ ${CORTES.valor} alto, esforço ≥ ${CORTES.esforco} `
            + "alto (convenção revisável).";
        }
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

      // Copia um texto para a área de transferência. Lança se falhar (quem
      // chama decide a mensagem — copiarMarkdown() e postarAvaliacao() usam
      // textos diferentes para o mesmo caso de falha).
      async function copiarTextoParaClipboard(texto) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(texto);
        } else {
          // Fallback para contextos sem Clipboard API
          const ta = $("#memoria-saida");
          ta.focus();
          ta.select();
          document.execCommand("copy");
        }
      }

      async function copiarMarkdown() {
        if (!memoriaAtual) gerarMemoria();
        const texto = $("#memoria-saida").value;
        try {
          await copiarTextoParaClipboard(texto);
          flash("Markdown copiado!");
        } catch (e) {
          flash("Não foi possível copiar automaticamente — selecione e copie manualmente.");
        }
      }

      // Botão "Postar avaliação": copia o markdown (mesmo comportamento do
      // botão "Copiar markdown") E publica a memória de cálculo como reply
      // no próprio tópico, via Store do Discourse (store.createRecord("post",
      // ...).save() — o mesmo mecanismo que a Composer do Discourse usa por
      // baixo dos panos para criar posts). O post sai em nome do usuário
      // logado (quem clicou no botão), como qualquer reply normal.
      async function postarAvaliacao() {
        if (!topicoAtual || !topicoAtual.id) {
          flash("Não foi possível identificar o tópico para publicar a resposta.");
          return;
        }

        if (!memoriaAtual) gerarMemoria();
        const texto = $("#memoria-saida").value;

        try {
          await copiarTextoParaClipboard(texto);
        } catch (e) {
          // Falha ao copiar não impede a publicação — segue o fluxo.
        }

        const btn = $("#btn-postar-avaliacao");
        if (btn) btn.disabled = true;
        flash("Publicando resposta…", 10000);

        try {
          const store = api.container.lookup("service:store");
          const post = store.createRecord("post", {
            raw: texto,
            topic_id: topicoAtual.id,
          });
          await post.save();
          flash("Markdown copiado e resposta publicada no tópico!", 5000);
        } catch (erro) {
          console.error("Matriz SEI calc: falha ao publicar a resposta —", erro && erro.message);
          flash(
            "Markdown copiado, mas não foi possível publicar a resposta "
            + "automaticamente — cole manualmente como reply.",
            7000,
          );
        } finally {
          if (btn) btn.disabled = false;
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

      // Exporta o SVG serializado da plotagem, nome baseado no título (slug).
      function baixarSVG() {
        if (!memoriaAtual) gerarMemoria();
        if (memoriaAtual.desfecho.codigo === "piso") {
          flash("Ato vinculado não tem posição na matriz — sem plotagem para exportar.", 4000);
          return;
        }
        const svg = svgPlotagemString(memoriaAtual);
        const nome = `plotagem-${slugify(memoriaAtual.identificacao.titulo)}.svg`;
        const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = nome;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        flash("SVG baixado: " + nome, 4000);
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
          if (chave === "complexidade") atualizarPisoComplexidade();
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
        $("#btn-postar-avaliacao").addEventListener("click", postarAvaliacao);
        $("#btn-copiar-md").addEventListener("click", copiarMarkdown);
        $("#btn-baixar-json").addEventListener("click", baixarJSON);
        $("#btn-baixar-svg").addEventListener("click", baixarSVG);
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

        // Passo 2 — ato vinculado sai da matriz discricionária: pula a pontuação
        // e vai direto à memória (encaminhamento direto ao topo da fila).
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
       * Dados-base: régua de critérios e tooltips contextuais
       *
       * ADAPTAÇÃO (pós-v1.0.0): até então esses dados eram assets declarados
       * em about.json (regua.json/tooltips.json), buscados por fetch em
       * settings.theme_uploads.<nome>. Na prática, isso faz o Discourse
       * tratar os arquivos como UPLOADS de verdade — mesmo pipeline usado
       * para anexos de posts — sujeitos à configuração de site
       * `authorized_extensions`. Como "json" não vem liberado por padrão, a
       * instalação real travava até o admin alterar essa configuração
       * global do fórum, só para instalar o tema. Os dados agora ficam
       * embutidos como código JS (mesma ideia do regua.js/tooltips.js do
       * protótipo standalone) — código-fonte do tema não passa pelo filtro
       * de extensões, então a instalação não depende de nenhuma configuração
       * extra do site. Como bônus, a carga fica síncrona (sem fetch, sem
       * promise a aguardar, sem 404 possível).
       * ---------------------------------------------------------------- */

      const REGUA_DATA = {
        // 2.0.0 (Patch 5): soma única 0-20 substituída pelo par valor (0-12) ×
        // esforço de entrega (0-8); escalas desinvertidas (todos os critérios
        // crescem no sentido natural); "Risco" → "Risco de entrega"; o teto de
        // complexidade por camada virou PISO (mínimo); plotagem em quadrantes.
        versao: "2.0.0",
        atualizadoEm: "2026-07-07",

        // Piso de complexidade por camada (escala natural: 0 = trivial, 4 =
        // altíssima). Nota ABAIXO do piso exige justificativa. Core SEI trava
        // em 4. Calibragem revisável aqui, sem tocar na lógica.
        pisosComplexidade: {
          "uso-local": 1,
          grupo: 2,
          vitrine: 2,
          "modulo-pen": 3,
          "core-sei": 4,
        },

        // Convenção de corte da plotagem valor × esforço (revisável).
        cortesPlotagem: { valor: 6, esforco: 4 },

        criterios: [
          {
            chave: "impacto",
            rotulo: "Impacto institucional",
            bloco: "valor",
            invertido: false,
            descricao: {
              intro: "Este critério avalia o aspecto discricionário da demanda - se há conveniência e oportunidade de atendimento.",
              aspectosIntro: "Avalie a demanda quanto a qualquer um destes aspectos:",
              aspectos: [
                "alinhamento com prioridade de governo (explícita, declarada);",
                "recomendação de órgão de controle (não vinculante);",
                "compromisso firmado (ACTs, MoUs, pactos, convênios);",
                "visibilidade externa do SEI (imprensa, reputação);",
                "diretriz setorial de ministério ou autarquia de cúpula (mesmo vindas de fora da SEGES/MGI).",
              ],
              regra: "Se mais de um aspecto estiver presente, considere a dimensão mais marcante - não some várias; atribua a nota pela que pesar mais forte. Em seguida, escolha o nível na escala abaixo.",
              observacoes: [
                "Observação 1: aqui não entra exigência legal - Obrigação legal é ato vinculado, tratada na triagem. Se for o caso, volte à etapa de triagem e assinale a opção correspondente.",
                "Observação 2: determinação de órgão de controle também é ato vinculado e não entra aqui. Se a recomendação já se tornou determinação, volte à triagem e assinale.",
              ],
            },
            descritores: [
              "Nenhuma das dimensões aparece. Demanda de conveniência local.",
              "Uma dimensão aparece de forma marginal: diretriz informal local, tema lateral em reunião com controle sem recomendação formal, ou visibilidade restrita a um grupo pequeno.",
              "Uma dimensão aparece com peso médio: normativa setorial que afeta um grupo de órgãos; diretriz formal da SEGES/MGI; recomendação não-vinculante em relatório de auditoria; visibilidade entre usuários do SEI sem repercussão externa.",
              "Uma dimensão aparece forte: programa ou compromisso formal de governo transversal; diretriz setorial muito ampla e cobrada; recomendação reiterada de órgão de controle; citação na imprensa ou exposição a usuário externo de forma sensível.",
              "Dimensão crítica dentro do discricionário: programa prioritário de governo com prazo e cobrança; recomendação reiterada de controle sob forte pressão (sem ainda configurar determinação); compromisso público com sociedade civil cobrado em conselho; risco reputacional concreto.",
            ],
          },
          {
            chave: "orgaos",
            rotulo: "Quantidade de órgãos afetados",
            bloco: "valor",
            invertido: false,
            descricao: "Quantos entes da esfera federal se beneficiam. Em ambiguidade entre número e segmento, prevalece o segmento.",
            descritores: [
              "1 órgão, em uso estritamente local, sem reuso possível.",
              "2 a 5 órgãos pontuais.",
              "Um grupo temático ou subconjunto de um segmento (6 a 30 órgãos - por exemplo, agências reguladoras de infraestrutura).",
              "Um segmento inteiro (toda a Direta, toda a Indireta, todas as Agências, ou todas as Estatais), ou múltiplos grupos (31 a 150 órgãos).",
              "Múltiplos segmentos, ou transversal à esfera federal (>150 órgãos).",
            ],
          },
          {
            chave: "ganho",
            rotulo: "Ganho operacional",
            bloco: "valor",
            invertido: false,
            descricao: "Ganho típico para um órgão que adota a solução, desacoplado do solicitante. Quando houver evidência (métricas ou relato estruturado), ela ancora a nota; sem evidência, é estimativa.",
            descritores: [
              "Nenhum ganho prático. Mudança cosmética.",
              "Ganho pequeno em tarefa pouco frequente.",
              "Ganho perceptível em tarefa regular: reduz tempo ou erro de forma mensurável em uso semanal a diário, mantendo a forma de trabalhar.",
              "Ganho alto em tarefa frequente: elimina gargalo, contorno manual ou retrabalho recorrente em atividade diária.",
              "Ganho estrutural: remove uma etapa inteira, um contorno manual obrigatório, ou uma fonte sistemática de erro.",
            ],
          },
          {
            chave: "complexidade",
            rotulo: "Complexidade",
            bloco: "esforco",
            invertido: false,
            tooltip: "criterio_complexidade",
            descricao: "A camada validada na curadoria estabelece o piso da nota (complexidade mínima plausível); áreas envolvidas, dependências, integrações externas e revisão jurídica ou normativa elevam a nota. Escala natural: 0 = trivial, 4 = altíssima.",
            descritores: [
              "Trivial. Camada de uso local; uma área envolvida; sem dependências; entrega em dias.",
              "Baixa. Grupo ou vitrine simples; uma a duas áreas; entrega em semanas.",
              "Média. Vitrine exigente ou extensão do PEN; duas a três áreas; dependências geríveis; possível revisão jurídica leve; entrega em meses.",
              "Alta. Módulo PEN ou mudança coordenada em várias frentes; dependências relevantes; entrega em vários meses.",
              "Altíssima. Core SEI ou mudança estrutural; revisão jurídica/normativa formal; prazo e escopo incertos.",
            ],
          },
          {
            chave: "risco",
            rotulo: "Risco de entrega",
            bloco: "esforco",
            invertido: false,
            tooltip: "criterio_risco_de_entrega",
            descricao: "Risco de execução da própria entrega: chance de o desenvolvimento derrapar, quebrar algo que já funciona, gerar dívida técnica ou criar incompatibilidade. Distinto da falha de segurança ou da indisponibilidade do ato vinculado (essas são triagem, Passo 2). Escala natural: 0 = desprezível, 4 = crítico.",
            descritores: [
              "Desprezível. Mudança isolada e reversível.",
              "Baixo. Efeito colateral improvável; reversão simples.",
              "Médio. Regressão plausível em pontos identificáveis; mitigável com teste.",
              "Alto. Mexe em algo crítico ou amplamente usado; reversão custosa.",
              "Crítico. Pode quebrar funcionalidade ampla; criar incompatibilidade; gerar dívida difícil de desfazer.",
            ],
          },
        ],
      };

      const TOOLTIPS_DATA = {
        natureza_problema: "Demanda que entra como dor sem solução fechada. A solução nasce no fluxo (curadoria, deliberação, eventualmente GT). Evidência é recomendada quando houver dado disponível, mas não é obrigatória.",
        natureza_pratica: "Demanda que entra como solução já rodando em algum órgão. O pedido é difundir a prática para uma camada superior (por exemplo, de uso local para grupo, ou de grupo para vitrine). Evidência é obrigatória — métricas ou relato estruturado da área que opera a prática.",
        dependencias: "Liste o que pode atrasar, bloquear ou ser destravado por esta demanda. Pode ser técnico (outra solução, integração com sistema externo, infraestrutura) ou normativo (norma a publicar, decisão jurídica, parecer aguardando). Se não houver, deixe em branco.",
        evidencia: "O que comprova que a demanda merece atenção. Pode ser quantitativo (tempo gasto na tarefa hoje, taxa de erro, número de execuções, volume de processos, quantidade de órgãos com o mesmo problema) ou qualitativo (relato estruturado de quem opera a prática que se quer difundir, ou de quem vive o problema).",
        piso_obrigacao_legal: "A demanda decorre de exigência prevista em lei, decreto ou regulamento de hierarquia equivalente — o cumprimento não comporta juízo de conveniência. Exemplos: implementar o que a LGPD exige, atender exigência do Marco Civil, cumprir disposição direta do Decreto 8.539/15.",
        piso_determinacao_controle: "TCU, CGU ou Ministério Público determinaram (não apenas recomendaram) que a ação seja tomada. Determinação tem peso vinculante; recomendação não — recomendação fica no critério Impacto institucional, não aqui.",
        piso_falha_seguranca: "Vulnerabilidade que expõe dados, autenticação ou integridade do SEI a risco direto. Exemplos: vulnerabilidade reportada por CVE, falha em controle de acesso, brecha em assinatura eletrônica, exposição de dados pessoais.",
        piso_sustentacao_tecnologica: "Manter o produto tecnologicamente viável — atualizar versões de runtime, bibliotecas ou dependências que entraram em fim de vida ou perderam suporte do mantenedor. Exemplos: migrar versão de banco em EOL, trocar biblioteca de criptografia obsoleta, atualizar runtime que parou de receber patches de segurança.",
        piso_continuidade_operacional: "Manter o serviço em funcionamento para quem usa. Não é manutenção técnica preventiva (essa é Sustentação) — é resposta a ameaça concreta à disponibilidade ou capacidade do SEI em produção. Exemplos: conter queda recorrente de servidor, restaurar backup quebrado, ampliar capacidade saturada, corrigir falha que causa indisponibilidade intermitente.",
        camada_uso_local: "Solução vive dentro de um único órgão, sem precisar ser compartilhada. Configuração, template ou automação isolada. Mantida pelo próprio órgão, sem envolvimento do PEN. Estabelece piso 1 (complexidade mínima) para o critério Complexidade.",
        camada_grupo: "Solução compartilhada entre alguns órgãos do mesmo segmento ou interesse comum, sem virar produto formal do PEN. Mantida pelo desenvolvedor original; o PEN monitora crescimento e media conflitos eventuais. Estabelece piso 2 para Complexidade.",
        camada_vitrine: "Solução já difundida, com versionamento e documentação, instalável por quem quiser. Mantida pelo desenvolvedor, com PEN supervisionando suporte e oferecendo apoio ocasional em escala. Não modifica o SEI nem o PEN. Estabelece piso 2 para Complexidade.",
        camada_modulo_pen: "Solução vira módulo oficial do ProcessoEletrônicoNacional, integrado ao SEI por interfaces oficiais. Mantida pelo PEN, ou homologada e mantida externamente pelo desenvolvedor original com SLA acordado. Estabelece piso 3 para Complexidade.",
        camada_core_sei: "Solução modifica o código-fonte do próprio SEI. Exige revisão da DTGES, atenção ao Art. 24 do Decreto 8.539/15 (exclusividade do código-fonte) e testes amplos de regressão. Trava a Complexidade em 4 (altíssima), sem possibilidade de override.",
        criterio_complexidade: "Esforço de entrega da solução (0 = trivial, 4 = altíssima). A camada validada estabelece o piso: por ser daquela camada, espera-se uma complexidade mínima. Notas abaixo desse piso exigem justificativa (override) — é implausível, por exemplo, virar Módulo PEN com complexidade baixa.",
        criterio_risco_de_entrega: "Risco de execução da própria demanda (0 = desprezível, 4 = crítico): probabilidade de o desenvolvimento derrapar, de dependências externas travarem, de incerteza técnica ou de quebrar algo que já funciona. É diferente do risco do ato vinculado (falha de segurança, indisponibilidade), que fica na triagem (Passo 2).",
      };

      // Popula CRITERIOS/TOOLTIPS/reguaVersao a partir dos dados embutidos
      // acima. Síncrono — não há fetch nem promise a aguardar.
      function carregarDadosBase() {
        CRITERIOS = REGUA_DATA.criterios;
        reguaVersao = REGUA_DATA.versao || "desconhecida";
        // Calibragens revisáveis vivem na régua (dados), não na lógica.
        if (REGUA_DATA.pisosComplexidade) PISOS_CAMADA = REGUA_DATA.pisosComplexidade;
        if (REGUA_DATA.cortesPlotagem) CORTES = REGUA_DATA.cortesPlotagem;
        CRITERIOS.forEach((c) => {
          estado.pontuacao[c.chave] = null;
          estado.observacoes[c.chave] = "";
        });
        TOOLTIPS = TOOLTIPS_DATA;
        console.info("Matriz SEI calc: régua e tooltips carregadas", REGUA_DATA);
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

      // Tópico atualmente aberto na calculadora — preenchido em
      // abrirCalculadoraParaTopico(), lido por postarAvaliacao() para saber
      // em qual tópico publicar a resposta.
      let topicoAtual = null;

      // Handler do botão de rodapé "Avaliar". Abre o overlay,
      // monta a interface e popula os campos a partir do raw markdown do
      // primeiro post do tópico — via Store do Discourse, sem nenhuma
      // chamada de rede própria da calculadora (fetch à API pública foi
      // removido nesta iteração).
      async function abrirCalculadoraParaTopico(topic) {
        if (document.querySelector(".matriz-sei-overlay")) return; // já aberto, não duplica

        const raiz = criarOverlayComCalculadora();
        if (!raiz) return;

        topicoAtual = topic;

        // Dados-base (régua/tooltips) são embutidos e já foram carregados de
        // forma síncrona na inicialização — sem fetch, sem promise a esperar.
        montarInterface();

        const urlTopico = topic && topic.url ? `${window.location.origin}${topic.url}` : "";

        // Avaliador (usuário logado que clicou no botão) e link público (URL
        // do próprio tópico) não dependem do parser do Form Template —
        // preenchidos direto do contexto, sempre que disponíveis.
        const currentUser = api.getCurrentUser();
        estado.identificacao.avaliador = currentUser
          ? (currentUser.name || currentUser.username || "")
          : "";
        estado.identificacao.link = urlTopico;
        const elAvaliador = $("#id-avaliador");
        if (elAvaliador) elAvaliador.value = estado.identificacao.avaliador;
        const elLink = $("#id-link");
        if (elLink) elLink.value = estado.identificacao.link;

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
        aplicarCamposDoTopico(campos, urlTopico);

        // Sempre abre na Identificação (Passo 1) — mesmo quando o parser
        // populou tudo — para o avaliador validar os dados extraídos antes
        // de seguir para a triagem.
        mostrarPasso(0);
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
      // Comparação de nome de grupo é case-insensitive (Discourse aceita
      // grupos com maiúsculas no nome, ex.: "GPSEI" — não vale a pena travar
      // o botão por causa de diferença de caixa entre a setting e o grupo real).
      function usuarioNoGrupoAutorizado() {
        const nomeGrupo = (settings.grupo_autorizado || "").toString().trim().toLowerCase();
        if (!nomeGrupo) return true; // sem restrição de grupo

        const currentUser = api.getCurrentUser();
        if (!currentUser) {
          console.warn("Matriz SEI calc: botão oculto — sem currentUser (não logado?).");
          return false;
        }
        if (!currentUser.groups) {
          console.warn(
            "Matriz SEI calc: botão oculto — currentUser.groups não está "
            + "populado nesta versão do Discourse. Veja o README (Solução de "
            + "problemas) para um teste manual.",
          );
          return false;
        }

        const membro = currentUser.groups.some(
          (g) => g && (g.name || "").toString().trim().toLowerCase() === nomeGrupo,
        );
        if (!membro) {
          console.info(
            `Matriz SEI calc: botão oculto — usuário "${currentUser.username}" `
            + `não pertence ao grupo "${settings.grupo_autorizado}". Grupos do `
            + `usuário: ${currentUser.groups.map((g) => g && g.name).join(", ") || "(nenhum)"}.`,
          );
        }
        return membro;
      }

      api.registerTopicFooterButton({
        id: "matriz-sei-open",
        icon: "calculator",
        // ADAPTAÇÃO: chaves de locales/pt_BR.yml não ficam disponíveis no
        // namespace global do I18n (por isso o botão mostrava o texto cru
        // "[pt_BR.topic.matriz_sei.open_button]" em vez do rótulo) — o
        // Discourse compila traduções de tema sob um namespace próprio,
        // acessível só via themePrefix(chave) (global injetado pelo
        // Discourse no JS de temas, sem precisar de import).
        label: themePrefix("topic.matriz_sei.open_button"),
        title: themePrefix("topic.matriz_sei.open_button_title"),
        action() {
          abrirCalculadoraParaTopico(this.topic);
        },
        displayed() {
          // demandas_category_id é setting do tipo integer — settings.* vem
          // como número, mas Number() protege contra qualquer valor
          // inesperado (string vazia, undefined) sem quebrar.
          const catId = Number(settings.demandas_category_id) || 0;
          if (!catId) return false; // 0 = modo desligado
          if (this.topic.category_id !== catId) {
            // Não loga aqui de propósito: displayed() roda pra todo tópico da
            // instância, e "categoria diferente da configurada" é o caso
            // comum/esperado na esmagadora maioria deles — logar isso
            // encheria o console de ruído em vez de ajudar a diagnosticar.
            return false;
          }
          return usuarioNoGrupoAutorizado();
        },
      });

      // Carrega os dados-base assim que o initializer roda (síncrono).
      carregarDadosBase();
    });
  },
};
