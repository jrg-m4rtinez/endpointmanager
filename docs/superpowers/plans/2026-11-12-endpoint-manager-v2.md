# Endpoint Manager v2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evoluir o Endpoint Manager com tipos, aba de hosts não classificados vindos do DefectDojo (Locations), SSO OIDC com papéis gerenciados no app, UI nova (direção C) e um lab local completo em Docker.

**Architecture:**
- Backend Express 5 modular, testável via `createApp(deps)` com dependências injetadas: pool, cliente DefectDojo, adaptador OIDC. O backend faz o fluxo OIDC (BFF) e guarda sessão em cookie `httpOnly` persistida no Postgres.
- O DefectDojo é lido só pela API v2, com cache em memória.
- Frontend React + Vite + Tailwind, atrás de nginx na mesma origem (`/api/` → backend).
- O lab vive num compose separado (`docker-compose.lab.yml`): Postgres do app e Keycloak com realm importado.

**Tech Stack:**
- Node 22, Express ^5.1, pg ^8, express-session ^1.18, connect-pg-simple ^10, openid-client ^6, Vitest ^3, Supertest ^7.
- React 18, Vite ^5, Tailwind CSS ^4 (`@tailwindcss/vite`), lucide-react.
- Postgres 16, Keycloak 26.0 (`quay.io/keycloak/keycloak:26.0`), DefectDojo 3.5.0 local (já rodando).

**Spec:** `docs/superpowers/specs/2026-11-12-endpoint-manager-v2-design.md`

## Global Constraints

- **Grafana:** nunca renomear, remover ou mudar o tipo de tabelas e colunas existentes (`departamento.*`, `departamento_endpoint.*`). Só tabelas novas e colunas novas nullable, com `IF NOT EXISTS`.
- **DefectDojo:** só leitura em runtime, via API v2 (`Authorization: Token <DD_API_KEY>`). Nunca acessar o banco dele. A única escrita é o script de seed do lab.
- **Segredos fora do navegador:** tokens OIDC e `DD_API_KEY` nunca chegam ao navegador.
- **Rotas de dados exigem sessão:**
  - GET: papel `leitor` ou `admin`;
  - POST/PUT/DELETE: papel `admin` e header `X-Requested-With: XMLHttpRequest`;
  - sem sessão → 401;
  - papel insuficiente ou `pendente` → 403.
- **Papéis:** exatamente `'pendente' | 'leitor' | 'admin'`. Default `pendente`.
- **Portas:** só o frontend é publicado (`3000:80`). O backend não publica `3001`.
- **Containers existentes:** não modificar `secops-*` nem `defectdojo-*`. A única exceção são dados de seed criados via API do DefectDojo local.
- **Configuração:** toda via `.env`. Nenhuma credencial hardcoded em compose. Remover `10.10.10.118` e `defectdojo/defectdojo` do `docker-compose.yml`.
- **Sem git:** o projeto não é um repositório git; o usuário versiona depois. Pular todos os passos de commit.
- **Idioma:** textos da UI e mensagens de erro em português (pt-BR).
- **API DefectDojo 3.5.0** (confirmado no OpenAPI local):
  - URLs: `GET /api/v2/url/` (singular), com campos `id, host, protocol, port, path, ...`;
  - vínculos com finding: `GET /api/v2/location_findings/`, com campos `location, location_type, location_value, finding, status`, onde `status ∈ Active|Mitigated|FalsePositive|RiskAccepted|OutOfScope`, e filtros `location_type_exact`, `status_equals`;
  - vínculos com produto: `GET /api/v2/location_products/`, com campos `location, location_value, product, status`;
  - paginação: `limit` / `offset`, com resposta `{count, next, results}`.

## Review Focus

1. **Host com maiúscula ou espaço:** `DB01.infra.lab ` cadastrado à mão deve contar como classificado para o host `db01.infra.lab` do DefectDojo. Hostnames não diferenciam caixa. A comparação usa `lower(trim())` dos dois lados (Task 7).
2. **DefectDojo fora do ar ou lento:** a aba Não classificados mostra um erro claro e o resto do app funciona. O cliente tem timeout de 10 s; a rota responde 502 e não fica pendurada (Tasks 6 e 7).
3. **Sessão expirada no meio do uso:** a API responde 401, nunca 403, e o frontend redireciona para o login em vez de mostrar uma tela vazia (Tasks 2 e 9).
4. **Duplo clique ou dois admins classificando o mesmo host:** a segunda tentativa recebe 409 "Endpoint já existe", o frontend avisa e recarrega a lista, e não entra linha duplicada (Tasks 3 e 10).
5. **DefectDojo com milhares de URLs:** todas as páginas (`next`) são seguidas. Nenhum host some por paginação (Task 6).

---

## File Structure

```
backend/
  package.json                 deps + scripts (test, test:db:up, test:db:down)
  Dockerfile                   node:22-alpine
  server.js                    entrypoint: waitForDb → migrate → createOidc → createApp → listen
  vitest.config.js
  scripts/seed-lab.js          seed do app (departamentos, endpoints já classificados)
  src/
    config.js                  loadConfig(env)
    db.js                      createPool(config), waitForDb(pool, opts)
    migrate.js                 migrate(pool)
    app.js                     createApp(deps)
    errors.js                  httpError(), asyncRoute mapeamento de erros pg
    auth/session.js            sessionMiddleware(pool, config)
    auth/oidc.js               createOidc(config) (openid-client real)
    auth/users.js              upsertUserOnLogin(pool, claims, bootstrapEmail)
    auth/guards.js             requireAuth, requireRole(...), requireXhrOnWrite
    auth/routes.js             authRouter({ pool, oidc, config })
    routes/health.js
    routes/departamentos.js
    routes/tipos.js
    routes/endpoints.js
    routes/usuarios.js
    routes/naoClassificados.js (inclui ignorados)
    routes/stats.js
    defectdojo/client.js       createDefectDojoClient(opts)
    defectdojo/hosts.js        hostFromLocationValue(), normalizeHost()
  test/
    helpers/db.js              freshDatabase() → { pool, drop }
    helpers/app.js             buildTestApp(overrides) + loginAs(agent, claims)
    helpers/fakeOidc.js
    fixtures/dd/*.json         respostas reais capturadas do DefectDojo local
    *.test.js
frontend/
  package.json, vite.config.js, index.html, nginx.conf
  src/
    main.jsx, index.css (Tailwind)
    api.js                     api(path, opts), ApiError
    App.jsx                    bootstrap de sessão + roteamento por aba
    components/Sidebar.jsx, StatCards.jsx, Toast.jsx (ToastProvider/useToast),
               InlineSelect.jsx, EmptyState.jsx, PageHeader.jsx
    pages/NaoClassificados.jsx, Endpoints.jsx, Departamentos.jsx, Tipos.jsx,
          Acessos.jsx, AguardandoLiberacao.jsx
docker-compose.yml             app (backend + frontend)
docker-compose.lab.yml         db + keycloak + overrides do backend
lab/keycloak/realm.json
lab/seed-defectdojo.mjs
.env.example
README.md, docs/PRODUCAO.md
```

---

### Task 1: Base do backend (config, banco, migração, teste, health)

**Files:**
- Modify: `backend/package.json`, `backend/Dockerfile`
- Create: `backend/vitest.config.js`, `backend/src/config.js`, `backend/src/db.js`, `backend/src/migrate.js`, `backend/src/errors.js`, `backend/src/app.js`, `backend/src/routes/health.js`, `backend/test/helpers/db.js`, `backend/test/migrate.test.js`, `backend/test/health.test.js`
- Keep: `backend/server.js` antigo até a Task 8 (substituído lá)

**Interfaces:**
- Produces:
  - `loadConfig(env = process.env) → { pg: {host,port,user,password,database}, appBaseUrl, sessionSecret, bootstrapAdminEmail, oidc: {issuer, clientId, clientSecret}, dd: {url, apiKey} | null, secureCookies: boolean }`. `secureCookies = appBaseUrl.startsWith('https://')`. `dd` é `null` se `DD_URL` ou `DD_API_KEY` estiver vazio.
  - `createPool(config) → pg.Pool` e `waitForDb(pool, { retries = 30, delayMs = 2000 }) → Promise<void>`, que lança erro após esgotar as tentativas.
  - `migrate(pool) → Promise<void>`, idempotente.
  - `createApp({ pool, ddClient, oidc, config }) → express.Application`. As rotas ficam sem prefixo `/api`, porque o nginx o remove.
  - `asyncRoute(fn)`: com Express 5 não é necessário; em vez dele, `errors.js` exporta um error handler `errorHandler(err, req, res, next)` que mapeia:
    - `err.status` → status próprio;
    - pg `23505` → 409;
    - pg `23503` → 400 `{ error: 'Referência inválida' }`;
    - resto → 500 `{ error: 'Erro interno' }`, com log.
  - `httpError(status, message) → Error`.
  - `freshDatabase() → Promise<{ pool, drop() }>`: cria um database `t_<random>` no Postgres de teste (`TEST_PG_URL`, default `postgres://postgres:test@localhost:55432/postgres`).

- [ ] **Step 1: Preparar dependências e scripts**

`package.json`:
- `"type": "commonjs"`;
- deps: `express@^5.1`, `pg`, `express-session`, `connect-pg-simple`, `openid-client@^6`;
- devDeps: `vitest@^3`, `supertest@^7`;
- scripts:
  - `"test": "vitest run"`;
  - `"test:db:up": "docker run -d --rm --name em-test-pg -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16-alpine"`;
  - `"test:db:down": "docker stop em-test-pg"`.

Remover `cors`. No `vitest.config.js`: `fileParallelism: false`, `testTimeout: 20000`.

Run: `cd backend && npm install && npm run test:db:up`
Expected: install sem erro; container `em-test-pg` rodando (`docker ps`).

- [ ] **Step 2: Escrever os testes que falham** (`test/migrate.test.js`, `test/health.test.js`)

```js
// migrate.test.js
it('cria tabelas novas e coluna tipo_id', async () => {
  await migrate(pool)
  const t = await tables(pool) // nomes em information_schema.tables public
  expect(t).toEqual(expect.arrayContaining(['departamento','departamento_endpoint','tipo','usuario','endpoint_ignorado']))
  expect(await columns(pool,'departamento_endpoint')).toContain('tipo_id')
})
it('é idempotente e não altera colunas legadas', async () => {
  // cria o schema v1 exato de backend/server.js antigo e insere 1 linha
  await createV1Schema(pool)
  const before = await columnDefs(pool, ['departamento','departamento_endpoint']) // name,data_type,is_nullable,column_default
  await migrate(pool); await migrate(pool)
  const after = await columnDefs(pool, ['departamento','departamento_endpoint'])
  expect(after.filter(c => c.column_name !== 'tipo_id')).toEqual(before)
  expect((await pool.query('select count(*)::int c from departamento_endpoint')).rows[0].c).toBe(1)
})
it('semeia tipos padrão só quando vazio', async () => {
  await migrate(pool)
  expect((await pool.query('select nome from tipo order by nome')).rows.map(r=>r.nome))
    .toEqual(['Aplicação Web','Banco de Dados','Servidor'])
  await pool.query("delete from tipo where nome='Servidor'"); await migrate(pool)
  expect((await pool.query('select count(*)::int c from tipo')).rows[0].c).toBe(2)
})
// health.test.js
it('GET /health → { db: "ok", defectdojo: "nao_configurado" } sem ddClient', ...)
it('GET /health → defectdojo "erro" quando ddClient.ping() rejeita', ...)
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd backend && npx vitest run test/migrate.test.js test/health.test.js`
Expected: FAIL (módulos inexistentes)

- [ ] **Step 4: Implementar** `config.js`, `db.js`, `migrate.js`, `errors.js`, `app.js`, `routes/health.js`

`migrate.js`:
- executa o DDL de D10 do spec, na ordem: `departamento`, `departamento_endpoint` (DDL v1 idêntico ao atual), `tipo`, `ALTER TABLE departamento_endpoint ADD COLUMN IF NOT EXISTS tipo_id INTEGER REFERENCES tipo(id) ON DELETE SET NULL`, `usuario`, `endpoint_ignorado`;
- seed dos tipos com `INSERT ... SELECT ... WHERE NOT EXISTS (SELECT 1 FROM tipo)`.

Health: `{ db: 'ok'|'erro', defectdojo: 'ok'|'erro'|'nao_configurado' }`, sempre 200 e público.

`app.js` desta task: `express.json()`, health e `errorHandler`. As outras rotas entram nas tasks seguintes.

- [ ] **Step 5: Rodar e ver passar**

Run: `cd backend && npm test`
Expected: PASS em todos

---

### Task 2: Autenticação (sessão, usuários, guards, rotas /auth)

**Files:**
- Create: `backend/src/auth/session.js`, `backend/src/auth/users.js`, `backend/src/auth/guards.js`, `backend/src/auth/routes.js`, `backend/test/helpers/fakeOidc.js`, `backend/test/helpers/app.js`, `backend/test/auth.test.js`
- Modify: `backend/src/app.js`

**Interfaces:**
- Consumes: `createApp`, `freshDatabase`, `migrate`, `loadConfig` (Task 1)
- Produces:
  - **Contrato do adaptador OIDC**, implementado pelo real (Task 8) e pelo fake:
    - `startLogin(session) → Promise<string>`: retorna a URL de redirect e guarda estado/PKCE em `session`;
    - `finishLogin(session, currentUrl: URL) → Promise<{ sub, email, name, idToken }>`;
    - `logoutUrl(idToken) → string | null`.
  - `upsertUserOnLogin(pool, { sub, email, name }, bootstrapEmail) → Promise<{ id, sub, email, nome, papel }>`:
    - faz upsert por `sub`, atualizando `email`, `nome` e `ultimo_login = now()`;
    - se `lower(email) === lower(bootstrapEmail)`, seta `papel='admin'`.
  - Guards (Express middleware):
    - `requireAuth`: sem `req.session.userId` → 401 `{ error: 'nao_autenticado' }`. Senão carrega `req.user` do banco a cada request, para que a mudança de papel valha na hora;
    - `requireRole(...papeis)`: papel fora da lista → 403 `{ error: 'aguardando_liberacao' }` se `pendente`, senão `{ error: 'sem_permissao' }`;
    - `requireXhrOnWrite`: em métodos ≠ GET/HEAD sem `X-Requested-With: XMLHttpRequest` → 403 `{ error: 'csrf' }`.
  - Rotas (sem prefixo):
    - `GET /auth/login` → 302 para `startLogin()`;
    - `GET /auth/callback` → `finishLogin`, `upsertUserOnLogin`, `session.regenerate`, grava `userId` e `idToken`, depois 302 para `config.appBaseUrl + '/'`. Em caso de erro → 302 `'/?erro=login'`;
    - `GET /auth/me` → 200 `{ id, nome, email, papel }` ou 401;
    - `POST /auth/logout` (exige XHR) → destrói a sessão e responde 200 `{ redirect: logoutUrl(idToken) ?? '/' }`.
  - `sessionMiddleware(pool, config)`:
    - store `connect-pg-simple` com `tableName: 'em_sessao'`, `createTableIfMissing: true`;
    - cookie `em.sid`, `httpOnly`, `sameSite: 'lax'`, `secure: config.secureCookies`, `maxAge` de 8 h.
    - `createApp` faz `app.set('trust proxy', 1)` quando `secureCookies`.
  - Helpers de teste:
    - `buildTestApp({ ddClient?, bootstrapAdminEmail? }) → { app, pool, drop }`;
    - `loginAs(agent, { sub, email, name }) → Promise<void>`: chama `/auth/login` e depois `/auth/callback?sub=..&email=..&name=..`. O fake lê os claims da query.

- [ ] **Step 1: Escrever os testes que falham** (`test/auth.test.js`)

```js
it('GET /auth/me sem sessão → 401', ...)
it('primeiro login cria usuário pendente', async () => {
  await loginAs(agent, { sub:'u1', email:'novo@lab.local', name:'Novo' })
  expect((await agent.get('/auth/me')).body).toMatchObject({ email:'novo@lab.local', papel:'pendente' })
})
it('BOOTSTRAP_ADMIN_EMAIL vira admin, sem diferenciar caixa', async () => {
  // buildTestApp({ bootstrapAdminEmail:'admin@lab.local' })
  await loginAs(agent, { sub:'a1', email:'Admin@Lab.Local', name:'A' })
  expect((await agent.get('/auth/me')).body.papel).toBe('admin')
})
it('segundo login atualiza nome/email e mantém papel', ...)
it('callback com erro do provedor → 302 para /?erro=login e sem sessão', ...)
it('POST /auth/logout sem X-Requested-With → 403', ...)
it('POST /auth/logout → sessão some (me → 401)', ...)
it('cookie de sessão é httpOnly e SameSite=Lax', ...)  // inspeciona set-cookie
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run test/auth.test.js`
Expected: FAIL

- [ ] **Step 3: Implementar** `session.js`, `users.js`, `guards.js`, `auth/routes.js`, `test/helpers/*`, e montar no `app.js`

Ordem no `createApp`: `trust proxy` → `express.json()` → `sessionMiddleware` → `/health` → `authRouter` → rotas de dados (`requireAuth`, `requireXhrOnWrite`, cada router define o papel) → `errorHandler`.

O fake OIDC lança erro em `finishLogin` quando a query tem `error=...`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npm test`
Expected: PASS

---

### Task 3: CRUD de departamentos, tipos e endpoints

**Files:**
- Create: `backend/src/routes/departamentos.js`, `backend/src/routes/tipos.js`, `backend/src/routes/endpoints.js`, `backend/test/crud.test.js`
- Modify: `backend/src/app.js`

**Interfaces:**
- Consumes: guards, `loginAs`, `buildTestApp` (Task 2)
- Produces (todas sob `requireAuth`; GET = leitor|admin; escrita = admin):
  - `GET /departamentos` → `[{ id, nome, created_at, total_endpoints }]`, ordenado por `nome`.
  - `POST /departamentos { nome }` → 201. `PUT /departamentos/:id { nome }` → 200 ou 404. `DELETE /departamentos/:id` → 204 ou 404.
  - `GET|POST|PUT|DELETE /tipos`: mesmo formato e mesmas regras de departamentos.
  - `GET /endpoints` → `[{ id, endpoint, criticidade, departamento_id, departamento_nome, tipo_id, tipo_nome, created_at }]`, ordenado por `endpoint`.
  - `POST /endpoints { endpoint, criticidade, departamento_id?, tipo_id? }` → 201. `PUT /endpoints/:id` (mesmo corpo) → 200 ou 404. `DELETE /endpoints/:id` → 204 ou 404.
  - Validação:
    - `nome` e `endpoint` com `trim()` e não vazios → senão 400 `{ error: '<campo> é obrigatório' }`;
    - `criticidade` inteiro 1..4 → senão 400 `{ error: 'criticidade deve ser 1 a 4' }`;
    - ids vazios ou `null` → `NULL`;
    - FK inexistente → 400 (via errorHandler `23503`).
  - Duplicado → 409, com mensagem `'Departamento já existe'`, `'Tipo já existe'` ou `'Endpoint já existe'`.
  - O `endpoint` é gravado com `trim()`. A caixa é preservada.

- [ ] **Step 1: Escrever os testes que falham** (`test/crud.test.js`)

```js
describe.each(['departamentos','tipos'])('%s', (rota) => {
  it('admin cria, edita, lista e remove', ...)
  it('nome vazio/espaços → 400', ...)
  it('duplicado → 409', ...)
  it('PUT/DELETE id inexistente → 404', ...)
})
it('POST /endpoints com tipo e departamento → GET traz tipo_nome e departamento_nome', ...)
it('criticidade 0, 5, "x" → 400', ...)
it('tipo_id inexistente → 400', ...)
it('endpoint duplicado → 409 "Endpoint já existe"', ...)
it('remover tipo em uso deixa endpoint com tipo_id null', ...)
it('GET /tipos traz total_endpoints', ...)
describe('permissões', () => {
  it('sem sessão → 401 em GET e POST', ...)
  it('pendente → 403 aguardando_liberacao em GET', ...)
  it('leitor: GET 200, POST/PUT/DELETE 403 sem_permissao', ...)
  it('admin sem X-Requested-With → 403 csrf', ...)
})
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npx vitest run test/crud.test.js` → FAIL

- [ ] **Step 3: Implementar os três routers e montar no `app.js`**

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npm test` → PASS

---

### Task 4: Acessos (gestão de usuários)

**Files:**
- Create: `backend/src/routes/usuarios.js`, `backend/test/usuarios.test.js`
- Modify: `backend/src/app.js`

**Interfaces:**
- Consumes: guards, helpers (Task 2)
- Produces (somente admin, inclusive o GET):
  - `GET /usuarios` → `[{ id, nome, email, papel, ultimo_login, created_at }]`, ordenado com `pendente` primeiro e depois por `nome`.
  - `PUT /usuarios/:id { papel }`:
    - `papel ∉ {pendente, leitor, admin}` → 400;
    - inexistente → 404;
    - mudança que deixaria 0 admins → 409 `{ error: 'ultimo_admin' }`. A checagem e o update rodam na mesma transação, com `SELECT ... FOR UPDATE` nos admins.

- [ ] **Step 1: Escrever os testes que falham**

```js
it('admin lista usuários, pendentes primeiro', ...)
it('admin promove pendente a leitor; o leitor passa a ter GET /endpoints 200 sem novo login', ...)
it('rebaixar o único admin → 409 ultimo_admin', ...)
it('com 2 admins, rebaixar um → 200', ...)
it('papel inválido → 400; id inexistente → 404', ...)
it('leitor em GET /usuarios → 403', ...)
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/usuarios.test.js` → FAIL
- [ ] **Step 3: Implementar `routes/usuarios.js`**
- [ ] **Step 4: Rodar e ver passar** — `npm test` → PASS

---

### Task 5: Seed do DefectDojo local e captura de fixtures

**Files:**
- Create: `lab/seed-defectdojo.mjs`, `backend/test/fixtures/dd/url-page1.json`, `url-page2.json`, `location_findings.json`, `location_products.json`, `products.json`

**Interfaces:**
- Produces:
  - Dados no DefectDojo local (`http://127.0.0.1:8081`) que as Tasks 6, 7 e 13 usam.
  - Fixtures JSON com o formato **real** das respostas, que a Task 6 usa nos testes.

Hosts a semear: `api.loja.lab`, `checkout.loja.lab`, `db01.infra.lab`, `db02.infra.lab`, `vpn.rede.lab`, `fw01.rede.lab`, `intranet.lab`, `grafana.infra.lab`. Pelo menos um host com 2 URLs (portas diferentes).

Produtos: `Loja`, `Infra`, `Rede` (product type `Lab`). Findings ativos por host, variando de 0 a ~20, e alguns `Mitigated`.

- [ ] **Step 1: Explorar o schema de criação**

Use `http://127.0.0.1:8081/api/v2/oa3/schema/?format=json` para confirmar os corpos de POST de:
- `product_types`, `products`, `engagements`, `tests` (e o `test_type` a usar);
- `findings`, `url`, `location_products`, `location_findings`.

Token: `POST /api/v2/api-token-auth/` com `DD_ADMIN_USER` / `DD_ADMIN_PASSWORD` lidos do ambiente. Não gravar a senha no script.

- [ ] **Step 2: Escrever `lab/seed-defectdojo.mjs`**

- Idempotente: busca por nome ou host antes de criar.
- Imprime um resumo: hosts, findings ativos por host, e a API key do admin para colar no `.env` como `DD_API_KEY`.

- [ ] **Step 3: Rodar duas vezes**

Run: `DD_ADMIN_USER=admin DD_ADMIN_PASSWORD=<senha> node lab/seed-defectdojo.mjs` (2x)
Expected: a segunda execução não cria nada novo; o resumo é idêntico.

- [ ] **Step 4: Capturar fixtures**

- Salvar as respostas reais de:
  - `GET /api/v2/url/?limit=5&offset=0` e `offset=5`, para ter 2 páginas com `next`;
  - `GET /api/v2/location_findings/?location_type_exact=url&status_equals=Active&limit=1000`;
  - `GET /api/v2/location_products/?location_type_exact=url&limit=1000`;
  - `GET /api/v2/products/?limit=1000`.
- Trocar `next` por URLs relativas ao `baseUrl` fake (`http://dd.test`).
- Anotar no topo do `client.js` (Task 6) o formato observado de `location_value` (ex.: `https://api.loja.lab/`).

---

### Task 6: Cliente DefectDojo

**Files:**
- Create: `backend/src/defectdojo/hosts.js`, `backend/src/defectdojo/client.js`, `backend/test/ddClient.test.js`

**Interfaces:**
- Consumes: fixtures (Task 5)
- Produces:
  - `normalizeHost(h: string) → string`, igual a `h.trim().toLowerCase()`.
  - `hostFromLocationValue(v: string) → string | null`. Usa `new URL(v).hostname`; se faltar o esquema, prefixa `http://`. Retorna `null` se o valor for inválido.
  - `createDefectDojoClient({ baseUrl, apiKey, fetchImpl = fetch, ttlMs = 60000, timeoutMs = 10000, now = Date.now }) → { listHosts({ force = false } = {}) → Promise<Array<{ host, produtos: string[], findingsAtivos: number }>>, ping() → Promise<void> }`.
  - `listHosts`:
    - pagina `/api/v2/url/`, `/api/v2/location_findings/?location_type_exact=url&status_equals=Active`, `/api/v2/location_products/?location_type_exact=url` e `/api/v2/products/`, seguindo `next` até `null`, com `limit=1000`;
    - agrupa por `normalizeHost`;
    - `findingsAtivos` é o número de ids de `finding` **distintos** entre as URLs do host;
    - `produtos` são os nomes únicos, em ordem alfabética.
  - Cache por `ttlMs`; `force` ignora o cache.
  - Erro de rede, timeout ou status ≠ 2xx → lança `DefectDojoError` (exportado) com `message` legível.
  - `ping()` faz `GET /api/v2/products/?limit=1`.

- [ ] **Step 1: Escrever os testes que falham**

```js
it('agrupa URLs do mesmo host e conta findings ativos distintos', async () => {
  const hosts = await client.listHosts()
  const api = hosts.find(h => h.host === 'api.loja.lab')
  expect(api.produtos).toEqual(['Loja'])
  expect(api.findingsAtivos).toBe(/* valor do resumo do seed */)
})
it('segue next por todas as páginas', ...)       // fetch fake conta chamadas por path
it('normaliza caixa/espaço do host', ...)
it('usa cache por 60s e refaz com force', ...)   // `now` controlado
it('timeout → DefectDojoError', ...)             // fetchImpl que nunca resolve, timeoutMs: 50
it('HTTP 401 → DefectDojoError', ...)
it('envia Authorization: Token <key>', ...)
it('hostFromLocationValue: "https://A.b:8443/x" → "a.b"; "a.b" → "a.b"; "::" → null', ...)
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/ddClient.test.js` → FAIL
- [ ] **Step 3: Implementar** `hosts.js` e `client.js`. Usar `AbortSignal.timeout(timeoutMs)` em cada fetch.
- [ ] **Step 4: Rodar e ver passar** — `npm test` → PASS

---

### Task 7: Não classificados, ignorados e números

**Files:**
- Create: `backend/src/routes/naoClassificados.js`, `backend/src/routes/stats.js`, `backend/test/naoClassificados.test.js`
- Modify: `backend/src/app.js`

**Interfaces:**
- Consumes:
  - `ddClient.listHosts({ force })` (Task 6). Nos testes, um fake `{ listHosts: async () => [...], ping: async () => {} }`.
  - `normalizeHost` (Task 6).
- Produces:
  - `GET /nao-classificados?ignorados=1&atualizar=1` → `{ itens: [{ host, produtos, findingsAtivos, ignorado: boolean }] }`:
    - lista os hosts do DD cujo `normalizeHost` não está em `lower(trim(departamento_endpoint.endpoint))`;
    - os ignorados são excluídos, exceto com `ignorados=1`, quando vêm marcados com `ignorado: true`;
    - ordena por `findingsAtivos` desc e depois por `host` asc;
    - `atualizar=1` repassa `force: true`.
  - `POST /nao-classificados/ignorados { host }` → 201. Grava `normalizeHost(host)` com `ignorado_por = req.user.id`. Já ignorado → 200 (idempotente).
  - `DELETE /nao-classificados/ignorados/:host` → 204.
  - `GET /stats` → `{ pendentes: number | null, classificados: number, criticos: number }`:
    - `pendentes` é a mesma conta da lista sem ignorados, ou `null` se o DD falhar ou não estiver configurado;
    - `classificados = count(departamento_endpoint)`;
    - `criticos = count(criticidade = 4)`.
  - Erros:
    - DD não configurado (`ddClient == null`) → 503 `{ error: 'defectdojo_nao_configurado' }`;
    - `DefectDojoError` → 502 `{ error: 'defectdojo_indisponivel', detalhe: err.message }`.
  - A classificação reaproveita `POST /endpoints` (Task 3). Ao criar um endpoint, o host sai de `endpoint_ignorado`, se estiver lá; ajuste em `routes/endpoints.js`.

- [ ] **Step 1: Escrever os testes que falham**

```js
it('lista só hosts do DD sem classificação, ordenados por findings desc', ...)
it('endpoint cadastrado "DB01.infra.lab " conta como classificado para "db01.infra.lab"', ...)  // Review Focus 1
it('ignorar remove da lista; ?ignorados=1 mostra com ignorado:true; DELETE desfaz', ...)
it('classificar via POST /endpoints remove da lista e limpa ignorado', ...)
it('POST /endpoints duas vezes para o mesmo host → segundo 409', ...)                          // Review Focus 4
it('DD lança DefectDojoError → 502 defectdojo_indisponivel; GET /endpoints segue 200', ...)    // Review Focus 2
it('sem ddClient → 503; /stats.pendentes = null', ...)
it('/stats conta classificados e criticos', ...)
it('leitor: GET 200, POST ignorados 403', ...)
```

- [ ] **Step 2: Rodar e ver falhar** — `npx vitest run test/naoClassificados.test.js` → FAIL
- [ ] **Step 3: Implementar os routers e o ajuste em `endpoints.js`**
- [ ] **Step 4: Rodar e ver passar** — `npm test` → PASS

---

### Task 8: OIDC real, entrypoint e stack do lab

**Files:**
- Create: `backend/src/auth/oidc.js`, `docker-compose.lab.yml`, `lab/keycloak/realm.json`, `backend/scripts/seed-lab.js`
- Modify (rewrite): `backend/server.js`, `backend/Dockerfile`, `docker-compose.yml`, `.env.example`, `frontend/nginx.conf`

**Interfaces:**
- Consumes: contrato do adaptador OIDC (Task 2), `createApp`, `waitForDb`, `migrate`, `createDefectDojoClient`
- Produces:
  - `createOidc(config) → Promise<adaptador>`, com openid-client v6:
    - `discovery(new URL(issuer), clientId, clientSecret, undefined, issuer.startsWith('http://') ? { execute: [allowInsecureRequests] } : undefined)`. Sem `allowInsecureRequests` o Keycloak do lab (http) é rejeitado;
    - PKCE: `randomPKCECodeVerifier`, `calculatePKCECodeChallenge`, `randomState`;
    - `scope: 'openid profile email'`, `redirect_uri = appBaseUrl + '/api/auth/callback'`;
    - `finishLogin` usa `authorizationCodeGrant(cfg, currentUrl, { pkceCodeVerifier, expectedState })`, depois `tokens.claims()`. O e-mail vem de `email ?? preferred_username`;
    - `logoutUrl` usa `buildEndSessionUrl(cfg, { id_token_hint, post_logout_redirect_uri: appBaseUrl + '/' })`.
  - Como o backend está atrás do nginx, o callback recebe `currentUrl = new URL(req.originalUrl, appBaseUrl + '/api')`. Garantir que o path final seja `/api/auth/callback?...`.
  - `server.js`: `loadConfig` → `createPool` → `waitForDb` → `migrate` → `createOidc` (com retry de 30 × 2 s, porque o Keycloak sobe devagar) → `createDefectDojoClient` (se `config.dd`) → `createApp` → `listen(3001)`.

**Arquivos de configuração (valores fixos):**
- `docker-compose.yml` (base, produção):
  - `backend` com `env_file: .env`, sem `ports`;
  - `frontend` com `ports: ["3000:80"]`, `depends_on: backend`;
  - nenhuma credencial.
- `docker-compose.lab.yml`:
  - `db`: `postgres:16-alpine`, volume `em_lab_pg`, `POSTGRES_USER/PASSWORD/DB` de `.env`, com healthcheck;
  - `keycloak`: `quay.io/keycloak/keycloak:26.0`, `command: start-dev --import-realm`, env `KC_BOOTSTRAP_ADMIN_USERNAME=admin`, `KC_BOOTSTRAP_ADMIN_PASSWORD=admin`, `KC_HOSTNAME=http://host.docker.internal:8082`, `KC_HTTP_PORT=8080`, `ports: ["8082:8080"]`, volume `./lab/keycloak:/opt/keycloak/data/import:ro`;
  - `backend` (override): `depends_on: [db, keycloak]`, `extra_hosts: ["host.docker.internal:host-gateway"]`.
- `.env.example`, com valores do lab e comentários do que muda em produção:
  - `PG_HOST=db`, `PG_PORT=5432`, `PG_USER=endpoint`, `PG_PASSWORD=endpoint`, `PG_DATABASE=endpoint`, mais `POSTGRES_*` espelhando esses;
  - `APP_BASE_URL=http://localhost:3000`, `SESSION_SECRET=` (instrução: `openssl rand -hex 32`), `BOOTSTRAP_ADMIN_EMAIL=admin@lab.local`;
  - `OIDC_ISSUER=http://host.docker.internal:8082/realms/endpoint-manager`, `OIDC_CLIENT_ID=endpoint-manager`, `OIDC_CLIENT_SECRET=lab-secret-troque-em-producao`;
  - `DD_URL=http://host.docker.internal:8081`, `DD_API_KEY=`.
- `lab/keycloak/realm.json`:
  - realm `endpoint-manager`;
  - client `endpoint-manager`: confidential, `secret` igual ao do `.env.example`, `standardFlowEnabled`, `redirectUris: ["http://localhost:3000/api/auth/callback"]`, `attributes."post.logout.redirect.uris": "http://localhost:3000/*"`, `webOrigins: ["http://localhost:3000"]`;
  - usuários `enabled`, `emailVerified`, com senha não temporária:
    - `admin@lab.local` / `Admin@123`, nome "Admin Lab";
    - `leitor@lab.local` / `Leitor@123`, nome "Leitor Lab";
    - `novo@lab.local` / `Novo@123`, nome "Novo Lab".
- `nginx.conf`:
  - manter `location /api/ { proxy_pass http://backend:3001/; }`;
  - adicionar `proxy_set_header X-Forwarded-Proto $scheme;` e `X-Forwarded-For`.
- `seed-lab.js`:
  - departamentos `TI_INFRA`, `FINANCEIRO`, `VAREJO`;
  - endpoints `db01.infra.lab` (crit 4, TI_INFRA, Banco de Dados) e `intranet.lab` (crit 2, TI_INFRA, Aplicação Web);
  - idempotente (`ON CONFLICT DO NOTHING`).

- [ ] **Step 1: Verificar a premissa de rede do issuer**

Run: `grep -i "host.docker.internal" /c/Windows/System32/drivers/etc/hosts` e `docker run --rm curlimages/curl -s -o /dev/null -w "%{http_code}" http://host.docker.internal:8081/api/v2/`

Expected:
- a linha existe no `hosts` do Windows;
- o curl responde `200`, `401` ou `403`, e não erro de conexão.

Se o DD não responder via `host.docker.internal`: ligar o backend também à rede externa `defectdojo_default` e usar `DD_URL=http://nginx:8080`.

Se `host.docker.internal` não estiver no `hosts` do Windows: parar e reportar. A alternativa de issuer precisa de decisão.

- [ ] **Step 2: Implementar** `oidc.js`, `server.js`, Dockerfile (`node:22-alpine`, `npm ci --omit=dev`), composes, `realm.json`, `.env.example`, `nginx.conf`, `seed-lab.js`

- [ ] **Step 3: Subir o lab**

Run:
```bash
cp .env.example .env   # preencher SESSION_SECRET e DD_API_KEY (impresso pela Task 5)
docker compose -f docker-compose.yml -f docker-compose.lab.yml up -d --build
docker compose -f docker-compose.yml -f docker-compose.lab.yml exec backend node scripts/seed-lab.js
```
Expected:
- os containers ficam `Up`;
- o log do backend mostra `Migrations applied.` e `API running on :3001`;
- `docker compose ... ps` não mostra a porta 3001 publicada.

- [ ] **Step 4: Verificar o fluxo de login por HTTP**

Run: `curl -s -i http://localhost:3000/api/auth/login | grep -i location`
Expected: `Location: http://host.docker.internal:8082/realms/endpoint-manager/protocol/openid-connect/auth?...code_challenge=...`

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/endpoints`
Expected: `401`

- [ ] **Step 5: Rodar a suíte inteira** — `cd backend && npm test` → PASS

---

### Task 9: Frontend — base, sessão e shell (direção C)

**Files:**
- Modify: `frontend/package.json`, `frontend/vite.config.js`, `frontend/index.html`, `frontend/src/main.jsx`, `frontend/src/App.jsx` (rewrite)
- Create: `frontend/src/index.css`, `frontend/src/api.js`, `frontend/src/components/Sidebar.jsx`, `StatCards.jsx`, `Toast.jsx`, `InlineSelect.jsx`, `EmptyState.jsx`, `PageHeader.jsx`, `frontend/src/pages/AguardandoLiberacao.jsx`

**Interfaces:**
- Consumes: `/auth/me`, `/auth/login`, `/auth/logout`, `/health`, `/stats` (Tasks 2, 7)
- Produces:
  - `api(path, { method = 'GET', body } = {}) → Promise<any>`:
    - prefixa `/api`, envia `credentials: 'same-origin'` e `X-Requested-With: XMLHttpRequest`, e serializa `body` em JSON;
    - 204 → `null`;
    - 401 → `window.location.href = '/api/auth/login'` (Review Focus 3);
    - outros erros → lança `ApiError { status, code: body.error, message }`. A mensagem é legível em pt-BR: mapear `aguardando_liberacao`, `sem_permissao`, `defectdojo_indisponivel`, `defectdojo_nao_configurado`, `ultimo_admin`, `csrf`.
  - `useToast() → { notify(msg, type = 'success' | 'error') }` via `ToastProvider`.
  - `<InlineSelect value onChange options={[{value,label}]} placeholder />`: select compacto estilizado, usado nas linhas.
  - `<StatCards stats />`: cards Pendentes (violeta), Classificados, Críticos (vermelho). `pendentes === null` → mostra "—" com tooltip "DefectDojo indisponível".
  - `<Sidebar aba onChange user health onLogout />`:
    - menu de ícones lucide: `Server` Endpoints, `Inbox` Não classificados (badge com o número de pendentes), `Building2` Departamentos, `Tags` Tipos, `ShieldCheck` Acessos (só admin);
    - tooltip com o nome de cada aba;
    - no rodapé: dois pontos de saúde (banco, DefectDojo), avatar com as iniciais e logout.
  - `App`:
    - chama `GET /auth/me` → `pendente` mostra `AguardandoLiberacao` (com botão sair); senão mostra o shell;
    - `?erro=login` na URL mostra um aviso "Falha no login" com o botão "Tentar novamente" (`/api/auth/login`);
    - aba ativa guardada em `location.hash` (`#endpoints`, `#nao-classificados`, ...), com default `#nao-classificados`.

Visual (direção C, aprovada pelo usuário):
- fundo `#0b0d12`, superfícies `#121620`, bordas `#1c2029`;
- acento violeta (`#7c3aed` / `#a78bfa`);
- texto `#e6e8ee`, secundário `#8a91a0`;
- fonte Inter para UI e JetBrains Mono para hosts;
- sidebar estreita (~56 px) só com ícones.

Tailwind v4: plugin `@tailwindcss/vite` e `@import "tailwindcss";` em `index.css`, com as cores acima em `@theme`.

- [ ] **Step 1: Instalar deps** — `cd frontend && npm install -D tailwindcss@^4 @tailwindcss/vite@^4 && npm install lucide-react` → sem erro
- [ ] **Step 2: Implementar** os arquivos acima. As páginas ainda são placeholders `<EmptyState>`.
- [ ] **Step 3: Build** — `npm run build` → `dist/` gerado, sem erros nem warnings de import
- [ ] **Step 4: Ver no lab**

Rebuild do frontend e login em `http://localhost:3000` com:
- `novo@lab.local` → tela "aguardando liberação";
- `admin@lab.local` → shell com a sidebar e os cards.

Screenshot ou descrição para o relatório da task.

---

### Task 10: Frontend — Não classificados e Endpoints

**Files:**
- Create: `frontend/src/pages/NaoClassificados.jsx`, `frontend/src/pages/Endpoints.jsx`
- Modify: `frontend/src/App.jsx` (montar as páginas)

**Interfaces:**
- Consumes:
  - `api` e componentes (Task 9);
  - `GET /nao-classificados`, `POST /nao-classificados/ignorados`, `DELETE /nao-classificados/ignorados/:host`, `POST|PUT|DELETE /endpoints`, `GET /departamentos`, `GET /tipos`, `GET /stats`.
- Produces: `onChanged()` repassado pelo App, que recarrega `/stats` (para o badge e os cards).

**Não classificados:**
- `PageHeader` "Não classificados", com o subtítulo "Hosts do DefectDojo ainda sem criticidade/departamento".
- Ações no topo: toggle "Mostrar ignorados" e botão "Atualizar", que usa `?atualizar=1`.
- `StatCards` no topo.
- Cada linha mostra:
  - o host em mono;
  - os produtos como chips;
  - os findings ativos em pill, colorida por faixa: 0 cinza, 1–4 verde, 5–14 âmbar, ≥15 vermelho;
  - `InlineSelect` de criticidade (1 Baixa, 2 Média, 3 Alta, 4 Crítica), departamento (inclui "Sem departamento") e tipo (inclui "Sem tipo");
  - botão ✓ (habilitado só com a criticidade escolhida);
  - botão "Ignorar" (ou "Restaurar", se ignorado).
- ✓ chama `POST /endpoints { endpoint: host, criticidade, departamento_id, tipo_id }`. No sucesso, a linha sai com uma animação curta e aparece o toast "host classificado". Em 409, toast de erro e a lista recarrega (Review Focus 4). O botão fica desabilitado durante a requisição (contra duplo clique).
- Leitor: os selects e botões não aparecem, só a lista.
- Estados:
  - loading: skeleton;
  - vazio: "Tudo classificado 🎉";
  - erro 502/503: card de erro com a mensagem e o botão "Tentar de novo".

**Endpoints:**
- `PageHeader` e `StatCards`.
- Busca por host ou departamento, e filtros (criticidade, departamento, tipo) como `InlineSelect`.
- Tabela: host (mono), criticidade (badge colorida, mesma paleta do v1), departamento, tipo e ações.
- O admin edita na linha: clicar em "editar" troca as células por `InlineSelect` e um input, com ✓ salvar e ✕ cancelar. Remover pede confirmação inline ("Remover? Sim / Não"), sem `window.confirm`.
- Botão "+ Novo endpoint" abre uma linha nova no topo da tabela, em modo edição.

- [ ] **Step 1: Implementar as duas páginas**
- [ ] **Step 2: Build** — `cd frontend && npm run build` → sem erros
- [ ] **Step 3: Verificar no lab**

Rebuild do frontend; logar como admin.
- Classificar `api.loja.lab` (crit 4, VAREJO, Aplicação Web): ele sai da lista, aparece em Endpoints, e Críticos sobe +1.
- Ignorar `grafana.infra.lab`: some; com "Mostrar ignorados" aparece; Restaurar volta.
- Parar o DefectDojo não faz parte do teste, porque é container existente. Para a mensagem de erro, use um `DD_API_KEY` inválido num rebuild temporário do backend: a aba deve mostrar o card de erro, e Endpoints deve funcionar normalmente.

---

### Task 11: Frontend — Departamentos, Tipos e Acessos

**Files:**
- Create: `frontend/src/pages/Departamentos.jsx`, `frontend/src/pages/Tipos.jsx`, `frontend/src/pages/Acessos.jsx`
- Modify: `frontend/src/App.jsx`

**Interfaces:**
- Consumes: `api`, componentes (Task 9), `/departamentos`, `/tipos`, `/usuarios`

**Departamentos e Tipos:** compartilham um componente `CadastroSimples({ titulo, rota, icone })` (criar em `components/`):
- busca;
- lista em cards compactos com nome, `#id` e "N endpoints";
- criar com um input inline no topo + ✓;
- editar inline;
- remover com confirmação inline. Se `total_endpoints > 0`, avisa "N endpoints ficarão sem <departamento|tipo>".

**Acessos** (só admin; a aba nem aparece para leitor):
- Tabela: avatar com iniciais, nome, e-mail, último login (formato relativo pt-BR: "há 2 h") e `InlineSelect` de papel (Pendente, Leitor, Admin). Pendentes aparecem no topo com um destaque violeta.
- Trocar o papel salva na hora. 409 `ultimo_admin` → toast "Precisa existir pelo menos um admin" e o select volta ao valor anterior.

- [ ] **Step 1: Implementar**
- [ ] **Step 2: Build** — `npm run build` → sem erros
- [ ] **Step 3: Verificar no lab**
  - Admin promove `novo@lab.local` (depois que ele logou uma vez) a Leitor.
  - Em outra janela anônima, `novo@lab.local` vê tudo sem botões de edição e sem a aba Acessos.
  - Tentar rebaixar o único admin mostra o toast de erro.

---

### Task 12: Documentação (README e PRODUCAO.md)

**Files:**
- Modify: `README.md` (rewrite)
- Create: `docs/PRODUCAO.md`

**README.md:**
- o que o app faz;
- arquitetura em 5 linhas;
- como subir o lab, com os comandos exatos da Task 8: seed do DefectDojo e seed do app;
- usuários de teste e senhas;
- portas: 3000 app, 8082 Keycloak e admin `admin/admin`, 8081 DefectDojo;
- schema completo: tabelas v1 + novas, com o aviso do Grafana;
- como rodar os testes (`npm run test:db:up && npm test`);
- papéis e permissões.

Corrigir os nomes de tabela errados do README antigo (`departamentos`/`endpoints` → `departamento`/`departamento_endpoint`).

**docs/PRODUCAO.md:** cobrir **todos** os itens de G7 do spec, como passos numerados executáveis. Placeholders em `<MAIÚSCULAS>`: `<IP_APP>`, `<IP_BANCO>`, `<PG_USER_DONO>`, `<URL_APP>`, `<URL_DEFECTDOJO>`, `<TENANT_ID>`.
1. **Pré-requisitos:** host com Docker e um nome DNS com HTTPS.
2. **Postgres:**
   - linha pronta para o `pg_hba.conf`: `host  <PG_DATABASE>  <PG_USER_DONO>  <IP_APP>/32  scram-sha-256`;
   - checar `listen_addresses` em `postgresql.conf`;
   - aplicar com `SELECT pg_reload_conf();`. Se `listen_addresses` mudou, é preciso restart; avisar;
   - se o Postgres do DefectDojo roda em Docker, explicar onde ficam esses arquivos (volume `PGDATA`) e que a porta 5432 precisa estar publicada;
   - testar com `docker run --rm postgres:16-alpine psql "postgresql://<PG_USER_DONO>@<IP_BANCO>:5432/<PG_DATABASE>" -c "select 1"`;
   - checar o dono com `SELECT tableowner FROM pg_tables WHERE tablename='departamento_endpoint';`.
3. **Firewall:** `<IP_APP>` → `<IP_BANCO>:5432`; saída 443 para `<URL_DEFECTDOJO>` e `login.microsoftonline.com`.
4. **Entra ID**, passo a passo no portal:
   - App registrations → New, com Redirect URI (Web) `<URL_APP>/api/auth/callback`;
   - Certificates & secrets → New client secret (anotar a validade);
   - Token configuration → optional claim `email`;
   - API permissions: `openid`, `profile`, `email`;
   - mapear para `.env`: `OIDC_ISSUER=https://login.microsoftonline.com/<TENANT_ID>/v2.0`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`;
   - front-channel logout URL opcional.
5. **DefectDojo:** criar um usuário com papel global Reader, gerar a API key em "API v2 Key" e preencher `DD_URL` e `DD_API_KEY`.
6. **`.env` de produção** completo e comentado, com `BOOTSTRAP_ADMIN_EMAIL=<seu e-mail do Entra>`.
7. **TLS:** o app precisa ser servido em `https://`. Opções: proxy reverso existente apontando para `:3000`, ou certificado no nginx do frontend (snippet).
8. **Subir:** `docker compose up -d --build` (só o compose base, **sem** o lab). Validar com `docker compose logs backend` (`Migrations applied.`).
9. **Primeiro acesso:** logar com o e-mail do bootstrap e dar papel aos outros na aba Acessos.
10. **Grafana:** SQL de checagem de que `departamento_endpoint` mantém as colunas antigas. Opcional: como usar `tipo` nos painéis (`LEFT JOIN tipo t ON t.id = e.tipo_id`).
11. **Backup e rollback:** `pg_dump` antes; a migração é só aditiva, então dá para voltar para a imagem v1 sem perder dados.
12. **Troubleshooting:**
    - `AADSTS50011`: redirect URI errada;
    - issuer mismatch;
    - e-mail vazio (`preferred_username`);
    - `ECONNREFUSED` no banco (`pg_hba`/firewall);
    - 502 na aba Não classificados (`DD_URL`/`DD_API_KEY`).

- [ ] **Step 1: Escrever README.md**
- [ ] **Step 2: Escrever docs/PRODUCAO.md**
- [ ] **Step 3: Conferir**

Cada item de G7 do spec aparece no `PRODUCAO.md`. Cada comando do README roda como está no lab (refazer: `down -v`, `up`, seeds, testes).

---

### Task 13: Verificação final ponta a ponta e revisão visual do usuário

**Files:** nenhum novo. Só correções que surgirem.

- [ ] **Step 1: Schema legado intacto**

Run: `docker compose -f docker-compose.yml -f docker-compose.lab.yml exec db psql -U endpoint -d endpoint -c "\d departamento_endpoint"`
Expected: colunas `id, endpoint, criticidade, departamento_id, created_at` com os tipos do v1, mais `tipo_id`.

- [ ] **Step 2: Checklist "Pronto quando" do spec** (itens 1–5 e 7), executado e anotado com evidência:
  1. Login do admin ponta a ponta.
  2. Fluxo do `novo@lab.local`: pendente → leitor, e 403 na escrita. Testar com `curl` usando o cookie dele num POST com `X-Requested-With`.
  3. Classificar remove da lista e grava o `tipo_id`.
  4. Schema (Step 1).
  5. `cd backend && npm test` → PASS.
  7. `PRODUCAO.md` completo.
- [ ] **Step 3: Revisão visual com o usuário**

Deixar o lab no ar e entregar ao usuário:
- URL `http://localhost:3000`;
- os 3 usuários de teste;
- um roteiro curto do que olhar.

Não declarar pronto antes do OK dele (item 6 do spec). Ajustes visuais pedidos voltam como pequenas iterações na Task 10/11.
