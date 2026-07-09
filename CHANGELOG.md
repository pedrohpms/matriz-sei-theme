# Changelog

Este projeto segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e [Versionamento Semântico](https://semver.org/lang/pt-BR/).

## [1.2.2] — 2026-07-08

Reorganização do fluxo e ajustes de saída (paridade com o standalone).

### Alterado

- **Avaliações em passos separados**: o Passo 4 vira **"Avaliação de valor"**
  (impacto, órgãos, ganho) e o Passo 5 vira **"Avaliação de risco"**
  (complexidade e risco de entrega). O override do piso passa para o Passo 5.
- **Filtro 0+0 removido**: não há mais desfecho "conveniência local". O
  quadrante já classifica (baixo valor + alto esforço = *revisão e devolutiva*;
  baixo + baixo = *preenchimento de capacidade*). Desfecho agora é só `normal`
  ou `piso`; `filtros.convenienciaLocal` saiu do JSON.
- **Plotagem no início do Passo 6** (imagem do quadrante primeiro).
- **Timestamp do Markdown** em `DD/MM/AAAA, hh:mm:ss` (o JSON mantém ISO 8601).
- Removida a nota da plotagem do Markdown (a imagem já vai como PNG no reply).

### Adicionado

- Botão **"Copiar para o Planner"** (no lugar de "Copiar markdown"): copia em
  formato rico (`text/html`, formatação Microsoft) para colar num cartão do
  Planner, com fallback `text/plain` sem símbolos de Markdown. O ParticiPEN
  continua atendido pelo "Postar avaliação" (Markdown).
- Triagem: orientação para deixar em branco e avançar se não for ato vinculado.

## [1.2.1] — 2026-07-08

### Corrigido

- **Plotagem no reply agora vai como imagem PNG, não como código.** A v1.2.0
  embutia o SVG da plotagem num bloco ` ```xml ` — o Discourse não renderiza
  SVG inline num post, então o reply mostrava o **código-fonte do SVG numa
  caixa de código** em vez do gráfico. Agora, ao **Postar avaliação**, a
  calculadora rasteriza o SVG em **PNG** (via canvas), faz upload
  (`POST /uploads.json`) e embute a imagem (`![…](upload://…)`) no reply.
  Best-effort com fallback: se o upload falhar (ex.: config de armazenamento
  do fórum), a resposta é publicada **sem** a imagem (nunca mais a caixa de
  código) e o avaliador pode anexar o PNG baixado.
- A memória de cálculo em Markdown (textarea / "Copiar markdown") deixou de
  carregar o SVG serializado; no lugar, uma nota curta com o quadrante e as
  linhas de corte.

### Adicionado

- Botão **"Baixar como PNG"** (ao lado de "Baixar como SVG"), para salvar ou
  anexar a plotagem manualmente.

## [1.2.0] — 2026-07-07

Migração do **Patch 5** do protótipo standalone (`pedrohpms/matriz-sei`): a
matriz discricionária deixa de produzir uma soma única de 0 a 20 e passa a
produzir um par independente **valor × esforço**, com plotagem em quadrantes.
Régua embutida sobe para **2.0.0**.

### Alterado

- **Soma única 0–20 → par valor (0–12) × esforço de entrega (0–8).** O valor
  ordena a fila; o esforço orienta o tratamento e desempata (menor esforço
  primeiro). O Passo 4 agora agrupa os cinco critérios em dois blocos
  visualmente distintos ("Valor" e "Esforço de entrega"), cada um com seu
  subtotal.
- **Escalas desinvertidas.** Todos os critérios crescem no sentido natural
  (não há mais escala invertida). O critério **"Risco"** virou **"Risco de
  entrega"** (para distingui-lo do risco do ato vinculado, tratado na triagem).
- **Teto de complexidade por camada virou piso.** A camada estabelece a
  complexidade **mínima** plausível (uso local 1, grupo 2, vitrine 2, módulo
  PEN 3, core SEI 4 — travado); nota **abaixo** do piso exige justificativa
  (*override*). Calibragem em `REGUA_DATA.pisosComplexidade`.
- **Ato vinculado sai da matriz discricionária.** Em vez de "score fixo 20", a
  demanda é encaminhada direto ao topo da fila, sem par valor × esforço nem
  quadrante. No Passo 6, um card explicativo toma o lugar da plotagem.
- Memória de cálculo (Markdown e JSON) reescrita: `valor`, `esforco`,
  `quadrante`, `piso_obrigatorio`, `override_complexidade`;
  `curadoria.tetoComplexidade` → `pisoComplexidade`. Sem mais "score 0–20".

### Adicionado

- **Plotagem valor × esforço em quadrantes** (SVG inline) no Passo 6, com as
  quatro regiões nomeadas — janela de oportunidade, aposta estratégica,
  preenchimento de capacidade, revisão e devolutiva — e linhas de corte em
  valor 6 / esforço 4 (convenção revisável em `REGUA_DATA.cortesPlotagem`).
- Botão **"Baixar como SVG"** e SVG embutido no Markdown postado
  (`<!-- svg-plotagem -->`), para a plotagem viajar junto no reply do ParticiPEN.
- Tooltips dos critérios **Complexidade** e **Risco de entrega**.

## [1.1.1] — 2026-07-01

### Documentado

- O botão "Abrir na calculadora" pode aparecer sem ícone: o Discourse só
  compila no site o subconjunto de ícones do FontAwesome efetivamente
  usado, e `calculator` (por ser pouco comum) pode ficar de fora por
  padrão. README ("Solução de problemas") agora documenta o caminho de
  correção: Admin → Settings → busca "icon" → configuração **svg icon
  subset** → adicionar `calculator` à lista. Confirmado como solução por
  teste real no ParticiPEN. Não é um bug de código — nenhuma mudança em
  `about.json`/JS foi necessária.

## [1.1.0] — 2026-07-01

Ajustes de fluxo e nova funcionalidade a partir do primeiro teste ponta a
ponta bem-sucedido no ParticiPEN.

### Corrigido

- Botão de rodapé mostrava a chave crua de tradução
  (`[pt_BR.topic.matriz_sei.open_button]`) em vez do rótulo — traduções de
  tema do Discourse não ficam no namespace global do I18n; precisam de
  `themePrefix(chave)`. `label`/`title` do `registerTopicFooterButton`
  corrigidos.
- O modal sempre abre no Passo 1 (Identificação) agora, mesmo quando o
  parser do Form Template consegue preencher tudo — antes pulava direto
  para o Passo 2 (Triagem), sem dar chance de o avaliador conferir os dados
  extraídos.

### Adicionado

- Campo **Avaliador** é pré-preenchido com o nome do usuário logado que
  clicou no botão.
- Campo **Link público** é pré-preenchido com a URL do próprio tópico.
- Botão **"Postar avaliação"** no Passo 6 (antes de "Copiar markdown"):
  copia a memória de cálculo para a área de transferência **e** publica
  automaticamente como reply no tópico, em nome do avaliador logado
  (`store.createRecord("post", { raw, topic_id }).save()`). Se a publicação
  falhar (permissão, tópico fechado etc.), o Markdown continua copiado como
  fallback.

### Alterado (visual)

- Cabeçalho: gradiente horizontal fixo `#0e3d88` → `#1351b3` (azul gov.br),
  em vez da cor de destaque dinâmica do color scheme do Discourse.
- Botões preenchidos: cor sólida fixa `#1351b3` (a mesma extremidade clara
  do gradiente do cabeçalho), pelo mesmo motivo. Botões `.secundario`/`.link`
  continuam acompanhando o color scheme do Discourse.
- Cor de "alerta" (observações do Passo 4, override de teto, avisos):
  voltou a ser laranja fixo (`#9a3d00`/`#fff3e8`, a paleta original do
  protótipo standalone) em vez do `--danger` do Discourse, que é vermelho —
  mais adequado a erro/ação destrutiva do que a um aviso de atenção.
- Subtítulo do cabeçalho: removida a marcação "RC1", substituída pela versão
  do componente (ex.: "v1.1.0").

## [1.0.1] — 2026-07-01

Correções encontradas na primeira instalação real (ParticiPEN de teste).

### Corrigido

- **Instalação travava pedindo para liberar upload de `.json`.**
  `regua.json`/`tooltips.json` eram declarados em `about.json` sob
  `"assets"`, o que faz o Discourse tratá-los como uploads de verdade,
  sujeitos à configuração de site `authorized_extensions` (que não libera
  `json` por padrão). Os dados da régua e dos tooltips agora ficam embutidos
  como código JavaScript dentro do próprio initializer — não são mais
  uploads, então a instalação não exige nenhuma mudança de configuração do
  site. `about.json` não declara mais `"assets"`.
- **Ambiguidade no formato de `demandas_category_id`** (número vs. nome/slug
  da categoria). A setting mudou de `string` para `type: integer` — o admin
  agora vê um campo numérico de verdade, e não há mais como digitar um slug
  por engano. Default mudou de `""` para `0` (mesmo significado: desligado).
- **Diagnóstico de "botão não aparece"**: a checagem de grupo autorizado
  agora loga no console do navegador exatamente por que o botão ficou
  oculto (usuário deslogado, `currentUser.groups` indisponível, ou grupo do
  usuário não bate com `grupo_autorizado`), e a comparação de nome de grupo
  passou a ser *case-insensitive*.

## [1.0.0] — 2026-07-01

Primeiro lançamento estável do theme component.

### Adicionado

- Estrutura mínima do theme component (`about.json`, `LICENSE` MIT,
  `.gitignore`).
- Migração dos assets da calculadora standalone
  ([pedrohpms/matriz-sei](https://github.com/pedrohpms/matriz-sei)) para o
  formato de theme component: `regua.json`/`tooltips.json` como assets do
  tema, e o código da calculadora como *initializer* Ember/Discourse.
- Botão de rodapé **"Abrir na calculadora"** nos tópicos, que abre a
  calculadora em um modal.
- Preenchimento automático dos campos de identificação a partir do primeiro
  post do tópico, via parser do Form Template do ParticiPEN (lendo o `raw`
  markdown pela Store do Discourse — sem chamadas HTTP externas).
- Configuração `demandas_category_id`: restringe o botão a uma única
  categoria (ou desliga o componente inteiro, se vazio).
- Configuração `grupo_autorizado`: restringe o botão a membros de um grupo
  específico (padrão `gpsei`; vazio libera para qualquer usuário logado).
- Paleta de cores integrada ao color scheme do Discourse (`--primary`,
  `--secondary`, `--tertiary`, `--danger`, `--success` etc.) — a calculadora
  acompanha automaticamente trocas de scheme, incluindo dark mode.
- Layout responsivo do modal: tela cheia em viewports abaixo de 768px.
- Fluxo completo da matriz de priorização: seis passos (identificação,
  triagem por ato vinculado, curadoria de camada, pontuação dos cinco
  critérios, filtros automáticos, memória de cálculo), com tooltips
  contextuais (funcionam por hover, foco e tap) e geração de memória de
  cálculo em Markdown para colar como reply no tópico.

### Fora de escopo desta versão

- Publicação automática da memória de cálculo como reply no tópico
  (continua manual — o avaliador copia e cola).
- Filtros/busca por demandas já pontuadas.
- Exportação de ata consolidada em PDF.

Ver o README (seção "Roadmap de evolução prevista") para detalhes.
