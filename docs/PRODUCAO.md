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
| `<GRAFANA_USER>` | usuário Postgres que a fonte de dados do Grafana usa (só leitura) |

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

   Além de ser dono, o usuário **sempre** precisa de `CREATE` no schema `public`: a migração v2 cria `tipo`, `usuario`, `endpoint_ignorado` e `em_sessao`, e o PostgreSQL 15 ou superior nega `CREATE` em `public` a quem não é dono do schema. Confira:

   ```sql
   SELECT has_schema_privilege('<PG_USER_DONO>','public','CREATE');
   ```

   Se retornar `f`, execute como superusuário:

   ```sql
   GRANT CREATE ON SCHEMA public TO <PG_USER_DONO>;
   ```

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
# Concede só o PRIMEIRO admin: vale apenas enquanto não existe nenhum admin no banco.
# Tem que ser o e-mail (ou UPN) da sua conta no Entra. Remova após o primeiro acesso (passo 9).
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

**Opção A, proxy reverso existente (recomendada).** Aponte seu proxy (nginx, Traefik, HAProxy etc.) para `http://<IP_APP>:3000` e termine o TLS nele. O proxy deve repassar `Host` e `X-Forwarded-Proto: https`. O nginx do frontend preserva esse header (usa o `X-Forwarded-Proto` recebido quando for `https`, senão o scheme local), e o backend confia nele para emitir o cookie `Secure`. Exemplo em nginx:

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
        # Não classificados com atualização força a leitura completa do DefectDojo.
        proxy_read_timeout 120s;
    }
}
```

Se o proxy roda **no mesmo host** do app, publique a porta só em loopback para ninguém acessar o app em HTTP puro. Crie `docker-compose.override.yml` (o Compose o lê automaticamente junto com o `docker-compose.yml`):

```yaml
services:
  frontend:
    ports: !override
      - "127.0.0.1:3000:80"
```

O `!override` exige Docker Compose 2.24 ou superior; sem ele o Compose somaria as duas portas. Confira com `docker compose port frontend 80`: deve mostrar `127.0.0.1:3000`. E no proxy use `proxy_pass http://127.0.0.1:3000;`. Se o proxy está em **outro host**, mantenha `3000:80` e libere a porta 3000 no firewall **só** para o IP do proxy. Motivo: com `APP_BASE_URL` em `https://` o cookie de sessão é `Secure`. Quem abrir `http://<IP_APP>:3000` direto não recebe o cookie e o login volta em loop.

**Opção B, certificado no nginx do próprio frontend.** Crie `frontend/nginx.tls.conf`. Estes snippets da Opção B **não foram testados** em um ambiente TLS real: valide antes de depender deles.

```nginx
map $http_x_forwarded_proto $fwd_proto {
    default $scheme;
    https   https;
}

server {
    listen 80;
    server_tokens off;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    root /usr/share/nginx/html;
    index index.html;
    server_tokens off;

    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy same-origin always;

    location /api/ {
        proxy_pass http://backend:3001/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
        proxy_read_timeout 120s;
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

1. Abra `<URL_APP>` e entre pelo Entra com a conta cujo e-mail é o `BOOTSTRAP_ADMIN_EMAIL`. Você entra como **admin**. O bootstrap só concede o **primeiro** admin: enquanto já existir algum admin no banco, ninguém mais é promovido por ele, nem a própria conta depois de rebaixada.
2. Abra a aba **Acessos**. Cada pessoa que logar aparece como `pendente`. Troque o papel para `leitor` ou `admin`.
3. Recomendado: apague a linha `BOOTSTRAP_ADMIN_EMAIL` do `.env` e rode `docker compose up -d`. Daqui em diante os admins são definidos só pela aba **Acessos**.
4. Confira o rodapé do menu: banco online e DefectDojo alcançável.
5. Abra **Não classificados** e confirme que a lista carrega.
6. Meça quanto demora a leitura completa do DefectDojo. Na aba **Não classificados**, clique em **Atualizar** e cronometre. Ou, no terminal, copie o valor do cookie `em.sid` do navegador (DevTools, Application, Cookies) e rode:

   ```bash
   time curl -s -o /dev/null -w '%{http_code}\n' -b 'em.sid=<VALOR_DO_COOKIE>' '<URL_APP>/api/nao-classificados?atualizar=1'
   ```

   O nginx do frontend corta a resposta em **120 s** (`proxy_read_timeout`), e devolve 504. Se o tempo passar de uns 60 s, aumente `proxy_read_timeout` em `frontend/nginx.conf` (e no proxy externo, se houver) e rode `docker compose up -d --build frontend`. Se já estiver perto de 120 s, também vale reduzir o volume no DefectDojo (URLs antigas sem findings) ou verificar a latência entre o app e o DefectDojo.

## 10. Grafana: conferir que continua lendo

A migração não renomeia nem remove colunas. Confira. A saída deve listar `id, endpoint, criticidade, departamento_id, created_at` e a nova `tipo_id`:

```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'departamento_endpoint'
ORDER BY ordinal_position;
```

Abra os dashboards do Grafana: devem carregar iguais. As consultas que já existiam continuam válidas.

Opcional, para usar o tipo nos painéis. Se o Grafana conecta com um usuário só de leitura, dê acesso à tabela nova `tipo` antes (como `<PG_USER_DONO>` ou superusuário):

```sql
GRANT SELECT ON tipo TO <GRAFANA_USER>;
```

As outras tabelas novas (`usuario`, `endpoint_ignorado`, `em_sessao`) são internas do app: o Grafana não precisa de acesso a elas.

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

**Rollback:** a migração é só aditiva (tabelas novas e uma coluna nullable). A v1 ignora o que é novo. Para voltar: **antes de atualizar**, anote o commit atual (`git rev-parse HEAD`) ou o nome da imagem em uso. Depois: `docker compose down`, volte o código para esse commit (`git checkout <COMMIT_ANOTADO>`) e rode `docker compose up -d --build` com o `.env` da v1. Nenhum dado se perde. As tabelas novas podem ficar no banco sem problema. Só se precisar restaurar de verdade (**atenção:** `--clean` apaga e recria os objetos, sobrescrevendo tudo o que foi gravado depois do backup):

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
| `permission denied for schema public` na migração | `PG_USER` sem `CREATE` no schema `public`. Veja o passo 2.5 (`GRANT CREATE ON SCHEMA public ...`). |
| Erro no **primeiro login** (500 ou volta para `/?erro=login`), log com `permission denied` em `em_sessao` | A tabela de sessão `em_sessao` não é criada na migração: o `connect-pg-simple` a cria no primeiro login. Por isso a falta de `CREATE` no schema `public` pode passar pela subida e só aparecer ao logar. Mesma solução do passo 2.5. |
| `must be owner of table departamento_endpoint` na migração | `PG_USER` não é dono. Veja o passo 2.5. |
| Aba Não classificados dá 502 | `DD_URL` ou `DD_API_KEY` errados, DefectDojo fora do ar, ou sem rota/firewall (passo 3). Teste: `curl -H "Authorization: Token <DD_API_KEY>" "<URL_DEFECTDOJO>/api/v2/url/?limit=1"`. |
| Volta para o login em loop | `APP_BASE_URL` com `https://` mas o acesso real é HTTP, ou o proxy externo não manda `X-Forwarded-Proto: https`. O nginx do frontend repassa o valor recebido quando é `https`; sem ele, repassa `http` e o backend não grava o cookie `Secure`. Confira o header no proxy. |
| Login parou depois de meses | O client secret expirou. Crie outro (passo 4.4), atualize `OIDC_CLIENT_SECRET` e rode `docker compose up -d`. |
