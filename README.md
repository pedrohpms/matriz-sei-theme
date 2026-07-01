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

O componente está na Iteração 2: os dados e o código da calculadora
(originalmente no protótipo standalone
[pedrohpms/matriz-sei](https://github.com/pedrohpms/matriz-sei)) já foram
migrados para dentro do theme component, mas **ainda não aparece nada
visualmente no fórum**. O botão que abre a calculadora dentro de um tópico do
ParticiPEN é a Iteração 3.

## Estrutura de assets

- `javascripts/discourse/initializers/matriz-sei-calc-init.js` — o código da
  calculadora, carregado pelo Discourse como *initializer* (roda uma vez,
  quando o fórum inicializa). Nesta iteração ele só carrega os dados de
  `regua.json`/`tooltips.json` e confirma no console do navegador que rodou
  (`console.info("Matriz SEI calc initializer carregado")`); ainda não monta
  a interface.
- `javascripts/discourse/regua.json` e `javascripts/discourse/tooltips.json`
  — os dados da régua de critérios e dos textos de ajuda contextual.
  Declarados em `about.json` sob `"assets"`, o que faz o Discourse
  disponibilizá-los por URL própria em runtime (acessível pelo initializer
  via `settings.theme_uploads.regua` e `settings.theme_uploads.tooltips`).
- `common/common.scss` — o estilo visual da calculadora, escopado sob a
  classe `.matriz-sei-calc` para não vazar para o resto do fórum.
- `common/head_tag.html` — o HTML da calculadora, dentro de um
  `<template id="matriz-sei-calc-template">`. Um `<template>` não é
  renderizado automaticamente; ele só vira tela quando algo o clonar para
  dentro do DOM — isso é o que a Iteração 3 vai fazer, ao abrir a
  calculadora num modal.

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

Esta versão ainda não possui nenhuma configuração. As opções ajustáveis pelo
administrador (por exemplo, qual categoria do fórum concentra as demandas do
SEI) serão introduzidas na Iteração 5 do projeto, junto com o arquivo
`settings.yml`. Este README será atualizado quando isso acontecer.

## Governança do SEI

Para entender o modelo de governança e priorização em que esta calculadora se
baseia, consulte o consolidado do modelo de governança do SEI:
`TODO: incluir link do consolidado de governança do SEI`.
