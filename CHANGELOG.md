# Changelog

Este projeto segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e [Versionamento Semântico](https://semver.org/lang/pt-BR/).

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
