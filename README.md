# Endpoint Manager v2

Interface web para classificar os endpoints (hosts) da empresa por criticidade, departamento e tipo. Os dados ficam no PostgreSQL que o Grafana também lê. O app mostra ainda quais hosts o DefectDojo conhece e que ninguém classificou.

## O que o app faz

- **Endpoints**: cadastro, edição e remoção de hosts, com criticidade (1 a 4), departamento e tipo. Busca e filtros.
- **Não classificados**: hosts que o DefectDojo conhece (via API, só leitura) e que não estão em `departamento_endpoint`. Ordenados por findings ativos. Dá para classificar na linha, ignorar ou atualizar a lista.
- **Departamentos** e **Tipos**: CRUD simples.
- **Acessos**: quem já logou e qual papel tem. Só admin vê essa aba.
- Login por OIDC (Entra ID em produção, Keycloak no lab) e, ao lado dele, login local com e-mail e senha (veja "Login local").

## Arquitetura

1. `frontend/`: React 18 + Vite + Tailwind, servido pelo nginx na porta 3000. O nginx faz proxy de `/api/` para o backend.
2. `backend/`: Node + Express. Sessão em cookie, guardada no Postgres. Tokens OIDC e `DD_API_KEY` nunca vão para o navegador.
3. PostgreSQL: tabelas do app no schema `public`. No lab é um container próprio. Em produção é o banco que o Grafana lê.
4. OIDC: Entra ID em produção, Keycloak no lab.
5. DefectDojo: lido por `GET /api/v2/...`, só leitura (precisa da versão 3.0 ou superior, com Locations).

Só o frontend publica porta. O backend (3001) fica na rede interna do Docker.

## Subir o lab

Pré-requisitos: Docker Desktop e Node 20 ou superior (para o seed do DefectDojo).

**1. Hosts file (Windows, uma vez).** O navegador precisa resolver o issuer do Keycloak. Garanta esta linha em `C:\Windows\System32\drivers\etc\hosts` (edite como administrador). O Docker Desktop costuma criá-la sozinho (Settings, General, "Add the *.docker.internal names to the host's /etc/hosts file"):

```
127.0.0.1 host.docker.internal
```

**2. `.env`:**

```bash
cp .env.example .env
```

Edite o `.env`: preencha `SESSION_SECRET` (por exemplo `openssl rand -hex 32`). Os demais valores do `.env.example` já são os do lab.

**3. Subir app, Postgres do app e Keycloak:**

```bash
docker compose -f docker-compose.yml -f docker-compose.lab.yml up -d --build
```

**4. Seed do DefectDojo local** (opcional; precisa do DefectDojo em http://127.0.0.1:8081). Idempotente. Ao final imprime `DD_API_KEY=...`: copie esse valor para o `.env` e recrie o backend:

```bash
DD_ADMIN_USER=admin DD_ADMIN_PASSWORD='<SENHA_ADMIN_DO_DEFECTDOJO_LOCAL>' node lab/seed-defectdojo.mjs
docker compose -f docker-compose.yml -f docker-compose.lab.yml up -d backend
```

**5. Seed do app** (departamentos, tipos e dois endpoints de exemplo; idempotente):

```bash
docker compose -f docker-compose.yml -f docker-compose.lab.yml exec backend node scripts/seed-lab.js
```

Abra http://localhost:3000.

### Usuários de teste

| E-mail | Senha | Papel inicial |
|---|---|---|
| `admin@lab.local` | `Admin@123` | admin (por `BOOTSTRAP_ADMIN_EMAIL`) |
| `leitor@lab.local` | `Leitor@123` | pendente |
| `novo@lab.local` | `Novo@123` | pendente |

Usuário novo entra como `pendente` e vê "aguardando liberação" até um admin dar papel na aba Acessos. O `leitor@lab.local` só vira leitor depois de ser promovido.

### Portas

| Serviço | Porta | Observação |
|---|---|---|
| App (frontend) | 3000 | http://localhost:3000 |
| Keycloak | 8082 | http://host.docker.internal:8082, console `admin` / `admin` |
| DefectDojo local | 8081 | http://127.0.0.1:8081 (stack separada, não faz parte deste compose) |
| API | 3001 | só rede interna, não publicada |

## Variáveis de ambiente

Toda a configuração vem do `.env` (modelo em `.env.example`). O backend não sobe sem: `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD`, `PG_DATABASE`, `SESSION_SECRET`, `APP_BASE_URL`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`. A mensagem de erro lista as que faltam. `BOOTSTRAP_ADMIN_EMAIL`, `DD_URL` e `DD_API_KEY` são opcionais (sem `DD_*` o app sobe sem a aba de não classificados).

Se `APP_BASE_URL` começa com `https://`, o backend liga o cookie `Secure`. O `trust proxy` do Express fica sempre ligado, e `TRUST_PROXY` (inteiro, padrão `1`) diz quantos proxies existem à frente do backend. O backend nunca deve ser exposto direto: só pelo nginx do frontend.

`LOGIN_LOCAL` (`ligado`, o padrão, ou `desligado`) liga ou desliga o login local.

## Login local

Além do SSO, o app aceita login com e-mail e senha próprios (`LOGIN_LOCAL=ligado`, o padrão).

- Só o admin cria usuários locais: aba **Acessos**, botão **+ Novo usuário local**. O app gera uma senha temporária de 16 caracteres e a mostra uma única vez. No primeiro login a pessoa é obrigada a trocar a senha (mínimo de 12 caracteres). **Redefinir senha** gera outra temporária e também zera o bloqueio.
- Senhas guardadas com hash argon2id, nunca em texto.
- 5 senhas erradas bloqueiam a conta por 15 minutos; há também um limite de 20 tentativas por 15 minutos por IP (resposta 429). A resposta de falha é sempre a mesma (401 `credenciais_invalidas`).
- Trocar ou redefinir a senha não derruba sessões abertas (valem até 8 horas). Para encerrar todas: `DELETE FROM em_sessao` no banco, ou trocar o `SESSION_SECRET`.
- Com `LOGIN_LOCAL=desligado`, `/auth/local/*` responde 404 e o formulário some.
- Limitação: se alguém tem conta local e entra pela Microsoft com o mesmo e-mail, nasce uma conta SSO separada. O `BOOTSTRAP_ADMIN_EMAIL` só vale para contas SSO.

### Admin de emergência

Para quando ninguém consegue entrar. Cria (ou redefine a senha de) um admin local e imprime a senha temporária:

```bash
docker compose exec backend node scripts/criar-admin-local.js <EMAIL> "<NOME>"
```

Recusa e-mails de usuários SSO. Ignora `LOGIN_LOCAL=desligado`: com o login local desligado, o admin criado não consegue entrar.

## Schema

A migração roda no startup, é aditiva e idempotente (`IF NOT EXISTS`). Nunca altera colunas existentes.

Tabelas da v1 (o Grafana lê estas):

```sql
CREATE TABLE departamento (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE departamento_endpoint (
  id SERIAL PRIMARY KEY,
  endpoint VARCHAR(255) NOT NULL UNIQUE,
  criticidade INTEGER NOT NULL CHECK (criticidade BETWEEN 1 AND 4),
  departamento_id INTEGER REFERENCES departamento(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

Novas na v2:

```sql
CREATE TABLE tipo (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);
-- coluna nova, nullable:
ALTER TABLE departamento_endpoint
  ADD COLUMN IF NOT EXISTS tipo_id INTEGER REFERENCES tipo(id) ON DELETE SET NULL;

CREATE TABLE usuario (
  id SERIAL PRIMARY KEY,
  sub VARCHAR UNIQUE NOT NULL,
  email VARCHAR,
  nome VARCHAR,
  papel VARCHAR NOT NULL DEFAULT 'pendente' CHECK (papel IN ('pendente','leitor','admin')),
  ultimo_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE endpoint_ignorado (
  id SERIAL PRIMARY KEY,
  host VARCHAR(255) UNIQUE NOT NULL,
  ignorado_por INTEGER REFERENCES usuario(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

Mais a tabela de sessão `em_sessao` (`connect-pg-simple`). Se `tipo` estiver vazia, a migração insere `Servidor`, `Aplicação Web` e `Banco de Dados`.

> **Aviso (Grafana):** `departamento` e `departamento_endpoint` mantêm todas as colunas e tipos antigos. Só foi adicionada a coluna nullable `tipo_id`. Nunca renomeie nem remova colunas dessas tabelas: os dashboards dependem delas. O usuário `PG_USER` precisa ser dono de `departamento_endpoint` (a migração faz `ALTER TABLE`).

### Criticidade

| Nível | Label |
|---|---|
| 1 | Baixa |
| 2 | Média |
| 3 | Alta |
| 4 | Crítica |

## Papéis e permissões

| Papel | Pode |
|---|---|
| `pendente` | Só logar. Vê "aguardando liberação". Toda rota de dados devolve 403. |
| `leitor` | Ler tudo (Endpoints, Não classificados, Departamentos, Tipos). Não edita. Não vê Acessos. |
| `admin` | Tudo do leitor, mais criar, editar e remover, classificar e ignorar hosts, e trocar papéis na aba Acessos. |

Regras da API: sem sessão devolve 401. GET exige `leitor` ou `admin`. POST, PUT e DELETE exigem `admin` e o header `X-Requested-With: XMLHttpRequest`. O sistema impede rebaixar o último admin. `BOOTSTRAP_ADMIN_EMAIL` só concede o primeiro admin: quem loga com esse e-mail vira admin apenas enquanto não existe nenhum admin no banco (rebaixar essa conta depois vale de verdade). Recomenda-se remover a variável do `.env` após o primeiro acesso. O e-mail vem do claim `email`, ou de `preferred_username` quando `email` não existe. E-mail com `email_verified: false` é descartado.

## Testes

Backend (Vitest + Supertest, Postgres real em container na porta 55432):

```bash
cd backend
npm run test:db:up   # sobe o container em-test-pg
npm test
npm run test:db:down # quando terminar
```

O frontend não tem testes automatizados.

## Produção

Veja [docs/PRODUCAO.md](docs/PRODUCAO.md) e, para trocar a v1 pela v2 passo a passo (para quem não é da área técnica), [docs/MIGRACAO-PRODUCAO.md](docs/MIGRACAO-PRODUCAO.md). Produção usa **só** `docker-compose.yml`, nunca o arquivo do lab.
