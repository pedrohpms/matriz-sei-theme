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

Esta é a primeira entrega do componente: apenas a estrutura mínima exigida
pelo Discourse para que ele possa ser instalado e habilitado. Ainda não há
nenhuma funcionalidade visível — a calculadora em si (telas, cálculo de
pontuação, geração de memória de decisão) será adicionada nas próximas
iterações.

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
