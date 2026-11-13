# Adendo v2.1 — Login local (usuário e senha) + guia de migração

Data: 2026-11-13
Status: aprovado pelo usuário em chat em 2026-11-13
Base: `2026-11-12-endpoint-manager-v2-design.md`. Este adendo **revoga** o não objetivo "Não manter login local por senha no app".

## Porquê

O usuário quer, além do SSO via Entra ID, uma opção de login com usuário e senha próprios do app. O caso de uso: pessoas que não estão no Entra, ou acesso quando o Entra está indisponível.

Ele também quer um guia passo a passo, para alguém leigo, de como trocar a versão v1 que está em produção por esta.

## Decisões do usuário

- O login local fica **ao lado** do SSO. As duas opções aparecem na mesma tela de entrada.
- **Só o admin cria** usuários locais.
- Um usuário local **pode virar admin**.
- O usuário aprovou a proposta abaixo como está ("está bom, pode fazer").

## Proposta aprovada

### Tela de entrada
- Botão "Entrar com Microsoft" (SSO) e, abaixo, um formulário com e-mail e senha (login local).

### Criação e gestão, na aba Acessos
- O admin clica em "Novo usuário local" e informa nome, e-mail e papel.
- O app gera uma **senha temporária** e a mostra **uma única vez**, para o admin repassar.
- No primeiro login, a troca da senha é **obrigatória** antes de usar o app.
- "Redefinir senha" gera uma nova senha temporária, que também exige troca.
- Cada pessoa aparece com a origem: **Microsoft** ou **Local**.

### Segurança
- Senha com no mínimo 12 caracteres, guardada com hash argon2id. Nunca em texto.
- 5 tentativas erradas bloqueiam a conta por 15 minutos. Também há limite por IP.
- A mensagem de erro é genérica e não revela se o e-mail existe.

### E-mail único
- Não dá para criar um usuário local com e-mail de alguém que já existe, nem de alguém que entra pela Microsoft.

### Configuração
- A variável `LOGIN_LOCAL=desligado` no `.env` desliga o login local. O default é ligado.

### Admin de emergência
- Um comando cria (ou redefine) um admin local direto no servidor, para quando ninguém consegue entrar.

### Banco
- Só **colunas novas** na tabela `usuario`. O Grafana não é afetado. As regras antigas continuam valendo: nada de renomear, remover ou mudar tipo de coluna.

### Guia
- Arquivo `docs/MIGRACAO-PRODUCAO.md`, para leigo, com comandos de copiar e colar e o que deve aparecer na tela em cada passo. Cobre:
  - backup do banco;
  - parar a v1;
  - baixar a v2 do GitHub;
  - preencher o `.env`;
  - registrar o app no Entra, clique a clique;
  - subir a v2 e fazer o primeiro login;
  - criar os usuários locais;
  - conferir o Grafana;
  - rollback.

## Decisões minhas (o usuário pode vetar)

- **L1 — Colunas novas em `usuario`:**
  - `origem VARCHAR(10) NOT NULL DEFAULT 'sso' CHECK (origem IN ('sso','local'))`;
  - `senha_hash TEXT`;
  - `trocar_senha BOOLEAN NOT NULL DEFAULT false`;
  - `falhas_login INTEGER NOT NULL DEFAULT 0`;
  - `bloqueado_ate TIMESTAMP`.

  O `sub` de um usuário local é `'local:' || lower(email)`.
- **L2 — Hash:** `@node-rs/argon2`, argon2id com os parâmetros padrão da lib. Quando o e-mail não existe, o login verifica a senha contra um hash fictício, para igualar o tempo de resposta.
- **L3 — Rotas novas:**
  - `GET /auth/config` (público) → `{ local: boolean }`.
  - `POST /auth/local/login { email, senha }` (exige XHR):
    - sucesso → `session.regenerate` e 200 `{ trocarSenha }`;
    - falha, bloqueio ou usuário SSO tentando senha → 401 `{ error: 'credenciais_invalidas' }`, sempre igual;
    - limite por IP: 20 tentativas por 15 min → 429 `{ error: 'muitas_tentativas' }`.
  - `POST /auth/local/senha { senhaAtual, novaSenha }` (sessão + XHR):
    - `novaSenha` com menos de 12 caracteres ou igual à atual → 400;
    - `senhaAtual` errada → 400 `{ error: 'senha_atual_incorreta' }`;
    - sucesso → `trocar_senha = false`.
  - `/auth/me` passa a incluir `origem` e `trocarSenha`.
  - Com `LOGIN_LOCAL=desligado`, `/auth/local/*` responde 404.
- **L4 — Troca obrigatória:**
  - Enquanto `trocar_senha` for true, toda rota de dados responde 403 `{ error: 'trocar_senha' }`.
  - `/auth/me`, `/auth/logout` e `/auth/local/senha` continuam liberadas.
- **L5 — Bloqueio por conta:**
  - Cada falha incrementa `falhas_login`. Na 5ª falha, `bloqueado_ate = now() + 15 min` e o contador zera.
  - Um login certo zera o contador.
  - Durante o bloqueio, até a senha certa recebe a resposta genérica 401.
- **L6 — Rotas admin:**
  - `POST /usuarios { nome, email, papel }` cria um usuário local → 201 `{ usuario, senhaTemporaria }`. E-mail já existente (em qualquer origem, sem diferenciar caixa) → 409 `{ error: 'email_em_uso' }`.
  - `POST /usuarios/:id/redefinir-senha` → 200 `{ senhaTemporaria }`. Só funciona para usuário local; para SSO → 400. Também zera falhas e bloqueio.
  - `GET /usuarios` passa a incluir `origem`.
  - A regra do último admin continua valendo.
- **L7 — Senha temporária:** 16 caracteres aleatórios gerados com `crypto`, sem caracteres ambíguos (0/O, 1/l/I).
- **L8 — Script de emergência:** `node scripts/criar-admin-local.js <email> "<nome>"`.
  - Se o e-mail não existe, cria um usuário local com papel admin.
  - Se existe e é local, redefine a senha e o promove a admin.
  - Se existe e é SSO, recusa com mensagem.
  - Imprime a senha temporária.
  - Uso em produção: `docker compose exec backend node scripts/criar-admin-local.js ...`.
- **L9 — Frontend:**
  - Um 401 em `/auth/me` deixa de redirecionar direto para o SSO e mostra a **tela de Login**. Um 401 no meio do uso também leva a essa tela.
  - A tela de Login se adapta a `GET /auth/config`.
  - A tela "Trocar senha" é obrigatória quando `trocarSenha`.
  - Na aba Acessos:
    - formulário inline "Novo usuário local";
    - painel que mostra a senha temporária uma vez, com botão copiar e o aviso "não será mostrada de novo";
    - "Redefinir senha" com confirmação inline;
    - chip de origem.
- **L10 — Conflito de e-mail no SSO:** se alguém entra via Entra com o e-mail de um usuário local já existente, nasce uma conta SSO separada (o `sub` é diferente). O bootstrap admin só considera contas SSO. Limitação aceita; documentar no guia.
- **L11 — OIDC continua obrigatório** na configuração. O guia é para Entra.

## Pronto quando

1. No lab, o admin cria um usuário local na aba Acessos e vê a senha temporária.
2. Esse usuário entra com e-mail e senha, é forçado a trocar a senha, e depois usa o app conforme o papel dele.
3. Promover um usuário local a admin funciona.
4. Com 5 senhas erradas, a conta fica bloqueada (a resposta é sempre genérica).
5. Com `LOGIN_LOCAL=desligado`, o formulário some e as rotas respondem 404.
6. O script de emergência cria um admin local que consegue entrar.
7. O SSO continua funcionando como antes.
8. Os testes do backend passam e as colunas legadas continuam intactas.
9. `docs/MIGRACAO-PRODUCAO.md` cobre todos os itens do Guia, em linguagem para leigo.
