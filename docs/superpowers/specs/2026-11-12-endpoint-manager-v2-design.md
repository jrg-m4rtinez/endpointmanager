# Endpoint Manager v2 — Design

Data: 2026-11-12
Status: aprovado pelo usuário em 2026-11-12

## 1. Intenção e porquê

O Endpoint Manager mantém duas tabelas Postgres, `departamento` e `departamento_endpoint`, que o **Grafana lê para gerar relatórios de vulnerabilidade**. Cada host recebe criticidade (1–4) e departamento.

Hoje a classificação é 100% manual. O usuário **não fica sabendo** quando surge um host novo no DefectDojo, então hosts com vulnerabilidade ficam fora dos relatórios até alguém lembrar de cadastrar. A API também está aberta: sem login, com `cors()` liberado e a porta 3001 exposta.

A v2 resolve isso:
1. Mostra automaticamente os hosts do DefectDojo que ainda não foram classificados e permite classificá-los rápido.
2. Acrescenta o **tipo** do endpoint (Servidor, Aplicação Web, Banco...).
3. Exige login SSO, com controle de acesso por papel gerenciado no próprio app.
4. Moderniza a UI.

Tudo é desenvolvido e testado num **lab local** em Docker. A produção (outra rede, Entra ID real, DefectDojo real) recebe o mesmo código trocando só o `.env`.

## 2. Objetivos

- **G1 — Tipos:** CRUD de tipos pela UI. Cada endpoint tem um tipo opcional.
- **G2 — Não classificados:** nova aba que lista os hosts presentes no DefectDojo (modelo Locations/URL) que não existem em `departamento_endpoint`, classificáveis na própria linha.
- **G3 — SSO:** login via OIDC. No lab o provedor é um Keycloak local. Na produção é o Entra ID. A troca é só de configuração.
- **G4 — Acessos:** aba onde o admin vê os usuários que já logaram e define o papel de cada um.
- **G5 — UI nova:** direção visual "C" escolhida pelo usuário (seção 6).
- **G6 — Lab completo:** um único `docker compose up` sobe tudo e se conecta ao DefectDojo local que já roda na máquina.
- **G7 — Roteiro de produção:** documento `docs/PRODUCAO.md`, passo a passo exato, para o usuário executar sozinho na rede dele. O usuário pediu "exatamente o que eu tenho que fazer". Cobre:
  - Postgres: o banco do DefectDojo só aceita conexão do IP do próprio DefectDojo. Liberar o IP do host do app em `pg_hba.conf` (linha pronta para colar) e em `listen_addresses`, e aplicar com reload. Teste de conexão com `psql`. Criar ou usar um usuário dono de `departamento_endpoint`.
  - Firewall: porta 5432 do host do app para o banco; saída HTTPS para o DefectDojo e para `login.microsoftonline.com`.
  - Entra ID: registrar o app (redirect URI, client secret, permissões `openid profile email`) e mapear os campos para o `.env`.
  - DefectDojo: criar um usuário só leitura e gerar a API key.
  - `.env` de produção completo, com comentários.
  - TLS: requisito e opções.
  - Subida, teste de login, primeiro admin via `BOOTSTRAP_ADMIN_EMAIL`.
  - Checagem de que o Grafana continua lendo as tabelas.
  - Rollback: a migração é só aditiva, então dá para voltar à imagem antiga sem perder dados.

  Os passos que dependem do ambiente dele (IP, hostname, nome do usuário Postgres) vêm como placeholders claros.
- **Clientes da API:** só a UI chama a API. O usuário não citou nenhum script ou integração, então fechar a 3001 e exigir login em tudo é seguro.

## 3. Não objetivos

- Não escrever nada no DefectDojo. O acesso é só leitura.
- Não criar nem alterar dashboards do Grafana, e não subir Grafana no lab.
- Não manter login local por senha no app.
- Não fazer sincronização periódica ou em background. A lista é calculada na hora em que a aba abre.
- Não suportar o modelo legado de Endpoints do DefectDojo (`/api/v2/endpoints/`). Só Locations/URL (DefectDojo ≥ 3.0).

## 4. Antiobjetivos (falha mesmo se "funcionar")

- **Quebrar o Grafana.** Proibido renomear ou remover tabelas e colunas existentes (`departamento.*`, `departamento_endpoint.*`) e mudar o tipo delas. Só mudanças aditivas: tabelas novas e colunas novas *nullable*.
- Qualquer rota de escrita acessível sem sessão de admin.
- Tokens OIDC ou a API key do DefectDojo chegarem ao navegador.
- Mexer nos containers que já existem na máquina, como `secops-keycloak-1` e as stacks `defectdojo-*`, além de ler a API do DefectDojo e semear dados de teste nele.

## 5. Restrições e contexto

- **Stack atual, mantida:** backend Node 20 + Express 4 + `pg` (`backend/server.js`). Frontend React 18 + Vite, servido por nginx (`frontend/`). O nginx faz proxy de `/api/` para `backend:3001`.
- **Tabelas existentes** (criadas por `migrate()` em `server.js`):
  - `departamento(id, nome UNIQUE, created_at)`
  - `departamento_endpoint(id, endpoint UNIQUE, criticidade 1..4, departamento_id FK SET NULL, created_at)`
- **DefectDojo local:** 3.5.0, rodando via Docker na stack `defectdojo` (containers `defectdojo-*`). O nginx está em `http://127.0.0.1:8081`, com usuário `admin` (senha redefinida nesta sessão). Locations está ativo.
- **Schema DefectDojo confirmado (3.5.0):**
  - `dojo_url(id, protocol, user_info, host, port, path, query, fragment, host_validation_failure, identity_hash, location_id)`
  - `dojo_location(id, created, updated, location_type, location_value)`
  - `dojo_locationproductreference(location_id, product_id, status, ...)`
  - `dojo_locationfindingreference(location_id, finding_id, test_id, status, ...)`
- **API DefectDojo** (docs): `GET /api/v2/urls/` lista URLs. Os filtros são os campos estruturados (incluindo `host`) e o produto. `GET /api/v2/location/?location_type=url` também existe. Autenticação: `Authorization: Token <key>`.
- **Match** entre DefectDojo e o app: `dojo_url.host` == `departamento_endpoint.endpoint`, comparação exata. O usuário confirmou que cadastra o host puro, igual ao do DefectDojo. Vários URLs com o mesmo host (portas e paths diferentes) contam como **um** host.
- **Ambiente:** Windows 11 + Docker Desktop. O DefectDojo local é alcançável dos containers do lab via `host.docker.internal:8081`.

## 6. Decisões do usuário (como ele decidiu)

1. **Tipos** são cadastráveis pela UI, como departamentos. Exemplos: Servidor, Aplicação Web, Banco.
2. **Match por host igual** ao do DefectDojo.
3. **Fonte:** DefectDojo novo, com Locations.
4. **Lab local.** SSO simulado com **Keycloak** local. Entra ID só na produção.
5. **Acessos gerenciados no app**, numa aba própria. Os papéis não vêm de grupos do Entra.
6. **Direção visual C:**
   - Tema escuro e menu lateral estreito só com ícones: Endpoints, Não classificados, Departamentos, Tipos, Acessos. Usuário e logout embaixo.
   - Cards de números no topo: **Pendentes** (não classificados), **Classificados**, **Críticos** (criticidade 4).
   - Na aba Não classificados, cada linha tem o host, três selects (criticidade, departamento, tipo) e um botão ✓ que confirma. Sem modal.
   - Ao confirmar, o host vira registro em `departamento_endpoint` e sai da lista.
7. **Validação final visual:** antes de declarar pronto, o lab sobe e o usuário confere a UI no navegador.

## 7. Decisões minhas (o usuário pode vetar)

- **D1 — Papéis:** `admin` faz tudo, inclusive a aba Acessos. `leitor` vê tudo e não edita nada. Um usuário que loga pela primeira vez entra como `pendente`: vê só uma tela "aguardando liberação" e a API recusa tudo com 403.
- **D2 — Primeiro admin:** variável `BOOTSTRAP_ADMIN_EMAIL`. No login, se o e-mail bater, o usuário vira `admin` automaticamente. Sem isso, ninguém conseguiria dar o primeiro acesso.
- **D3 — Admin não se rebaixa:** o backend recusa uma mudança de papel que deixaria o sistema com zero admins.
- **D4 — Fluxo OIDC no backend (BFF):**
  - O backend faz Authorization Code + PKCE com `openid-client`.
  - Guarda a sessão em cookie `httpOnly`, `SameSite=Lax`, com as sessões persistidas no Postgres (`connect-pg-simple`).
  - O frontend nunca vê tokens. Rotas: `/api/auth/login`, `/api/auth/callback`, `/api/auth/logout`, `/api/auth/me`.
  - Configuração por `.env`: `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `APP_BASE_URL`, `SESSION_SECRET`.
  - Identidade do usuário: claim `sub` (chave), mais `email` e `name`. Para o Entra, documentar no README que o `email` pode vir vazio e que o fallback é `preferred_username`.
- **D5 — Proteção de escrita:** todas as rotas exigem sessão. GET exige `leitor` ou `admin`. POST, PUT e DELETE exigem `admin`. Requisições mutáveis exigem um header `X-Requested-With`, como defesa extra contra CSRF além do `SameSite`. O `cors()` aberto sai, porque frontend e API ficam na mesma origem via nginx.
- **D6 — Portas:** só o frontend (nginx) é exposto, em `3000`. O backend deixa de publicar a `3001`.
- **D7 — Leitura do DefectDojo pela API**, não pelo banco. Motivo: a API é documentada e estável, e as tabelas internas não. O backend pagina `GET /api/v2/urls/` (com `limit` alto e seguindo `next`), deduplica por host e, para cada host, junta:
  - os nomes dos produtos;
  - a contagem de findings **ativos**. Se a API não expuser essa contagem de forma barata, ela é opcional; ver Q para o builder.

  Configuração: `DD_URL`, `DD_API_KEY`. Cache em memória de 60 s, com um botão "Atualizar" que força a busca.
- **D8 — Lista ordenada** por findings ativos, decrescente. Mostra produto e número de findings em cada linha.
- **D9 — Ignorar:**
  - Botão "Ignorar" por linha. O host vai para a tabela `endpoint_ignorado` e some da lista.
  - Um filtro "mostrar ignorados" permite desfazer.
  - Ignorados não contam em Pendentes.
  - O usuário não respondeu sobre isso; é decisão minha.
- **D10 — Schema aditivo** (migração idempotente no startup, `IF NOT EXISTS`):
  - `tipo(id SERIAL PK, nome VARCHAR(255) NOT NULL UNIQUE, created_at TIMESTAMP DEFAULT NOW())`
  - `ALTER TABLE departamento_endpoint ADD COLUMN IF NOT EXISTS tipo_id INTEGER REFERENCES tipo(id) ON DELETE SET NULL`
  - `usuario(id SERIAL PK, sub VARCHAR UNIQUE NOT NULL, email VARCHAR, nome VARCHAR, papel VARCHAR NOT NULL DEFAULT 'pendente' CHECK (papel IN ('pendente','leitor','admin')), ultimo_login TIMESTAMP, created_at TIMESTAMP DEFAULT NOW())`
  - `endpoint_ignorado(id SERIAL PK, host VARCHAR(255) UNIQUE NOT NULL, ignorado_por INTEGER REFERENCES usuario(id), created_at TIMESTAMP DEFAULT NOW())`
  - Tabela de sessão do `connect-pg-simple`.
  - Seed inicial de tipos (`Servidor`, `Aplicação Web`, `Banco de Dados`), só se a tabela estiver vazia.
  - O startup espera o banco com retry, em vez de falhar silenciosamente como hoje.
- **D11 — Postgres próprio no lab:** a compose do app sobe `postgres:16-alpine` para as tabelas do app. Na produção, `PG_*` aponta para o banco que o Grafana lê. Remover do `docker-compose.yml` as credenciais hardcoded (`10.10.10.118`, `defectdojo/defectdojo`). Tudo passa a vir de `.env`.
- **D11b — Lab separado da produção:**
  - Keycloak, Postgres do lab e seed do DefectDojo ficam num arquivo `docker-compose.lab.yml`, usado só com `docker compose -f docker-compose.yml -f docker-compose.lab.yml up`.
  - O `docker-compose.yml` base (app) nunca sobe usuários de teste.
  - O `.env` é a única coisa que muda entre ambientes. O arquivo de compose usado também muda, e isso é documentado.
- **D11c — Produção atrás de HTTPS:**
  - O Entra só aceita redirect `https` (exceto `localhost`).
  - O backend usa `trust proxy` e cookie `Secure` quando `APP_BASE_URL` começa com `https://`.
  - O README de produção registra que o app precisa estar atrás de TLS: um proxy existente ou um certificado no nginx. Configurar TLS em si fica fora do escopo.
- **D11d — Tabelas no banco de produção:** continuam no schema `public` do banco que o Grafana lê, igual hoje, porque os dashboards dependem disso. O README avisa:
  - a migração faz `ALTER TABLE departamento_endpoint`, então o usuário `PG_USER` precisa ser dono da tabela;
  - as tabelas novas (`tipo`, `usuario`, `endpoint_ignorado`, sessão) passam a fazer parte desse banco e dos backups dele.
- **D12 — Keycloak no lab:**
  - Imagem `quay.io/keycloak/keycloak` em modo `start-dev`, numa porta livre (sugestão `8082`).
  - Realm `endpoint-manager` importado de um JSON versionado no repo (`lab/keycloak/realm.json`). O realm já traz o client `endpoint-manager` (confidential, redirect `http://localhost:3000/api/auth/callback`) e três usuários de teste: `admin@lab.local`, `leitor@lab.local` e `novo@lab.local`, com senhas documentadas no README do lab.
  - `BOOTSTRAP_ADMIN_EMAIL=admin@lab.local`.
  - Atenção ao issuer: navegador e backend precisam enxergar o **mesmo** `OIDC_ISSUER`. `localhost` dentro do container do backend não é o host, então um issuer `http://localhost:8082` não resolve lá. Sugestão: usar `http://host.docker.internal:8082` como `KC_HOSTNAME`/issuer, porque o Docker Desktop no Windows registra esse nome também no `hosts` da máquina, e navegador e container resolvem igual. O builder pode escolher outra técnica, mas o teste de login ponta a ponta é obrigatório.
- **D13 — Seed do DefectDojo local:** um script `lab/seed-defectdojo` cria via API alguns produtos, engagements, tests, findings e URLs fictícios no DefectDojo local. Parte dos hosts já existe em `departamento_endpoint` (seed do app) e parte não, para a aba ter o que mostrar. O script é idempotente (não duplica ao rodar de novo). A API key do lab sai do DefectDojo local e vai para `.env`, que fica fora de qualquer commit.
- **D14 — Frontend:**
  - Continua React 18 + Vite.
  - Entram Tailwind CSS e `lucide-react` (ícones). `App.jsx` monolítico é quebrado em componentes por aba, e os estilos inline saem.
  - Fontes: manter JetBrains Mono para hosts. Para o texto, o builder escolhe uma sans moderna (ex.: Inter).
- **D15 — Testes:**
  - Backend: Vitest + Supertest, com Postgres real em container. Cobrem permissões por papel (pendente/leitor/admin em cada rota de escrita), regra do último admin, migração aditiva (rodar 2x sem erro e sem alterar colunas existentes) e cálculo de não classificados com a API do DefectDojo mockada (dedupe por host, exclusão de classificados e ignorados).
  - Frontend: sem testes automatizados. A validação é visual, com o usuário.

## 8. Telas

| Aba | Conteúdo | Admin | Leitor |
|---|---|---|---|
| Endpoints | Tabela com busca e filtros (criticidade, departamento, tipo). Edição na linha | edita/remove | vê |
| Não classificados | Cards de números, lista ordenada por findings, classificar na linha, ignorar, atualizar | classifica/ignora | vê |
| Departamentos | Lista + CRUD na linha | edita | vê |
| Tipos | Lista + CRUD na linha. Mostra quantos endpoints usam cada tipo | edita | vê |
| Acessos | Usuários que já logaram (nome, e-mail, papel, último login). Troca de papel | edita | **oculta** |

Os cards de números aparecem no topo de Endpoints e de Não classificados. Toasts de sucesso e erro são mantidos. Erro de rede aparece na tela, sem falhar em silêncio.

Indicador de saúde no rodapé do menu:
- banco do app: online/offline;
- DefectDojo: alcançável/inacessível. Se o DefectDojo cair, a aba Não classificados mostra o erro, mas o resto do app funciona.

## 9. Pronto quando

1. `docker compose -f docker-compose.yml -f docker-compose.lab.yml up -d --build` na raiz sobe app, Postgres do app e Keycloak, e o login com `admin@lab.local` funciona ponta a ponta.
2. `novo@lab.local` vê "aguardando liberação". Depois que o admin promove esse usuário a leitor na aba Acessos, ele vê tudo sem editar, e a API devolve 403 a qualquer escrita dele.
3. A aba Não classificados lista os hosts semeados no DefectDojo que não estão no banco. Classificar um host remove ele da lista e cria a linha em `departamento_endpoint` com `tipo_id`.
4. As tabelas e colunas antigas continuam idênticas (verificado via `information_schema` antes e depois).
5. Os testes do backend passam.
6. O usuário confere a UI no navegador e aprova.
7. `docs/PRODUCAO.md` existe e cobre todos os itens de G7.

## 10. Fica a cargo do builder

- Estrutura de pastas do backend (dividir `server.js` em módulos).
- Escolha de bibliotecas menores (validação, fetch, etc.).
- Detalhes visuais dentro da direção C: espaçamento, cores exatas, estados vazios, loading.
- Técnica para alinhar o issuer do Keycloak entre navegador e backend (D12).
- Como obter a contagem de findings ativos por host (D7). Se ficar caro, mostrar só os produtos e ordenar por host, registrando a limitação.
