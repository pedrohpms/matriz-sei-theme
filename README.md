# Matriz SEI — Calculadora de Priorização

Este é um *theme component* do Discourse que embarca, dentro do ParticiPEN, a
calculadora de priorização de demandas do SEI (Sistema Eletrônico de
Informações).

## O que é

O SEI recebe continuamente pedidos de melhoria, correção e evolução vindos de
diferentes áreas. Para decidir o que priorizar, a equipe de governança do SEI
(GPSEI) usa uma matriz simples: cinco critérios avaliados numa escala de 0 a
4, somados para gerar uma pontuação de 0 a 20. Esse componente coloca essa
calculadora diretamente dentro dos tópicos do ParticiPEN, para que a
priorização de uma demanda possa ser feita no mesmo lugar onde ela foi
proposta e discutida.

## Para quem é

Para os administradores e moderadores do ParticiPEN que fazem parte da GPSEI
e são responsáveis por triar e priorizar as demandas do SEI. Não é necessário
conhecimento técnico para usar — instalar o componente é uma operação de
poucos cliques feita pelo painel administrativo do Discourse.

## O que ele faz (nesta versão)

O componente está na Iteração 5: nos tópicos da categoria configurada (ver
"Configurações" abaixo), aparece um botão **"Abrir na calculadora"** no
rodapé do tópico — mas só para quem está logado **e** é membro do grupo
autorizado (por padrão, `gpsei`). Clicar nele abre a calculadora num modal e
já preenche os campos automaticamente a partir do primeiro post do tópico
(se ele seguir o Form Template do ParticiPEN) — sem nenhuma chamada de rede
própria da calculadora: o post é lido pela mesma Store interna que o resto
do Discourse usa. Se o post não estiver nesse formato, os campos ficam em
branco para preenchimento manual. O código da calculadora vem do protótipo
standalone [pedrohpms/matriz-sei](https://github.com/pedrohpms/matriz-sei).

Depois de pontuar a demanda, o avaliador copia a memória de cálculo em
Markdown (botão "Copiar markdown") e cola manualmente como reply no tópico.
Publicar essa memória automaticamente como reply é uma evolução prevista,
ainda não implementada nesta versão.

## Estrutura de assets

- `javascripts/discourse/initializers/matriz-sei-calc-init.js` — o código da
  calculadora, carregado pelo Discourse como *initializer* (roda uma vez,
  quando o fórum inicializa). Carrega `regua.json`/`tooltips.json`, registra
  o botão de rodapé do tópico (`api.registerTopicFooterButton`) e contém a
  lógica que abre o modal, popula os campos a partir do post e monta a
  interface dentro dele. O parser do Form Template (`parseFormTemplateBody`)
  lê o `raw` markdown do primeiro post via Store do Discourse
  (`store.find("post", id)`) — a calculadora não faz nenhuma chamada HTTP
  própria (confirmável pela aba Network do DevTools ao abrir o modal); as
  únicas requisições de rede são as do próprio Discourse e o carregamento dos
  assets do tema (`regua.json`/`tooltips.json`), que já existiam antes.
- `javascripts/discourse/regua.json` e `javascripts/discourse/tooltips.json`
  — os dados da régua de critérios e dos textos de ajuda contextual.
  Declarados em `about.json` sob `"assets"`, o que faz o Discourse
  disponibilizá-los por URL própria em runtime (acessível pelo initializer
  via `settings.theme_uploads.regua` e `settings.theme_uploads.tooltips`).
- `common/common.scss` — o estilo visual da calculadora, escopado sob a
  classe `.matriz-sei-calc` para não vazar para o resto do fórum, mais o
  estilo do overlay do modal (`.matriz-sei-overlay`/`.matriz-sei-dialog`).
- `common/head_tag.html` — o HTML da calculadora, dentro de um
  `<template id="matriz-sei-calc-template">`. Ao clicar no botão de rodapé,
  o initializer clona esse template para dentro de um modal próprio (overlay
  com fundo escurecido, fecha com ESC, clique fora ou no ×).
- `settings.yml` — as configurações `demandas_category_id` e
  `grupo_autorizado` (ver "Configurações" abaixo).
- `locales/pt_BR.yml` — os textos do botão de rodapé.

## Como instalar

1. No ParticiPEN, acesse **Admin → Customize → Themes**.
2. Clique em **Install**.
3. Escolha a opção **From a Git Repository**.
4. Cole a URL deste repositório:
   `https://github.com/pedrohpms/matriz-sei-theme`
5. Confirme a instalação. O componente aparecerá na lista de themes/components
   e pode ser habilitado normalmente.

Por ser um *component* (e não um *theme* completo), ele pode ser adicionado a
qualquer theme já em uso no ParticiPEN, sem substituí-lo.

## Configurações (settings)

Em **Admin → Customize → Themes → Matriz SEI → Configurações**, há duas opções:

- **demandas_category_id**: o ID numérico da categoria do ParticiPEN em que o
  botão "Abrir na calculadora" deve aparecer. Encontre o ID em
  `/admin/customize/categories` (aparece na URL da categoria ou no painel de
  edição dela). Deixe em branco para manter o componente desligado — nesse
  caso o botão não aparece em nenhuma categoria.
- **grupo_autorizado**: o nome do grupo do Discourse cujos membros podem ver
  e usar o botão "Abrir na calculadora". Vem pré-configurado como `gpsei`.

  Para usar a restrição padrão, crie um grupo chamado **gpsei** em
  **Admin → Users → Groups** e adicione como membros os avaliadores da
  GPSEI. O grupo **não precisa ser público** — pode ficar com visibilidade
  restrita a admins/membros, isso não afeta a checagem do botão (ela só olha
  se o usuário pertence ao grupo, não a visibilidade da página do grupo).

  Se preferir abrir o uso para qualquer usuário logado do ParticiPEN
  (sem exigir grupo), basta **esvaziar** o campo `grupo_autorizado` nas
  configurações do componente.

  As duas condições — categoria certa e grupo certo — precisam valer ao
  mesmo tempo para o botão aparecer.

## Evoluções futuras

- **Publicação automática da memória de cálculo como reply no tópico.**
  Hoje o avaliador copia o Markdown gerado (botão "Copiar markdown") e cola
  manualmente como resposta no tópico. Publicar isso automaticamente (via
  API de posts do Discourse) é uma evolução prevista, ainda não implementada.

## Governança do SEI

Para entender o modelo de governança e priorização em que esta calculadora se
baseia, consulte o consolidado do modelo de governança do SEI:
`TODO: incluir link do consolidado de governança do SEI`.
