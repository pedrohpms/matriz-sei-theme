# Changelog

Este projeto segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/)
e [Versionamento Semântico](https://semver.org/lang/pt-BR/).

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
