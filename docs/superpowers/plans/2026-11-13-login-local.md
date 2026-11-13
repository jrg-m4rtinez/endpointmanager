# Login local + guia de migração — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar login por usuário e senha, criado pelo admin, ao lado do SSO Entra. Escrever o guia para leigo de como substituir a v1 em produção.

**Architecture:**
- Mesma tabela `usuario`, com colunas novas. Rotas `/auth/local/*` no mesmo `authRouter`.
- O guard `requireAuth` passa a bloquear quem tem `trocar_senha`.
- Rotas admin novas em `usuarios.js`.
- No frontend, telas Login e Trocar senha antes do shell.
- O script de emergência usa as mesmas funções do backend.

**Tech Stack:**
- Existente: Express 5, pg, Vitest/Supertest, React/Tailwind.
- Novas dependências: `@node-rs/argon2` (hash) e `express-rate-limit` (limite por IP).

**Spec:** `docs/superpowers/specs/2026-11-13-login-local-design.md`. O spec base é `docs/superpowers/specs/2026-11-12-endpoint-manager-v2-design.md`.

## Global Constraints

- **Grafana:** só mudanças aditivas no banco. Colunas novas sempre com `ADD COLUMN IF NOT EXISTS`, nullable ou com DEFAULT. Nunca alterar colunas existentes.
- **Senhas:**
  - nunca em texto: não ir para log, resposta (exceto a `senhaTemporaria` na criação ou redefinição) nem arquivo commitado;
  - hash argon2id;
  - mínimo de 12 caracteres.
- **Login local:** falhou → sempre 401 `{ error: 'credenciais_invalidas' }`, inclusive com conta bloqueada, conta SSO ou e-mail inexistente.
- **Limites:** 5 falhas → bloqueio de 15 min por conta; 20 tentativas por 15 min por IP → 429 `{ error: 'muitas_tentativas' }`.
- **Senha temporária:** 16 caracteres, alfabeto sem `0 O 1 l I`.
- **Mutações:** continuam exigindo `X-Requested-With: XMLHttpRequest`. Sessão regenerada após login.
- **`LOGIN_LOCAL`:**
  - valores `ligado` (default) ou `desligado`;
  - `desligado` → `/auth/local/*` responde 404 e `GET /auth/config` retorna `{ local: false }`;
  - `POST /usuarios` (criar local) responde 400 `{ error: 'login_local_desligado' }`.
- **Git:** branch `feat/login-local`. Commit ao fim de cada task, com o rodapé `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Idioma:** UI e mensagens em pt-BR.
- **Containers:** não mexer em `secops-*` nem `defectdojo-*`. O lab sobe com `docker compose -f docker-compose.yml -f docker-compose.lab.yml`. O banco de teste é `em-test-pg`, na porta 55432.

## Review Focus

1. **Enumeração de usuário:** e-mail inexistente, conta SSO, conta bloqueada e senha errada devem dar a mesma resposta e um tempo parecido (hash fictício). Task 1.
2. **Troca obrigatória burlada:** um usuário com `trocar_senha` chamando a API direto, por exemplo `GET /endpoints`, deve receber 403 `trocar_senha`, não os dados. Task 1.
3. **Admin rebaixando ou alterando a si mesmo e a regra do último admin com usuários locais:** a regra continua valendo para contas de qualquer origem. Task 2.
4. **E-mail com caixa diferente:** `Ana@X.com` local, quando já existe `ana@x.com` SSO → 409 `email_em_uso`. O login local também não diferencia caixa. Tasks 1 e 2.
5. **Sessão expirada no meio do uso agora vai para a tela de Login**, e não para o SSO direto. Login local com erro mostra mensagem, sem loop. Task 3.

---

### Task 1: Backend — schema, senha, login local, troca obrigatória

**Files:**
- Modify: `backend/package.json` (deps), `backend/src/migrate.js`, `backend/src/config.js`, `backend/src/auth/routes.js`, `backend/src/auth/guards.js`, `backend/src/app.js` (se precisar)
- Create: `backend/src/auth/senha.js`, `backend/src/auth/local.js`, `backend/test/loginLocal.test.js`

**Interfaces:**
- Produces:
  - `config.loginLocal: boolean`, lido de `LOGIN_LOCAL`. Ausente ou `ligado` → true; `desligado` → false; outro valor → erro de startup em pt-BR.
  - `senha.js`:
    - `hashSenha(texto) → Promise<string>`;
    - `verificarSenha(hash, texto) → Promise<boolean>`;
    - `gerarSenhaTemporaria() → string`, com 16 caracteres do alfabeto `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789`;
    - `validarNovaSenha(texto) → string | null`, que devolve a mensagem de erro pt-BR ou null.
  - `local.js`, com `autenticarLocal(pool, email, senha) → Promise<usuario | null>`:
    - aplica a regra de bloqueio L5;
    - usa um hash fictício quando o usuário não existe ou não é local;
    - compara o e-mail com `lower()`.
  - Migração: as colunas de L1 do spec, aditivas.
  - Rotas (em `authRouter`):
    - `GET /auth/config` → `{ local }`;
    - `POST /auth/local/login`: rate limit por IP via `express-rate-limit` (`windowMs` 15 min, `limit` 20, handler 429 `muitas_tentativas`). Exige XHR. Sucesso → regenerate, `userId` e 200 `{ trocarSenha }`;
    - `POST /auth/local/senha` (`requireAuth` sem o bloqueio de troca + XHR): só para `origem='local'`; outra origem → 400.
    - `/auth/me` → `{ id, nome, email, papel, origem, trocarSenha }`.
  - `requireAuth` carrega `origem` e `trocar_senha`. Exporta `requireSenhaTrocada`, que responde 403 `{ error: 'trocar_senha' }`. Montar `requireSenhaTrocada` junto do `requireAuth` das rotas de dados em `app.js`, **não** nas rotas `/auth/*`.
  - Logout de usuário local (sem `idToken`) → `{ redirect: '/' }`, como já acontece.

- [ ] **Step 1: Instalar deps.** `cd backend && npm install @node-rs/argon2 express-rate-limit` → sem erro. Confirmar que o binário do argon2 funciona em `node:22-alpine` (musl): rebuild da imagem do backend do lab na Task 3, ou agora com `docker build backend`.
- [ ] **Step 2: Escrever os testes que falham** (`test/loginLocal.test.js`). Inserir usuários locais direto no banco com `hashSenha`.

```js
it('GET /auth/config → { local: true } por padrão; desligado → false e /auth/local/login 404', ...)
it('login local certo → 200 { trocarSenha }, sessão criada, /auth/me traz origem "local"', ...)
it('e-mail sem diferenciar caixa: "Ana@X.com" acha "ana@x.com"', ...)
it('senha errada, e-mail inexistente, conta SSO → todos 401 credenciais_invalidas idênticos', ...)
it('5 falhas bloqueiam: 6ª tentativa com senha CERTA → 401 genérico; após 15 min (ajustar bloqueado_ate no banco) → 200', ...)
it('login certo zera falhas_login', ...)
it('21ª tentativa do mesmo IP em 15 min → 429 muitas_tentativas', ...)
it('sem X-Requested-With → 403 csrf', ...)
it('trocar_senha=true: GET /endpoints → 403 trocar_senha; /auth/me 200 com trocarSenha:true', ...)
it('POST /auth/local/senha: senhaAtual errada → 400 senha_atual_incorreta; nova < 12 ou igual à atual → 400; ok → 200 e /endpoints liberado', ...)
it('POST /auth/local/senha por usuário SSO → 400', ...)
it('sessão regenerada no login local (cookie muda)', ...)
it('migração idempotente e colunas legadas intactas com as colunas novas', ...)  // estender migrate.test.js
it('gerarSenhaTemporaria: 16 chars, só do alfabeto permitido; hash nunca igual ao texto', ...)
```

- [ ] **Step 3: Rodar e ver falhar.** `npx vitest run test/loginLocal.test.js` → FAIL
- [ ] **Step 4: Implementar.**
- [ ] **Step 5: Suíte inteira.** `npm test` → PASS. Testes antigos (SSO, guards) intactos.
- [ ] **Step 6: Commit.**

---

### Task 2: Backend — gestão de usuários locais e script de emergência

**Files:**
- Modify: `backend/src/routes/usuarios.js`
- Create: `backend/scripts/criar-admin-local.js`, `backend/test/usuariosLocais.test.js`

**Interfaces:**
- Consumes: `hashSenha`, `gerarSenhaTemporaria` (Task 1); `config.loginLocal`.
- Produces:
  - `GET /usuarios` inclui `origem` em cada item.
  - `POST /usuarios { nome, email, papel }` (admin):
    - valida nome e e-mail obrigatórios (trim), e-mail com formato mínimo `x@y` e papel válido;
    - e-mail existente com `lower()`, em qualquer origem → 409 `{ error: 'email_em_uso' }`;
    - cria com `origem='local'`, `sub='local:'+lower(email)`, `trocar_senha=true` e o hash da senha temporária;
    - responde 201 `{ usuario: { id, nome, email, papel, origem }, senhaTemporaria }`;
    - `config.loginLocal=false` → 400 `login_local_desligado`.
  - `POST /usuarios/:id/redefinir-senha` (admin):
    - só para local → nova temporária, `trocar_senha=true`, `falhas_login=0`, `bloqueado_ate=null`;
    - responde 200 `{ senhaTemporaria }`; SSO → 400 `{ error: 'usuario_sso' }`; inexistente → 404.
  - `PUT /usuarios/:id { papel }`: sem mudança, e a regra do último admin vale para qualquer origem.
  - `scripts/criar-admin-local.js <email> "<nome>"`: comportamento de L8. Usa `loadConfig`, `createPool`, `migrate` e fecha o pool no fim. Imprime a senha temporária e a instrução de trocar no primeiro login. Exit 1 com mensagem pt-BR em caso de erro ou de usuário SSO.
  - Mapear os códigos novos em `frontend/src/api.js` fica para a Task 3.

- [ ] **Step 1: Testes que falham** (`test/usuariosLocais.test.js`):

```js
it('admin cria local → 201 com senhaTemporaria (16 chars); usuário consegue logar com ela e cai em trocarSenha', ...)
it('email já existe (SSO, outra caixa) → 409 email_em_uso', ...)
it('leitor não cria (403); sem XHR → 403 csrf', ...)
it('loginLocal desligado → 400 login_local_desligado', ...)
it('redefinir-senha: local → nova senha funciona, a antiga não; zera bloqueio; SSO → 400 usuario_sso; inexistente → 404', ...)
it('promover local a admin funciona; rebaixar o único admin (local) → 409 ultimo_admin', ...)
it('GET /usuarios traz origem', ...)
it('resposta de GET /usuarios nunca contém senha_hash', ...)
it('script: cria admin local novo; reexecutar redefine senha; e-mail SSO → exit 1', ...)  // executar via child_process com env do banco de teste
```

- [ ] **Step 2: Ver falhar** → **Step 3: Implementar** → **Step 4: `npm test` PASS** → **Step 5: Commit**

---

### Task 3: Frontend — Login, Trocar senha, Acessos com usuários locais

**Files:**
- Create: `frontend/src/pages/Login.jsx`, `frontend/src/pages/TrocarSenha.jsx`
- Modify: `frontend/src/App.jsx`, `frontend/src/api.js`, `frontend/src/pages/Acessos.jsx`, `frontend/src/pages/AguardandoLiberacao.jsx` (se precisar do botão sair)

**Interfaces:**
- Consumes: as rotas das Tasks 1 e 2.
- Produces:
  - `api.js`:
    - 401 deixa de redirecionar para `/api/auth/login`. Passa a disparar o evento `window.dispatchEvent(new Event('sessao-expirada'))` e a lançar `ApiError`. O `App` escuta o evento e mostra `Login` com o aviso "Sua sessão expirou".
    - Exceção: a própria chamada `POST /auth/local/login` com 401 só lança o erro, para o Login mostrar "E-mail ou senha inválidos".
    - Mapear os códigos `credenciais_invalidas`, `muitas_tentativas`, `trocar_senha`, `senha_atual_incorreta`, `email_em_uso`, `usuario_sso`, `login_local_desligado`.
  - `App`:
    - `/auth/me` 401 → `<Login />`;
    - `trocarSenha` → `<TrocarSenha />`;
    - `pendente` → `AguardandoLiberacao`;
    - senão, shell;
    - `?erro=login` → Login com o aviso "Falha no login com a Microsoft".
  - `Login`: mesma estética da direção C, com um card central sobre o fundo escuro.
    - logo "Endpoint Manager";
    - botão "Entrar com Microsoft", um link para `/api/auth/login` com o ícone de janela;
    - divisor "ou";
    - formulário de e-mail e senha, só se `GET /auth/config` disser `local: true`;
    - botão "Entrar", com proteção contra duplo clique;
    - erros inline, foco no primeiro campo e `autocomplete` correto (`username` e `current-password`).
  - `TrocarSenha`:
    - campos senha atual, nova senha e confirmação, com `autocomplete` `new-password`;
    - indicador "mínimo 12 caracteres";
    - valida a confirmação no cliente;
    - sucesso → recarrega `/auth/me`;
    - botão sair.
  - `Acessos`:
    - chip de origem "Microsoft" ou "Local";
    - botão "+ Novo usuário local" (só se `config.local`) que abre uma linha inline com nome, e-mail, papel e ✓;
    - ao criar, painel destacado com a senha temporária em mono, botão "Copiar" (clipboard API), o texto "Anote agora: esta senha não será mostrada de novo" e o botão "Fechar";
    - "Redefinir senha" nas linhas locais, com confirmação inline, que mostra o mesmo painel;
    - o painel de senha não é guardado em nenhum storage.

- [ ] **Step 1: Implementar**
- [ ] **Step 2: Build.** `npm run build` limpo.
- [ ] **Step 3: Lab.**
  - Rebuild de **backend e frontend**, porque o backend ganhou deps nativas: `docker compose -f docker-compose.yml -f docker-compose.lab.yml up -d --build backend frontend`.
  - Verificar via curl com cookie jar:
    - admin (Keycloak `admin@lab.local` / `Admin@123`) cria o local `local1@lab.local` com papel leitor;
    - login local → `trocarSenha` true;
    - `/endpoints` → 403 `trocar_senha`;
    - trocar a senha → `/endpoints` 200;
    - 5 falhas → bloqueio.
  - Rodar o script de emergência: `docker compose ... exec backend node scripts/criar-admin-local.js emergencia@lab.local "Emergência"` → login funciona.
  - Testar `LOGIN_LOCAL=desligado` (recriar só o backend com a variável) → `/api/auth/config` `{local:false}`. **Depois restaurar** `ligado`.
- [ ] **Step 4: Restaurar o lab.** Apagar os usuários locais de teste (`DELETE FROM usuario WHERE origem='local'` no banco do lab). `/api/stats` deve voltar a 6/2/1 e o health a ok.
- [ ] **Step 5: Commit**

---

### Task 4: Guia de migração para leigo + README/PRODUCAO

**Files:**
- Create: `docs/MIGRACAO-PRODUCAO.md`
- Modify: `README.md` (seção de login local e script de emergência), `docs/PRODUCAO.md` (`LOGIN_LOCAL`, script de emergência, L10), `.env.example` (`LOGIN_LOCAL=ligado`, comentado)

**Conteúdo do `MIGRACAO-PRODUCAO.md`** (pt-BR, para leigo):
- Cada passo com:
  - **o que é**: uma frase simples;
  - **o comando exato**, num bloco para copiar e colar;
  - **o que deve aparecer**, com um exemplo da saída;
  - **se der errado**, o que fazer.
- Sem jargão sem explicação. Placeholders em `<MAIÚSCULAS>`, com uma tabela no início de "o que você precisa ter em mãos": IP do servidor, acesso SSH, usuário e senha do banco, URL do DefectDojo, conta de admin no portal Azure, nome DNS com HTTPS.

Seções, nesta ordem:
0. **Antes de começar:** checklist do que ter em mãos, janela de manutenção e quanto tempo leva.
1. **Entrar no servidor.** SSH, e como achar onde a v1 está: `docker ps`, `docker inspect`, para descobrir a pasta do compose antigo.
2. **Backup do banco.** `pg_dump` com o comando completo, conferir o tamanho do arquivo e copiar o arquivo para fora do servidor.
3. **Anotar a versão atual,** para o rollback: pasta, imagem e `docker compose ps`.
4. **Parar a v1.** `docker compose down`, **sem** `-v`. Explicar por que nunca usar `-v`.
5. **Baixar a v2.** `git clone https://github.com/jrg-m4rtinez/endpointmanager.git`, ou o zip pelo navegador, e entrar na pasta.
6. **Liberar o banco para o app.** Resumo do `pg_hba` e do GRANT, com link para a seção do `PRODUCAO.md`. Teste de conexão com o que deve aparecer.
7. **Registrar o app no Entra ID,** clique a clique no portal: nomes dos menus em português e inglês, onde copiar o Tenant ID, o Client ID e o Secret, a validade do secret e os redirect URIs.
8. **API key do DefectDojo,** usuário leitor.
9. **Preencher o `.env`.** `cp .env.example .env`, depois `nano .env`, explicando como editar e salvar no nano, e uma tabela com cada variável: o que é, de onde vem e um exemplo. Gerar o `SESSION_SECRET` com `openssl rand -hex 32`. Conferir que o arquivo NÃO tem as linhas do lab.
10. **HTTPS.** Explicar de forma simples, apontar as opções do `PRODUCAO.md` e dizer qual escolher.
11. **Subir a v2.** `docker compose up -d --build` (só o compose base), `docker compose ps` e `docker compose logs backend`, com o que deve aparecer.
12. **Primeiro login.** Entrar com o e-mail do `BOOTSTRAP_ADMIN_EMAIL` pelo botão Microsoft, conferir que aparece como admin e remover o `BOOTSTRAP_ADMIN_EMAIL` do `.env` com restart.
13. **Criar usuários locais.** Aba Acessos, "Novo usuário local", copiar a senha temporária e repassar com segurança. O usuário troca a senha no primeiro login. Também: dar acesso a quem entrou pela Microsoft.
14. **Admin de emergência.** Quando usar e o comando `docker compose exec backend node scripts/criar-admin-local.js ...`.
15. **Conferir o Grafana.** Abrir os dashboards; se algo quebrar, conferir as tabelas com a query do `PRODUCAO.md`.
16. **Se der errado: rollback.** Parar a v2, voltar para a pasta e a imagem da v1, `up -d`. Restaurar o backup **só se** necessário, com o aviso de que sobrescreve dados.
17. **Problemas comuns,** em linguagem simples: os erros de `PRODUCAO.md` §12 traduzidos, mais "esqueci a senha do usuário local" e "conta bloqueada".
18. **Glossário curto:** container, compose, `.env`, SSO, Entra, redirect URI, hash.

- [ ] **Step 1: Escrever.** Conferir cada comando e nome de variável contra o código real: `config.js`, os composes, `.env.example`, os scripts.
- [ ] **Step 2: Verificação.** `docker compose -f docker-compose.yml config` parseia; o script de emergência e os comandos `docker compose` citados existem; cada item da seção "Guia" do adendo está coberto.
- [ ] **Step 3: Commit**
