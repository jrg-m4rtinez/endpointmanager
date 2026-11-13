# Roteiro de produção

Passo a passo para subir o Endpoint Manager v2 na sua rede. Execute em ordem. Troque cada `<PLACEHOLDER>` pelo valor do seu ambiente e nunca commite o `.env`.

| Placeholder | O que é |
|---|---|
| `<IP_APP>` | IP do host onde o app vai rodar (como o banco o enxerga) |
| `<IP_BANCO>` | IP do host do PostgreSQL |
| `<PG_DATABASE>` | nome do banco que o Grafana lê |
| `<PG_USER_DONO>` | usuário Postgres dono de `departamento_endpoint` |
| `<URL_APP>` | URL pública do app, com `https://` e sem barra final (ex.: `https://endpoints.suaempresa.com`) |
| `<URL_DEFECTDOJO>` | URL do DefectDojo, sem barra final |
| `<TENANT_ID>` | Directory (tenant) ID do Entra ID |

**Regra de ouro:** produção usa **somente** `docker-compose.yml`. Nunca use `docker-compose.lab.yml` (ele sobe Keycloak e usuários de teste).

## 1. Pré-requisitos

- Host com Docker e Docker Compose v2.
- Um nome DNS apontando para esse host (o `<URL_APP>`) e um certificado HTTPS para ele (passo 7).
- Acesso administrativo ao Postgres e ao tenant Entra ID.
- DefectDojo 3.0 ou superior (Locations ativo), alcançável a partir do host.
- O código deste repositório no host (`git clone` ou cópia).

## 2. Postgres

O app grava no mesmo banco que o Grafana lê, no schema `public`. Se esse Postgres só aceita conexões de certos IPs (caso comum do banco do DefectDojo), libere o `<IP_APP>`.

1. Descubra onde ficam os arquivos. Dentro do Postgres:

   ```sql
   SHOW hba_file;
   SHOW config_file;
   SHOW listen_addresses;
   ```

   Se o Postgres roda em Docker (ex.: o banco do DefectDojo), esses arquivos ficam dentro do volume do `PGDATA` (normalmente `/var/lib/postgresql/data/pg_hba.conf` e `postgresql.conf`, dentro do container). Edite com `docker exec -it <CONTAINER_POSTGRES> sh` ou direto no volume. A porta 5432 precisa estar **publicada** no host (`ports: "5432:5432"` no compose do banco), senão o `<IP_APP>` não chega nele.

2. Adicione ao `pg_hba.conf`, **acima** de qualquer regra mais genérica ou `reject` que case antes:

   ```
   host  <PG_DATABASE>  <PG_USER_DONO>  <IP_APP>/32  scram-sha-256
   ```

   Se as senhas do banco ainda são `md5`, troque `scram-sha-256` por `md5`.

3. Confira `listen_addresses` no `postgresql.conf`. Precisa conter o IP do banco ou `'*'`. Se estiver em `'localhost'`, mude para `'*'`.
   **Atenção:** mudar `listen_addresses` exige **restart** do Postgres. O reload não basta. Programe uma janela.

4. Aplique o `pg_hba.conf` sem derrubar o banco:

   ```sql
   SELECT pg_reload_conf();
   ```

5. Usuário: use um usuário que já seja dono de `departamento_endpoint`, ou crie um. A migração faz `ALTER TABLE departamento_endpoint ADD COLUMN`, então ele precisa ser dono. Confira o dono atual:

   ```sql
   SELECT tableowner FROM pg_tables WHERE tablename='departamento_endpoint';
   ```

   O resultado deve ser `<PG_USER_DONO>`. Se for outro, use o dono real como `<PG_USER_DONO>` ou transfira (como superusuário):

   ```sql
   ALTER TABLE departamento_endpoint OWNER TO <PG_USER_DONO>;
   ALTER TABLE departamento OWNER TO <PG_USER_DONO>;
   ```

   Se as tabelas ainda não existem, o usuário precisa de `CREATE` no schema `public`: `GRANT CREATE ON SCHEMA public TO <PG_USER_DONO>;`.

6. Teste a conexão **a partir do `<IP_APP>`**:

   ```bash
   docker run --rm -it postgres:16-alpine psql "postgresql://<PG_USER_DONO>@<IP_BANCO>:5432/<PG_DATABASE>" -c "select 1"
   ```

   Pede a senha e deve imprimir `1`. Se falhar, veja o passo 12.

As tabelas novas (`tipo`, `usuario`, `endpoint_ignorado` e a de sessão) passam a fazer parte desse banco e dos backups dele.

## 3. Firewall

Libere:

- `<IP_APP>` para `<IP_BANCO>:5432` (TCP);
- saída 443 do host do app para `<URL_DEFECTDOJO>` e para `login.microsoftonline.com`;
- entrada 443 dos usuários para o app (passo 7).

Teste, no host do app:

```bash
curl -sS -o /dev/null -w "%{http_code}\n" https://login.microsoftonline.com/<TENANT_ID>/v2.0/.well-known/openid-configuration
curl -sS -o /dev/null -w "%{http_code}\n" <URL_DEFECTDOJO>/api/v2/user_profile/
```

O primeiro deve dar `200`. O segundo deve dar `401` (alcançável, só falta o token).

## 4. Entra ID (portal Azure)

Portal: https://entra.microsoft.com, em Microsoft Entra ID.

1. **App registrations, New registration.** Nome: `Endpoint Manager`. Tipo: "Accounts in this organizational directory only". Em **Redirect URI**, plataforma **Web**: `<URL_APP>/api/auth/callback`. Registre.
2. Na página do app, copie **Application (client) ID** e **Directory (tenant) ID**.
3. **Authentication, Add URI:** adicione também `<URL_APP>/` (o app volta para ela depois do logout). Salve.
4. **Certificates & secrets, New client secret.** Copie o **Value** agora (não aparece de novo). **Anote a validade.** Quando expirar, o login para. Crie outro secret antes e troque no `.env`.
5. **Token configuration, Add optional claim**, tipo **ID**, marque `email`. Aceite adicionar a permissão do Graph se o portal pedir. Sem o claim `email`, o app usa `preferred_username` (normalmente o UPN). Funciona, mas o `BOOTSTRAP_ADMIN_EMAIL` precisa bater com ele.
6. **API permissions:** Microsoft Graph, delegated: `openid`, `profile`, `email`. Se faltar alguma, adicione. Se a sua política exigir, clique em "Grant admin consent".
7. **Authentication, Front-channel logout URL** (opcional): `<URL_APP>/`.
8. Mapeamento para o `.env`:

   | Portal | Variável |
   |---|---|
   | `https://login.microsoftonline.com/<TENANT_ID>/v2.0` | `OIDC_ISSUER` |
   | Application (client) ID | `OIDC_CLIENT_ID` |
   | Client secret **Value** | `OIDC_CLIENT_SECRET` |

O Entra só aceita redirect URI `https://` (exceto `localhost`). Por isso o TLS (passo 7) é obrigatório.

## 5. DefectDojo

1. No DefectDojo, **Users, New User:** crie um usuário só para o app (ex.: `endpoint-manager`) com papel **global Reader** (campo "Global role"). Sem permissão de escrita.
2. Entre como esse usuário, abra o menu do usuário e **API v2 Key**. Copie a chave.
3. Preencha no `.env`: `DD_URL=<URL_DEFECTDOJO>` e `DD_API_KEY=<a chave>`.

O app só lê (`GET /api/v2/...`). A chave nunca vai para o navegador.

## 6. `.env` de produção

No host do app, na raiz do repositório: `cp .env.example .env`. Deixe assim (os valores `<...>` são seus):

```env
# --- Postgres (o mesmo banco que o Grafana lê) ---
PG_HOST=<IP_BANCO>
PG_PORT=5432
PG_USER=<PG_USER_DONO>
PG_PASSWORD=<SENHA_DO_PG_USER_DONO>
PG_DATABASE=<PG_DATABASE>
# As variáveis POSTGRES_* do .env.example são só do container de lab. Apague-as.

# --- App ---
# URL pública, com https e sem barra final. https liga cookie Secure e trust proxy.
APP_BASE_URL=<URL_APP>
# Obrigatório. Gere com: openssl rand -hex 32
SESSION_SECRET=<SAIDA_DO_OPENSSL_RAND>
# E-mail que vira admin no primeiro login. Tem que ser o e-mail (ou UPN) da sua conta no Entra.
BOOTSTRAP_ADMIN_EMAIL=<seu e-mail do Entra>

# --- OIDC (Entra ID) ---
OIDC_ISSUER=https://login.microsoftonline.com/<TENANT_ID>/v2.0
OIDC_CLIENT_ID=<APPLICATION_CLIENT_ID>
OIDC_CLIENT_SECRET=<CLIENT_SECRET_VALUE>

# --- DefectDojo (só leitura; opcional. Sem isso a aba Não classificados não funciona) ---
DD_URL=<URL_DEFECTDOJO>
DD_API_KEY=<API_KEY_DO_USUARIO_READER>
```

O backend recusa subir se faltar qualquer uma destas: `PG_HOST`, `PG_PORT`, `PG_USER`, `PG_PASSWORD`, `PG_DATABASE`, `SESSION_SECRET`, `APP_BASE_URL`, `OIDC_ISSUER`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`. Restrinja o arquivo: `chmod 600 .env`.

## 7. TLS (HTTPS)

O app **precisa** ser acessado por `<URL_APP>` (https). Escolha uma opção.

**Opção A, proxy reverso existente (recomendada).** Aponte seu proxy (nginx, Traefik, HAProxy etc.) para `http://<IP_APP>:3000` e termine o TLS nele. O proxy deve repassar `Host` e `X-Forwarded-Proto: https`. Exemplo em nginx:

```nginx
server {
    listen 443 ssl;
    server_name <NOME_DNS_DO_APP>;
    ssl_certificate     /etc/ssl/<NOME_DNS_DO_APP>.crt;
    ssl_certificate_key /etc/ssl/<NOME_DNS_DO_APP>.key;
    location / {
        proxy_pass http://<IP_APP>:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
```

**Opção B, certificado no nginx do próprio frontend.** Crie `frontend/nginx.tls.conf`:

```nginx
server {
    listen 80;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    root /usr/share/nginx/html;
    index index.html;

    location /api/ {
        proxy_pass http://backend:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

Crie também `docker-compose.tls.yml` (não é o arquivo de lab), com seus certificados em `./certs/fullchain.pem` e `./certs/privkey.pem`:

```yaml
services:
  frontend:
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./frontend/nginx.tls.conf:/etc/nginx/conf.d/default.conf:ro
      - ./certs:/etc/nginx/certs:ro
```

Nesse caso, no passo 8 use `docker compose -f docker-compose.yml -f docker-compose.tls.yml up -d --build`. O compose base também publica `3000:80`, então a porta 3000 continua aberta em HTTP: bloqueie-a no firewall.

## 8. Subir

Na raiz do repositório, no host do app:

```bash
docker compose up -d --build
docker compose logs backend
```

Sem `-f docker-compose.lab.yml`. O log do backend deve conter `Migrations applied.` e nenhuma mensagem de variável ausente. Se aparecer `Variáveis de ambiente obrigatórias ausentes: ...`, corrija o `.env` e rode `docker compose up -d` de novo.

## 9. Primeiro acesso

1. Abra `<URL_APP>` e entre pelo Entra com a conta cujo e-mail é o `BOOTSTRAP_ADMIN_EMAIL`. Você entra como **admin**.
2. Abra a aba **Acessos**. Cada pessoa que logar aparece como `pendente`. Troque o papel para `leitor` ou `admin`.
3. Confira o rodapé do menu: banco online e DefectDojo alcançável.
4. Abra **Não classificados** e confirme que a lista carrega.

## 10. Grafana: conferir que continua lendo

A migração não renomeia nem remove colunas. Confira. A saída deve listar `id, endpoint, criticidade, departamento_id, created_at` e a nova `tipo_id`:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'departamento_endpoint'
ORDER BY ordinal_position;
```

Abra os dashboards do Grafana: devem carregar iguais. As consultas que já existiam continuam válidas.

Opcional, para usar o tipo nos painéis:

```sql
SELECT e.endpoint, e.criticidade, d.nome AS departamento, t.nome AS tipo
FROM departamento_endpoint e
LEFT JOIN departamento d ON d.id = e.departamento_id
LEFT JOIN tipo t ON t.id = e.tipo_id;
```

## 11. Backup e rollback

**Antes de subir a v2**, faça backup do banco:

```bash
pg_dump -h <IP_BANCO> -U <PG_USER_DONO> -d <PG_DATABASE> -Fc -f backup-antes-v2.dump
```

**Rollback:** a migração é só aditiva (tabelas novas e uma coluna nullable). A v1 ignora o que é novo. Para voltar: `docker compose down`, volte o código da v1 (`git checkout <TAG_OU_COMMIT_V1>`) e rode `docker compose up -d --build` com o `.env` da v1. Nenhum dado se perde. As tabelas novas podem ficar no banco sem problema. Só se precisar restaurar de verdade:

```bash
pg_restore -h <IP_BANCO> -U <PG_USER_DONO> -d <PG_DATABASE> --clean --if-exists backup-antes-v2.dump
```

## 12. Troubleshooting

| Sintoma | Causa e solução |
|---|---|
| `AADSTS50011` ao logar | Redirect URI diferente da registrada. Deve ser exatamente `<URL_APP>/api/auth/callback` (mesmo `https`, mesmo host, sem barra no fim) e coerente com o `APP_BASE_URL` do `.env`. |
| `issuer mismatch` ou `unexpected JWT "iss"` | `OIDC_ISSUER` diferente do emissor real. Use `https://login.microsoftonline.com/<TENANT_ID>/v2.0`, com o tenant ID (não o domínio) e `/v2.0` no fim. |
| Admin não reconhecido, e-mail vazio | O token veio sem claim `email` e o app usou `preferred_username` (UPN). Adicione o optional claim `email` (passo 4.5) ou ponha o UPN em `BOOTSTRAP_ADMIN_EMAIL`. E-mail com `email_verified: false` é descartado. Depois de corrigir, saia e entre de novo. |
| `ECONNREFUSED` ou timeout no banco | Firewall, `pg_hba.conf` ou `listen_addresses` (passos 2 e 3). Repita o teste do `psql` do passo 2.6. `no pg_hba.conf entry` significa linha ausente ou IP errado. |
| `must be owner of table departamento_endpoint` na migração | `PG_USER` não é dono. Veja o passo 2.5. |
| Aba Não classificados dá 502 | `DD_URL` ou `DD_API_KEY` errados, DefectDojo fora do ar, ou sem rota/firewall (passo 3). Teste: `curl -H "Authorization: Token <DD_API_KEY>" "<URL_DEFECTDOJO>/api/v2/url/?limit=1"`. |
| Volta para o login em loop | `APP_BASE_URL` com `https://` mas o acesso real é HTTP, ou o proxy não manda `X-Forwarded-Proto https`. O cookie `Secure` só funciona sob HTTPS. |
| Login parou depois de meses | O client secret expirou. Crie outro (passo 4.4), atualize `OIDC_CLIENT_SECRET` e rode `docker compose up -d`. |
