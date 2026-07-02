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

## O que ele faz (v1.1.0)

Nos tópicos da categoria configurada, aparece um botão **"Abrir na
calculadora"** no rodapé do tópico — visível só para quem está logado **e**
é membro do grupo autorizado (por padrão, `gpsei`). Clicar nele abre a
calculadora num modal, sempre no Passo 1 (Identificação), com três campos já
pré-preenchidos para o avaliador conferir: **avaliador** (nome de quem
clicou no botão), **link público** (URL do próprio tópico) e os campos de
identificação da demanda, extraídos automaticamente do primeiro post do
tópico se ele seguir o Form Template do ParticiPEN — sem nenhuma chamada de
rede própria da calculadora: o post é lido pela mesma Store interna que o
resto do Discourse usa. Se o post não estiver nesse formato, os campos de
identificação ficam em branco para preenchimento manual (avaliador e link
continuam preenchidos).

O avaliador confere/completa os dados e percorre os seis passos
(identificação, triagem, curadoria de camada, pontuação, filtros
automáticos, memória de cálculo). No Passo 6, o botão **"Postar avaliação"**
copia a memória de cálculo em Markdown para a área de transferência **e**
publica automaticamente como reply no próprio tópico, em nome do avaliador
logado. Os botões "Copiar markdown" (só copia) e "Baixar JSON" continuam
disponíveis como alternativa.

Fundos, texto e bordas acompanham o color scheme ativo do fórum (claro/
escuro) automaticamente, porque usam as variáveis de tema do próprio
Discourse. O azul do cabeçalho/botões (gov.br) e o laranja dos avisos são
cores fixas, de propósito — identidade visual da GPSEI, independente do
scheme.

O código da calculadora vem do protótipo standalone
[pedrohpms/matriz-sei](https://github.com/pedrohpms/matriz-sei).

## Estrutura de assets

- `javascripts/discourse/initializers/matriz-sei-calc-init.js` — o código da
  calculadora, carregado pelo Discourse como *initializer* (roda uma vez,
  quando o fórum inicializa). Contém os dados da régua de critérios e dos
  textos de ajuda contextual (embutidos como código JS — não são arquivos
  enviados por upload, então não dependem de nenhuma configuração de
  extensões permitidas do site), registra o botão de rodapé do tópico
  (`api.registerTopicFooterButton`) e contém a lógica que abre o modal,
  popula os campos a partir do post e monta a interface dentro dele. O
  parser do Form Template (`parseFormTemplateBody`) lê o `raw` markdown do
  primeiro post via Store do Discourse (`store.find("post", id)`) — a
  calculadora não faz nenhuma chamada HTTP própria (confirmável pela aba
  Network do DevTools ao abrir o modal).
- `common/common.scss` — o estilo visual da calculadora, escopado sob a
  classe `.matriz-sei-calc` para não vazar para o resto do fórum, mais o
  estilo do overlay do modal (`.matriz-sei-overlay`/`.matriz-sei-dialog`).
  Fundos, texto e bordas usam as variáveis de color scheme do Discourse
  (`--primary`, `--secondary`, `--primary-low` etc.), então seguem o scheme
  ativo do fórum, incluindo dark mode. O azul do cabeçalho/botões e o
  laranja dos avisos são cores fixas (identidade visual da GPSEI).
- `common/head_tag.html` — o HTML da calculadora, dentro de um
  `<template id="matriz-sei-calc-template">`. Ao clicar no botão de rodapé,
  o initializer clona esse template para dentro de um modal próprio (overlay
  com fundo escurecido, fecha com ESC, clique fora ou no ×; em telas abaixo
  de 768px o modal ocupa a tela inteira).
- `settings.yml` — as configurações `demandas_category_id` e
  `grupo_autorizado` (ver "Configurações" abaixo).
- `locales/pt_BR.yml` — os textos do botão de rodapé, acessados via
  `themePrefix("topic.matriz_sei.open_button")` (não pela chave crua —
  traduções de tema do Discourse vivem num namespace próprio).

## Como instalar

1. No ParticiPEN, acesse **Admin → Customize → Themes**.

   > 📷 *Screenshot sugerido: tela de listagem de Themes, com o botão
   > "Install" em destaque.*

2. Clique em **Install**.
3. Escolha a opção **From a Git Repository**.

   > 📷 *Screenshot sugerido: o diálogo de instalação com as opções "From a
   > theme or component", "From a Git Repository", "From your device" etc.,
   > mostrando qual escolher.*

4. Cole a URL deste repositório:
   `https://github.com/pedrohpms/matriz-sei-theme`

   > 📷 *Screenshot sugerido: o campo de URL preenchido, antes de confirmar.*

5. Confirme a instalação. O componente aparecerá na lista de themes/components
   e pode ser habilitado normalmente.

   > 📷 *Screenshot sugerido: o componente "Matriz SEI — Calculadora de
   > Priorização" já aparecendo na lista, com o toggle de habilitado/
   > desabilitado visível.*

Por ser um *component* (e não um *theme* completo), ele pode ser adicionado a
qualquer theme já em uso no ParticiPEN, sem substituí-lo — na tela do theme
principal, em **Components**, marque este componente para ativá-lo nele.

## Configurações (settings)

Em **Admin → Customize → Themes → Matriz SEI → Configurações**, há duas opções:

> 📷 *Screenshot sugerido: a tela de configurações do componente, com os
> campos `demandas_category_id` e `grupo_autorizado` visíveis.*

- **demandas_category_id**: o ID **numérico** da categoria do ParticiPEN em
  que o botão "Abrir na calculadora" deve aparecer — é um campo numérico no
  admin, não aceita texto. **Não é o nome nem o slug da categoria** (ex.:
  não é `melhorias-do-sei`, é o número que aparece na URL dela — em
  `/c/melhorias-do-sei/42`, o ID é `42`). Confirme em
  `/admin/customize/categories`. Deixe `0` (padrão) para manter o componente
  desligado — nesse caso o botão não aparece em nenhuma categoria.
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

## Solução de problemas

**A instalação pede para permitir upload de `.json` ou algo parecido:**
Isso foi um bug de uma versão anterior (assets `regua.json`/`tooltips.json`
declarados em `about.json`, tratados como upload e bloqueados pela
configuração de site `authorized_extensions`). Desde a v1.0.1 esses dados
estão embutidos no próprio código do tema — não são mais uploads, então esse
problema não deveria mais acontecer. Se ele voltar a aparecer, você está numa
versão desatualizada: rode **Update** no theme (ver abaixo) e tente de novo.
Se você chegou a alterar `authorized_extensions` do site por causa disso numa
tentativa anterior, pode reverter — não é mais necessário.

**O botão "Abrir na calculadora" não aparece em nenhum tópico:**

1. Confira se `demandas_category_id` está preenchido nas configurações do
   componente com o **número** da categoria (vem `0` por padrão — isso
   desliga o botão em qualquer categoria, de propósito, até o admin
   configurar). É o ID numérico, não o nome nem o slug da categoria — ver
   "Configurações" acima para como encontrá-lo.
2. Confira se o tópico em que você está testando é da categoria configurada
   (o ID precisa bater exatamente — confirme em
   `/admin/customize/categories`).
3. Confira se você está logado com um usuário que pertence ao grupo
   configurado em `grupo_autorizado` (vem pré-configurado como `gpsei`). Se
   o grupo `gpsei` ainda não existir no seu ParticiPEN, crie-o em
   **Admin → Users → Groups** e adicione o usuário de teste como membro —
   **ou** esvazie `grupo_autorizado` para liberar o botão a qualquer usuário
   logado, sem exigir grupo.
4. Se você acabou de ser adicionado ao grupo, **recarregue a página**
   (F5) — o navegador só sabe dos seus grupos no momento em que a sessão foi
   carregada.
5. Abra o Console do navegador (F12 → Console) e recarregue o tópico: se o
   usuário estiver na categoria certa mas fora do grupo, o initializer loga
   um `console.info`/`console.warn` dizendo exatamente qual grupo falta e
   quais grupos o usuário tem hoje.

Se depois de checar os itens acima o botão ainda não aparecer com uma
mensagem de console clara, é sinal de um comportamento inesperado — abra uma
issue no repositório com o texto exato do console.

**O botão "Postar avaliação" não publica a resposta:** o Markdown já foi
copiado para a área de transferência mesmo assim (cole manualmente como
reply). A publicação automática pode falhar por falta de permissão do
avaliador para postar naquela categoria/tópico (ex.: tópico fechado, categoria
restrita), ou por algum outro erro do lado do Discourse — o console mostra o
motivo (`Matriz SEI calc: falha ao publicar a resposta`).

## Atualizando o theme

Quando houver uma nova versão publicada no repositório (`git push` numa
branch que o ParticiPEN acompanha, normalmente `main`):

1. Acesse **Admin → Customize → Themes → Matriz SEI**.
2. Clique em **Update** (ou no ícone de atualização, dependendo da versão do
   Discourse). O ParticiPEN puxa o commit mais recente do repositório.

   > 📷 *Screenshot sugerido: a tela de detalhes do theme component, com o
   > botão/link de "Update" e a versão/commit atual visíveis.*

3. Não é necessário reinstalar nem reconfigurar as settings — elas
   persistem entre atualizações.

## Roadmap de evolução prevista

Fora de escopo desta versão, mas já mapeado para o futuro:

- **Filtros e busca por demandas já pontuadas.** Uma visão que liste ou
  filtre tópicos que já passaram pela calculadora (por score, camada,
  desfecho etc.), hoje inexistente — cada memória de cálculo vive isolada no
  reply do seu próprio tópico.
- **Exportação da ata para PDF.** Gerar um PDF consolidado de uma reunião
  de priorização (várias memórias de cálculo juntas), para arquivamento ou
  distribuição fora do Discourse.

~~Publicação automática de reply com a memória de cálculo~~ — entregue na
v1.1.0 (botão "Postar avaliação").

## Governança do SEI

Para entender o modelo de governança e priorização em que esta calculadora se
baseia, consulte o consolidado do modelo de governança do SEI:
`TODO: incluir link do consolidado de governança do SEI`.
