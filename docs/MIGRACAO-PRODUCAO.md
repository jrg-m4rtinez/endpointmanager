# Guia de migração: trocar a v1 pela v2 em produção

Este guia leva uma pessoa sem experiência técnica, passo a passo, da versão antiga (v1) em produção até a v2, que tem login pela Microsoft (SSO) e também por usuário e senha (login local).

Cada passo tem quatro partes: **O que é**, **Comando**, **O que deve aparecer** e **Se der errado**. Copie os comandos exatamente como estão e troque só o que estiver entre `< >` em MAIÚSCULAS.

Para detalhes técnicos (firewall, TLS, Postgres), este guia aponta para o [Roteiro de produção](PRODUCAO.md).

## 0. Antes de começar

### O que você precisa ter em mãos

| Item | Placeholder | Onde conseguir |
|---|---|---|
| IP do servidor onde o app roda | `<IP_SERVIDOR>` | Com a equipe de infraestrutura |
| Acesso por SSH ao servidor (usuário e senha ou chave) | `<USUARIO_SSH>` | Com a infraestrutura |
| IP do servidor do banco de dados (PostgreSQL) | `<IP_BANCO>` | Com a infraestrutura. Pode ser o mesmo servidor |
| Usuário e senha do banco, e o nome do banco | `<PG_USER_DONO>`, `<SENHA_DO_PG>`, `<PG_DATABASE>` | Estão no `.env` da v1 (variáveis de banco) ou com quem administra o banco |
| Endereço do DefectDojo | `<URL_DEFECTDOJO>` | Ex.: `https://defectdojo.suaempresa.com`, sem barra no fim |
| Conta com poder de administrador no portal Azure (Entra ID) | | Com a equipe de TI/identidade |
| Nome DNS com HTTPS para o app | `<URL_APP>` | Ex.: `https://endpoints.suaempresa.com`. A equipe de rede cria o nome e o certificado |
| Seu e-mail corporativo do Entra | `<SEU_EMAIL>` | O mesmo que você usa para entrar no Microsoft 365 |

### Janela de manutenção e tempo

- Avise os usuários: o app fica **fora do ar** durante a troca. Os dashboards do Grafana **não** saem do ar (eles leem o banco, que continua ligado).
- Tempo total: de 1h30 a 2h30, se você já tiver o DNS, o certificado e as permissões do Azure. Sem eles, deixe esses itens prontos antes.
- O app fica fora do ar só entre os passos 4 e 11 (cerca de 30 a 60 minutos).
- Se algo não estiver pronto, **pare**. É seguro parar antes do passo 4.

### Duas regras que valem para o guia todo

1. **Nunca** cole senhas, secrets ou chaves em e-mail, chat ou em arquivos que vão para o Git.
2. Se um comando mostrar algo diferente do "O que deve aparecer", **não continue**: vá para "Se der errado".

## 1. Entrar no servidor

**O que é:** abrir uma janela de comandos dentro do servidor, pela rede. Isso se chama SSH.

**Comando** (no Terminal do Mac/Linux, ou no PowerShell do Windows):

```bash
ssh <USUARIO_SSH>@<IP_SERVIDOR>
```

**O que deve aparecer:** um pedido de senha (ou entra direto, se usar chave) e depois um prompt parecido com `usuario@servidor:~$`.

**Se der errado:**
- `Connection timed out`: o IP está errado ou você está fora da rede da empresa (conecte na VPN).
- `Permission denied`: usuário ou senha errados. Peça à infraestrutura.

### Achar onde a v1 está

**O que é:** a v1 roda em "containers" (veja o glossário). Precisamos descobrir em qual pasta está o arquivo de configuração dela (`docker-compose.yml`), para poder voltar a ela se algo der errado.

**Comando 1:** listar os containers em execução.

```bash
docker ps
```

**O que deve aparecer:** uma tabela. Procure a linha do app antigo (o nome costuma ter `endpoint`). Anote o nome do container.

```
CONTAINER ID   IMAGE                     STATUS         PORTS                  NAMES
a1b2c3d4e5f6   endpoint-manager-app      Up 3 months    0.0.0.0:3000->3000     endpoint-manager
```

**Comando 2:** perguntar ao Docker de onde esse container foi criado. Troque `<NOME_CONTAINER_V1>` pelo nome que você anotou.

```bash
docker inspect <NOME_CONTAINER_V1> --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}'
```

**O que deve aparecer:** o caminho da pasta, por exemplo `/opt/endpoint-manager`. Anote como `<PASTA_V1>`.

```
/opt/endpoint-manager
```

**Se der errado:**
- Linha em branco: o container não foi criado pelo Compose. Tente `docker inspect <NOME_CONTAINER_V1> | grep -i -E "Source|WorkingDir"` e procure um caminho de pasta. Se não achar, peça a quem instalou a v1.
- `permission denied` no `docker`: use `sudo docker ...` (peça a senha de sudo à infraestrutura).
- Não achou nenhum container do app: a v1 pode estar rodando de outro jeito (direto no servidor, sem Docker). Pare aqui e peça ajuda: o resto do guia supõe Docker.

## 2. Backup do banco

**O que é:** uma cópia de segurança de todo o banco, antes de mexer em qualquer coisa. Se tudo der errado, é daqui que se recupera. **Não pule este passo.**

**Comando:** (troque os `< >`; o programa pede a senha do banco)

```bash
pg_dump -h <IP_BANCO> -U <PG_USER_DONO> -d <PG_DATABASE> -Fc -f backup-antes-v2.dump
```

Se o servidor não tem o `pg_dump` instalado (aparece `command not found`), use esta alternativa, que usa o programa de dentro de um container temporário (troque `16` pela versão do seu Postgres, se souber que é outra):

```bash
docker run --rm -it -v "$PWD":/backup postgres:16-alpine pg_dump -h <IP_BANCO> -U <PG_USER_DONO> -d <PG_DATABASE> -Fc -f /backup/backup-antes-v2.dump
```

**O que deve aparecer:** pede a senha, e **não imprime nada** ao terminar. Silêncio significa que deu certo.

**Conferir o tamanho do arquivo:**

```bash
ls -lh backup-antes-v2.dump
```

```
-rw-r--r-- 1 usuario usuario 38M nov 13 10:02 backup-antes-v2.dump
```

O tamanho **não pode ser 0**. Um banco pequeno gera poucos MB; é normal.

**Copiar o arquivo para fora do servidor** (rode no **seu computador**, não no servidor):

```bash
scp <USUARIO_SSH>@<IP_SERVIDOR>:backup-antes-v2.dump .
```

**O que deve aparecer:** uma linha com o nome do arquivo, o tamanho e `100%`. Guarde esse arquivo em lugar seguro: ele contém todos os dados.

Depois de confirmar que a cópia chegou ao seu computador, **apague o arquivo do servidor** (`rm backup-antes-v2.dump`) ou mova-o para um local protegido: ele contém todos os dados do banco.

**Se der errado:**
- `server version mismatch` ou `aborting because of server version mismatch`: o `pg_dump` é mais antigo que o banco. Use a alternativa com `docker run` trocando `16` pela versão do banco (por exemplo `15` ou `17`).
- `password authentication failed`: senha ou usuário errados.
- `connection refused` ou `timeout`: o servidor não alcança o banco. Veja [PRODUCAO.md, seção 2 e 3](PRODUCAO.md).

## 3. Anotar a versão atual (para o rollback)

**O que é:** guardar o "estado de hoje" da v1. Rollback é voltar atrás: com essas anotações, você consegue religar a v1 exatamente como estava.

**Comandos:** (a pasta é a que você anotou no passo 1)

```bash
cd <PASTA_V1>
pwd
docker compose ps
docker compose images
git rev-parse HEAD
```

**O que deve aparecer:** o caminho da pasta, a lista dos serviços com a situação `running`, o nome e a versão das imagens, e (se a pasta é um repositório Git) um código longo de 40 letras e números.

```
/opt/endpoint-manager
NAME               IMAGE                  COMMAND     SERVICE   STATUS         PORTS
endpoint-manager   endpoint-manager-app   "node ..."  app       Up 3 months    0.0.0.0:3000->3000/tcp
...
a3f9c1e0b7d24e58a1c6f0d9e2b3c4d5e6f70812
```

Copie tudo isso para um arquivo de texto no seu computador. Anote especialmente: **a pasta**, **a imagem** e **o código do Git** (se aparecer).

Guarde também uma cópia do `.env` da v1:

```bash
cp .env ~/env-v1.backup
```

**Se der errado:**
- `not a git repository` no `git rev-parse`: tudo bem, a v1 não veio do Git. Anote só a pasta e a imagem.
- `no configuration file provided`: você não está na pasta certa. Volte ao passo 1.

## 4. Parar a v1

**O que é:** desligar a versão antiga, para a v2 poder ocupar a porta 3000.

**Comando:**

```bash
cd <PASTA_V1>
docker compose down
```

**O que deve aparecer:**

```
[+] Running 2/2
 ✔ Container endpoint-manager  Removed
 ✔ Network endpoint-manager_default  Removed
```

> **NUNCA use `docker compose down -v`.** O `-v` apaga os "volumes", que são onde o Docker guarda dados. Se o banco da v1 estiver em um volume (como acontece no DefectDojo), `-v` **apaga o banco inteiro, e os dashboards do Grafana ficam sem dados**. Use sempre `docker compose down`, sem nada depois.

**Se der errado:**
- `no configuration file provided`: está na pasta errada.
- O app antigo continua respondendo: rode `docker ps` e confira. Se o container ainda existe, rode `docker stop <NOME_CONTAINER_V1>`.

## 5. Baixar a v2

**O que é:** copiar o código da v2 para uma pasta nova do servidor, **ao lado** da pasta da v1 (sem apagar a v1).

**Comando** (se o servidor tem o `git`):

```bash
cd /opt
git clone https://github.com/jrg-m4rtinez/endpointmanager.git endpoint-manager-v2
cd endpoint-manager-v2
```

> Isto baixa a branch principal (`main`), que já traz o login local. Se quem mantém o repositório indicar outra branch, rode `git checkout <BRANCH>` depois do `cd`.

**Alternativa sem `git`:** no navegador, abra https://github.com/jrg-m4rtinez/endpointmanager, clique em **Code, Download ZIP**, envie o ZIP para o servidor (`scp`), e rode:

```bash
cd /opt
unzip endpointmanager-*.zip -d endpoint-manager-v2
cd endpoint-manager-v2
```

(Se o ZIP criar uma pasta dentro da pasta, entre nela com `cd`.)

**O que deve aparecer:** ao rodar `ls`, os itens `backend`, `frontend`, `docker-compose.yml`, `.env.example` e `docs`.

```
backend  docker-compose.lab.yml  docker-compose.yml  docs  frontend  lab  README.md
```

**Se der errado:**
- `Permission denied` ao criar em `/opt`: use outra pasta (ex.: `~/endpoint-manager-v2`) ou `sudo`.
- `repository not found` ou pede login: o repositório é privado. Peça acesso, ou use o ZIP baixado por alguém com acesso.

## 6. Liberar o banco para o app

**O que é:** o banco só aceita conversa de endereços de IP conhecidos. Precisa liberar o IP onde a v2 roda, e dar ao usuário do app as permissões de que a v2 precisa para criar as tabelas novas.

Se o banco está no **mesmo servidor** e a v1 já se conectava a ele, normalmente você só confere as permissões. Se o IP do app é novo, é preciso editar o arquivo `pg_hba.conf` do banco e criar as permissões.

**Resumo do que fazer** (o passo completo, com todos os detalhes, está em [PRODUCAO.md, seção 2](PRODUCAO.md)):

1. Liberar no `pg_hba.conf` uma linha como:

   ```
   host  <PG_DATABASE>  <PG_USER_DONO>  <IP_SERVIDOR>/32  scram-sha-256
   ```

   e aplicar com `SELECT pg_reload_conf();`.
2. Dar permissão de criar tabelas (rode no banco, como administrador do Postgres):

   ```sql
   GRANT CREATE ON SCHEMA public TO <PG_USER_DONO>;
   ```

   O usuário também precisa ser **dono** da tabela `departamento_endpoint`. Veja como conferir em [PRODUCAO.md, seção 2, item 5](PRODUCAO.md).

**Comando de teste** (rode no servidor do app):

```bash
docker run --rm -it postgres:16-alpine psql "postgresql://<PG_USER_DONO>@<IP_BANCO>:5432/<PG_DATABASE>" -c "select 1"
```

**O que deve aparecer:** pede a senha e mostra:

```
 ?column? 
----------
        1
(1 row)
```

**Se der errado:**
- `no pg_hba.conf entry`: a linha do passo 1 acima está faltando ou com o IP errado.
- `Connection refused` ou `timed out`: firewall ou `listen_addresses`. Veja [PRODUCAO.md, seções 2 e 3](PRODUCAO.md).
- `password authentication failed`: senha errada.

Nesta etapa, peça ajuda a quem administra o banco. Mostre a ele este passo e a seção 2 do PRODUCAO.md.

## 7. Registrar o app no Entra ID

**O que é:** o Entra ID é o sistema de contas da Microsoft da sua empresa. Para o botão "Entrar com Microsoft" funcionar, é preciso **cadastrar o app** lá e copiar 3 informações (Tenant ID, Client ID e o Secret). Faça isso no navegador, não no servidor.

Abra https://entra.microsoft.com e entre com a conta de administrador.

1. No menu da esquerda: **Identity** (Identidade) → **Applications** (Aplicativos) → **App registrations** (Registros de aplicativo).
2. Clique em **+ New registration** (Novo registro).
3. **Name** (Nome): `Endpoint Manager`.
4. **Supported account types** (Tipos de conta com suporte): escolha **Accounts in this organizational directory only** (Somente contas neste diretório organizacional).
5. **Redirect URI** (URI de redirecionamento): no seletor escolha **Web** e digite:

   ```
   <URL_APP>/api/auth/callback
   ```

   Exemplo: `https://endpoints.suaempresa.com/api/auth/callback`. Sem barra no fim.
6. Clique em **Register** (Registrar).
7. Na página que abriu (**Overview**, Visão geral), copie e anote:
   - **Application (client) ID** (ID do aplicativo (cliente)): é o `OIDC_CLIENT_ID`.
   - **Directory (tenant) ID** (ID do diretório (locatário)): é o `<TENANT_ID>`.
8. No menu da esquerda do app: **Authentication** (Autenticação). Clique em **Add URI** (Adicionar URI) e adicione uma segunda: `<URL_APP>/` (com a barra no fim). Clique em **Save** (Salvar).
9. **Certificates & secrets** (Certificados e segredos) → aba **Client secrets** → **+ New client secret** (Novo segredo do cliente). Dê uma descrição (ex.: `producao`) e escolha a validade (**Expires**). Clique em **Add**.
10. **Copie agora a coluna "Value" (Valor)**, não a coluna "Secret ID". Ele **só aparece uma vez**. Se sair da tela sem copiar, apague e crie outro. Esse valor é o `OIDC_CLIENT_SECRET`.
11. **Anote a data de validade do secret** no calendário da equipe. Quando ele expirar (as opções vão de uns 3 a 24 meses), **o login pela Microsoft para de funcionar**. Crie um novo secret antes disso e troque no `.env` (veja "Problemas comuns").
12. Recomendado: **Token configuration** (Configuração de token) → **+ Add optional claim** (Adicionar declaração opcional) → tipo **ID** → marque **email** → **Add**. Aceite se o portal pedir para adicionar uma permissão do Microsoft Graph. Sem isso o app usa o nome de usuário (UPN) no lugar do e-mail.
13. **API permissions** (Permissões de API): confira que existe o Microsoft Graph com `openid`, `profile` e `email` (Delegated). Se a sua política exigir, clique em **Grant admin consent** (Conceder consentimento do administrador).

**O que deve aparecer:** você terminou com três valores anotados: `<TENANT_ID>`, `<CLIENT_ID>` e `<CLIENT_SECRET>` (o Value), mais a data de validade do secret.

**Se der errado:**
- Os menus não aparecem ou estão cinzas: você não tem permissão de administrador. Peça a quem tem.
- Esqueceu de copiar o Value: crie outro secret (passo 9) e apague o antigo.
- A Microsoft só aceita `https://` nos redirect URIs (exceto `localhost`). Sem HTTPS pronto, não dá para continuar: veja o passo 10.

Detalhes extras: [PRODUCAO.md, seção 4](PRODUCAO.md).

## 8. API key do DefectDojo

**O que é:** uma "chave" (parecida com uma senha) que permite ao app **ler** o DefectDojo para listar hosts não classificados. O app só lê; nunca escreve. Se você não usa essa aba, pode pular este passo e deixar `DD_API_KEY` vazio.

No navegador, abra o DefectDojo:

1. Entre como administrador. Menu **Users** (Usuários) → **+ New User** (Novo usuário).
2. Crie um usuário só para o app, por exemplo `endpoint-manager`. No campo **Global role** (Papel global), escolha **Reader** (Leitor). Isso garante que a chave só consegue ler.
3. Saia e entre como esse novo usuário. Clique no nome dele (canto superior direito) → **API v2 Key**.
4. Copie a chave. É o `DD_API_KEY`.

**O que deve aparecer:** uma chave com uns 40 caracteres de letras e números.

**Teste** (no servidor; troque os `< >`):

```bash
curl -H "Authorization: Token <DD_API_KEY>" "<URL_DEFECTDOJO>/api/v2/url/?limit=1"
```

Deve devolver um texto JSON começando por `{"count":...`. 

**Se der errado:**
- `401` ou `Invalid token`: a chave foi copiada errada.
- `Could not resolve host` ou `timed out`: o servidor não alcança o DefectDojo. Veja [PRODUCAO.md, seção 3](PRODUCAO.md).
- O DefectDojo precisa ser versão 3.0 ou superior.

## 9. Preencher o `.env`

**O que é:** o `.env` é um arquivo de texto com as configurações do app (endereços, senhas). O app lê dele ao subir. Ele **nunca** vai para o Git.

**Comandos** (no servidor, na pasta da v2):

```bash
cd /opt/endpoint-manager-v2
cp .env.example .env
nano .env
```

### Como editar no `nano`

- Use as setas do teclado para andar. Digite normalmente para escrever.
- Linhas que começam com `#` são comentários (o app ignora).
- Para **salvar**: aperte `Ctrl+O`, depois `Enter`.
- Para **sair**: aperte `Ctrl+X`.
- Para sair **sem salvar**: `Ctrl+X`, depois `N`.

### Gerar o `SESSION_SECRET`

O `SESSION_SECRET` é uma "chave de segurança" aleatória que protege as sessões de login. Gere uma, em outro comando:

```bash
openssl rand -hex 32
```

**O que deve aparecer:** uma sequência de 64 letras e números, tipo `9f2c...` (a sua será diferente). Copie e cole no `.env`.

### Tabela das variáveis

Troque cada valor por um do seu ambiente. Os nomes à esquerda são exatos.

| Variável | O que é | De onde vem | Exemplo |
|---|---|---|---|
| `PG_HOST` | Endereço do banco | `<IP_BANCO>` (passo 0) | `10.0.0.20` |
| `PG_PORT` | Porta do banco | Quase sempre 5432 | `5432` |
| `PG_USER` | Usuário do banco | `<PG_USER_DONO>` (passo 6) | `endpoint` |
| `PG_PASSWORD` | Senha desse usuário | Com quem administra o banco | `<SENHA_DO_PG>` |
| `PG_DATABASE` | Nome do banco que o Grafana lê | `<PG_DATABASE>` | `grafana_dados` |
| `APP_BASE_URL` | Endereço público do app, **com `https://` e sem barra no fim** | `<URL_APP>` | `https://endpoints.suaempresa.com` |
| `SESSION_SECRET` | Chave de segurança das sessões | Saída do `openssl rand -hex 32` | `<64 caracteres>` |
| `BOOTSTRAP_ADMIN_EMAIL` | E-mail que vira o **primeiro** admin | `<SEU_EMAIL>` (o do Entra) | `voce@suaempresa.com` |
| `OIDC_ISSUER` | Endereço do emissor das contas | `https://login.microsoftonline.com/<TENANT_ID>/v2.0` | `https://login.microsoftonline.com/11111111-2222-3333-4444-555555555555/v2.0` |
| `OIDC_CLIENT_ID` | ID do app no Entra | Passo 7.7 (Application ID) | `aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee` |
| `OIDC_CLIENT_SECRET` | Segredo do app no Entra | Passo 7.10 (**Value**) | `<VALUE_DO_SECRET>` |
| `DD_URL` | Endereço do DefectDojo | `<URL_DEFECTDOJO>` | `https://defectdojo.suaempresa.com` |
| `DD_API_KEY` | Chave de leitura do DefectDojo | Passo 8 | `<CHAVE_DO_DEFECTDOJO>` |
| `LOGIN_LOCAL` | Liga ou desliga o login por usuário e senha. Opcional. Valores: `ligado` (o padrão) ou `desligado` | Sua decisão. Pode deixar fora do arquivo | `ligado` |
| `TRUST_PROXY` | Quantos proxies existem à frente do app. Opcional, padrão `1` (só o nginx do próprio app) | Só mude se houver outro balanceador na frente do nginx | `1` |

Nota sobre `TRUST_PROXY`: o app acessa o IP de quem chama pelo proxy. Se houver um segundo proxy (por exemplo um balanceador da empresa) à frente do nginx do app, use `2`, senão o limite de tentativas por IP vê o IP errado.

### Apagar o que é do lab

O `.env.example` traz valores do **ambiente de teste** (lab). Eles **não** podem ficar em produção. Apague do `.env`:

- as linhas `POSTGRES_USER`, `POSTGRES_PASSWORD` e `POSTGRES_DB`;
- o valor de teste do `OIDC_ISSUER` (o `http://host.docker.internal:8082/...`), o `OIDC_CLIENT_SECRET` de teste (`lab-secret-troque-em-producao`), o `BOOTSTRAP_ADMIN_EMAIL=admin@lab.local`, o `DD_URL` e o `PG_*` de teste: troque todos pelos valores da tabela.

### Conferir o arquivo

```bash
grep -v "^#" .env | grep -n -E "POSTGRES_|lab.local|lab-secret|host.docker.internal|localhost|^PG_HOST=db$|^PG_(USER|PASSWORD|DATABASE)=endpoint$"
```

**O que deve aparecer:** **nada** (nenhuma linha). O comando ignora as linhas de comentário (que começam com `#`) e procura só valores de teste do lab. Se aparecer alguma linha, ainda sobrou valor de teste: edite **só aquela linha** no `nano` e rode o comando de novo.

Proteja o arquivo para que só você o leia:

```bash
chmod 600 .env
```

**Se der errado:**
- O `grep` mostrou linhas com `lab` ou `host.docker.internal`: corrija essas linhas.
- Apertou `Ctrl+X` e perguntou "Save modified buffer?": aperte `Y` e depois `Enter`.
- Se faltar alguma variável obrigatória, o app **não sobe** e o log diz quais faltam (passo 11).

## 10. HTTPS

**O que é:** HTTPS é a conexão protegida (o cadeado no navegador). É **obrigatório** neste app por dois motivos: a Microsoft só aceita endereços `https://` no login, e o cookie de sessão é marcado como "seguro" e só funciona em HTTPS.

O app acessível em `http://...` (sem cadeado) faz o login **voltar para a tela inicial em loop**.

**Qual opção escolher:**

- **Opção A, recomendada:** a sua empresa já tem um servidor que cuida de HTTPS (nginx, Traefik, HAProxy, balanceador). Peça à rede para apontá-lo para `http://<IP_SERVIDOR>:3000`. O proxy da empresa cuida do certificado e repassa o tráfego ao app. Os detalhes técnicos que a equipe de rede precisa estão em [PRODUCAO.md, seção 7, Opção A](PRODUCAO.md) (incluindo os cabeçalhos `Host` e `X-Forwarded-Proto: https`).
- **Opção B:** colocar o certificado no nginx do próprio app. Só se não houver proxy da empresa. Veja [PRODUCAO.md, seção 7, Opção B](PRODUCAO.md). Ela não foi testada em ambiente real: use só com ajuda técnica.

Importante para quem cuida da rede:
- O **backend nunca deve ser exposto diretamente**. Ele só é acessado pelo nginx do app (o serviço `frontend`). Só a porta 3000 (do `frontend`) é publicada, e o ideal é que **só o seu proxy** a alcance (veja PRODUCAO.md, seção 7).
- Se houver outro balanceador na frente do nginx, ajuste `TRUST_PROXY` no `.env` (passo 9).

**Teste** (do seu computador, depois que o app estiver no ar, passo 11):

```bash
curl -sS -o /dev/null -w "%{http_code}\n" <URL_APP>/api/auth/config
```

**O que deve aparecer:** `200`.

**Se der errado:**
- `Could not resolve host`: o nome DNS ainda não foi criado.
- Erro de certificado: o certificado não está instalado ou está com o nome errado. Fale com a rede.
- `502`: o proxy não alcança o app, ou o app ainda não subiu.

## 11. Subir a v2

**O que é:** ligar a v2. Na primeira vez ela também cria as tabelas novas no banco (só adiciona, sem mexer no que o Grafana lê).

**Comandos** (na pasta da v2):

```bash
cd /opt/endpoint-manager-v2
docker compose up -d --build
```

> Use **só** `docker-compose.yml` (o comando acima). **Nunca** use `-f docker-compose.lab.yml` em produção: ele sobe um Keycloak e um banco de teste.

A primeira vez demora alguns minutos (baixa e constrói as imagens).

**O que deve aparecer** no fim:

```
 ✔ Container endpoint-manager-api  Started
 ✔ Container endpoint-manager-ui   Started
```

Confira se estão rodando:

```bash
docker compose ps
```

```
NAME                   IMAGE                      SERVICE    STATUS         PORTS
endpoint-manager-api   endpoint-manager-backend   backend    Up 20 seconds
endpoint-manager-ui    endpoint-manager-frontend  frontend   Up 20 seconds  0.0.0.0:3000->80/tcp
```

Veja o que o backend escreveu:

```bash
docker compose logs backend
```

**O que deve aparecer:** estas linhas (a ordem pode variar um pouco):

```
Migrations applied.
OIDC configurado (issuer https://login.microsoftonline.com/<TENANT_ID>/v2.0).
DefectDojo configurado (<URL_DEFECTDOJO>).
API running on :3001
```

**Se der errado:**
- `Variáveis de ambiente obrigatórias ausentes: ...`: o `.env` está incompleto. Corrija e rode `docker compose up -d` de novo.
- `LOGIN_LOCAL inválido`: o valor só pode ser `ligado` ou `desligado`.
- `TRUST_PROXY inválido`: o valor tem de ser um número inteiro (0, 1, 2...).
- `Falha ao iniciar a API` ou várias linhas `tentativa 1/... falhou`: o app não alcança o banco. Repita o teste do passo 6 e confira `PG_HOST`, `PG_USER` e `PG_PASSWORD`.
- `permission denied for schema public` ou `must be owned by`/`must be owner`: faltam permissões no banco (passo 6).
- `port is already allocated` na porta 3000: a v1 ainda está rodando. Volte ao passo 4.
- `OIDC` com erro de issuer: confira o `OIDC_ISSUER`.

## 12. Primeiro login

**O que é:** entrar pela primeira vez, com sua conta Microsoft. A conta cujo e-mail está em `BOOTSTRAP_ADMIN_EMAIL` vira o **primeiro administrador**.

**Passos:**

1. Abra `<URL_APP>` no navegador. Aparece a tela de entrada, com o botão **Entrar com Microsoft** e, abaixo, um formulário de e-mail e senha.
2. Clique em **Entrar com Microsoft**. Entre com a sua conta da empresa (a do `BOOTSTRAP_ADMIN_EMAIL`).
3. Você volta para o app. No menu deve aparecer a aba **Acessos**, que só admins veem. Isso confirma que você é admin.
4. Abra **Acessos** e veja se o seu nome está na lista com o papel `Admin` e a origem **Microsoft**.

### Remover o `BOOTSTRAP_ADMIN_EMAIL`

Esse e-mail só serve para o primeiro acesso. Depois disso, retire-o:

```bash
nano .env
```

Apague a linha `BOOTSTRAP_ADMIN_EMAIL=...`, salve (`Ctrl+O`, `Enter`) e saia (`Ctrl+X`). Depois reinicie o app:

```bash
docker compose up -d
```

**O que deve aparecer:**

```
 ✔ Container endpoint-manager-api  Started
 ✔ Container endpoint-manager-ui   Running
```

**Se der errado:**
- Erro `AADSTS50011` na tela da Microsoft: o Redirect URI cadastrado no Entra é diferente de `<URL_APP>/api/auth/callback`. Corrija no passo 7.
- Entrou, mas **sem** a aba Acessos e com "aguardando liberação": o e-mail que a Microsoft mandou é diferente do `BOOTSTRAP_ADMIN_EMAIL`. Veja "Problemas comuns".
- O login volta para a tela de entrada em loop: o acesso não está em HTTPS (passo 10).

## 13. Criar usuários locais

**O que é:** um usuário local entra com **e-mail e senha** do próprio app, sem passar pela Microsoft. Serve para pessoas que não têm conta no Entra, ou como acesso quando a Microsoft estiver fora do ar. **Só administradores criam** usuários locais.

### Criar um usuário local

1. Entre como admin e abra a aba **Acessos**.
2. Clique no botão **+ Novo usuário local** (no alto da página).
3. Preencha o **nome**, o **e-mail** e o **papel** (`Leitor` só vê; `Admin` pode tudo). Confirme.
4. O app mostra um painel com uma **senha temporária**, com o botão **Copiar** e o aviso:

   > **Anote agora: esta senha não será mostrada de novo.**

5. Clique em **Copiar** e envie a senha para a pessoa **por um canal seguro** (de preferência pessoalmente ou por um gerenciador de senhas; evite e-mail ou chat de grupo). Mande o e-mail dela em outra mensagem.
6. Se você fechar o painel sem copiar, a senha **se perde**. Nesse caso use **Redefinir senha** (veja abaixo).

### O que a pessoa faz no primeiro login

1. Abre `<URL_APP>` e usa o formulário de **e-mail e senha** (não o botão da Microsoft).
2. O app mostra a tela **Crie sua senha**. É obrigatório criar uma senha nova antes de usar o app: **mínimo de 12 caracteres** e diferente da senha temporária. Depois de clicar em **Salvar e continuar**, ela entra normalmente.

Cada pessoa na lista aparece com a origem **Local** ou **Microsoft**.

### Redefinir a senha de um usuário local

Na linha da pessoa (só aparece em quem é **Local**, e não na sua própria linha), clique em **Redefinir senha** e confirme. O app gera outra senha temporária (mesmo painel, mesmo aviso). A senha antiga deixa de funcionar e a pessoa precisa criar uma nova no próximo login. Redefinir também **desbloqueia** a conta, caso ela esteja bloqueada.

### O que acontece com as sessões abertas

Trocar ou redefinir a senha **não derruba** as sessões que a pessoa já tem abertas (por exemplo, no celular). Cada sessão dura até 8 horas e só termina quando expira ou quando a pessoa sai.

Se você suspeita que a sessão de alguém foi roubada, existem duas formas de forçar **todo mundo** a entrar de novo:

1. **Apagar as sessões do banco** (rápido, não reinicia o app):

   ```bash
   docker run --rm -it postgres:16-alpine psql "postgresql://<PG_USER_DONO>@<IP_BANCO>:5432/<PG_DATABASE>" -c "DELETE FROM em_sessao"
   ```

   **O que deve aparecer:** `DELETE <número>`, com a quantidade de sessões apagadas.
2. **Trocar o `SESSION_SECRET`** no `.env` (gere outro com `openssl rand -hex 32`) e rodar `docker compose up -d`.

Não há botão no app que derrube só as sessões de uma pessoa.

### Bloqueio e limites (para você saber)

- 5 senhas erradas seguidas bloqueiam **aquela conta** por 15 minutos. Enquanto estiver bloqueada, até a senha certa falha, sem avisar o motivo.
- Cada endereço IP pode tentar no máximo 20 vezes por 15 minutos; passou disso, o app responde que há tentativas demais.
- A mensagem de erro de login é sempre a mesma ("credenciais inválidas"), mesmo se o e-mail não existir. Isso é proposital, por segurança.

### Dar acesso a quem entrou pela Microsoft

Quem entra pela primeira vez pelo botão Microsoft aparece na aba **Acessos** como `Pendente` e vê "aguardando liberação". Para liberar: na linha da pessoa, troque o papel para `Leitor` ou `Admin`. Salva na hora. A pessoa recarrega a página e já usa o app.

### Limitação conhecida: o mesmo e-mail em duas contas

Se alguém tem um usuário **local** e depois entra pelo botão **Microsoft** com o **mesmo e-mail**, o app cria **uma segunda conta** (de origem Microsoft, `Pendente`), separada da local. As duas coexistem. Para essa pessoa usar a conta Microsoft, dê papel a ela na aba Acessos. O `BOOTSTRAP_ADMIN_EMAIL` só vale para contas da Microsoft, nunca para as locais. Para evitar confusão, quem entra pela Microsoft não deve receber um usuário local com o mesmo e-mail (o app já recusa criar o local se o e-mail já está em uso).

### Desligar o login local

Para quem não vai usar: coloque `LOGIN_LOCAL=desligado` no `.env` e rode `docker compose up -d`. O formulário de e-mail e senha some da tela de entrada e as rotas locais deixam de existir. Usuários locais já criados ficam guardados, mas **não conseguem entrar** enquanto estiver desligado.

**Se der errado:**
- Mensagem de e-mail já em uso: já existe uma conta com esse e-mail (local ou Microsoft, sem diferenciar maiúsculas).
- O botão **+ Novo usuário local** não aparece: o login local está desligado (`LOGIN_LOCAL=desligado`).
- Perdeu a senha temporária antes de copiar: use **Redefinir senha** na linha da pessoa.

## 14. Admin de emergência

**O que é:** um comando que cria (ou redefine) um administrador **local** direto no servidor. Use **só** quando ninguém consegue entrar, por exemplo: o Entra está fora do ar e não há outro admin, ou o secret do Entra expirou e o último admin esqueceu a senha. Não é para uso diário.

**Comando** (na pasta da v2; troque o e-mail e o nome):

```bash
docker compose exec backend node scripts/criar-admin-local.js <EMAIL_DO_ADMIN> "<NOME_DO_ADMIN>"
```

Exemplo:

```bash
docker compose exec backend node scripts/criar-admin-local.js socorro@suaempresa.com "Admin de Emergência"
```

**O que deve aparecer:**

```
Admin local socorro@suaempresa.com criado.
Senha temporária: <16 caracteres>
Entre com ela; é preciso trocar a senha no primeiro login (o sistema vai exigir).
```

Se o e-mail já era de um usuário local, aparece no lugar da primeira linha:

```
Usuário local socorro@suaempresa.com já existia: senha redefinida e papel admin garantido.
```

Entre em `<URL_APP>` pelo formulário de e-mail e senha, com essa senha temporária, e crie a sua senha nova.

O que o comando faz, conforme o caso:
- E-mail **não existe**: cria um usuário local com papel Admin.
- E-mail **já é de um usuário local**: redefine a senha (e a mostra) e o promove a Admin. Também desbloqueia a conta.
- E-mail **é de alguém que entra pela Microsoft**: **recusa**, com a mensagem `O e-mail ... pertence a um usuário SSO...`. Use outro e-mail.

**Atenção:**
- O comando **ignora** a configuração `LOGIN_LOCAL=desligado`: ele cria o admin mesmo assim, mas **esse admin não consegue entrar** enquanto o login local estiver desligado, e o comando não avisa disso. Se for o caso, mude para `LOGIN_LOCAL=ligado` no `.env` (ou apague a linha) e rode `docker compose up -d`.
- A senha temporária aparece **na tela do terminal**: não deixe ninguém olhando e não a cole em chats.

**Se der errado:**
- `service "backend" is not running`: o app não está no ar. Rode `docker compose up -d` e `docker compose ps`.
- `Falha: Uso: node scripts/criar-admin-local.js <email> "<nome>"...`: faltou o e-mail ou o nome, ou o e-mail é inválido. Ponha o nome **entre aspas**.
- `no configuration file provided`: você não está na pasta da v2.
- Erro de conexão com o banco: confira o `.env` (passo 9).

## 15. Conferir o Grafana

**O que é:** garantir que os dashboards continuam funcionando. A v2 só adiciona colunas e tabelas e **não** renomeia nem remove nada que o Grafana lê.

**Passos:**

1. Abra o Grafana e entre nos dashboards de sempre. Eles devem carregar **iguais**, com os mesmos números.
2. Se algum painel ficar vazio ou com erro, confira as colunas da tabela. Rode no banco (como usuário do banco):

   ```bash
   docker run --rm -it postgres:16-alpine psql "postgresql://<PG_USER_DONO>@<IP_BANCO>:5432/<PG_DATABASE>" -c "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'departamento_endpoint' ORDER BY ordinal_position;"
   ```

**O que deve aparecer:** as colunas `id`, `endpoint`, `criticidade`, `departamento_id`, `created_at` (as antigas) e `tipo_id` (a nova):

```
  column_name    | data_type | is_nullable
-----------------+-----------+-------------
 id              | integer   | NO
 endpoint        | character varying | NO
 criticidade     | integer   | NO
 departamento_id | integer   | YES
 created_at      | timestamp without time zone | YES
 tipo_id         | integer   | YES
```

**Se der errado:**
- Painel dá `permission denied`: se você quer usar a tabela `tipo` no Grafana, o usuário do Grafana precisa de leitura nela: `GRANT SELECT ON tipo TO <GRAFANA_USER>;` (veja [PRODUCAO.md, seção 10](PRODUCAO.md)).
- Falta alguma das colunas antigas: **pare** e faça o rollback (passo 16). Isso não deve acontecer.

## 16. Se der errado: rollback

**O que é:** voltar para a v1, como estava. O que a v2 criou no banco (tabelas e uma coluna extra) é só aditivo: a v1 ignora e funciona normalmente.

**Comandos:**

```bash
cd /opt/endpoint-manager-v2
docker compose down
cd <PASTA_V1>
docker compose up -d
docker compose ps
```

Lembrete: use `down` **sem** `-v`.

**O que deve aparecer:** a v1 com a situação `Up` no `docker compose ps`, e o app antigo respondendo no endereço de sempre.

Se a v1 foi construída a partir do código (`build`) e você anotou o código do Git no passo 3, rode antes `git checkout <CODIGO_DO_GIT_ANOTADO>` na pasta da v1 e use `docker compose up -d --build`. O `.env` da v1 continua na pasta dela, e há uma cópia em `~/env-v1.backup`.

### Restaurar o backup (só se for realmente necessário)

Normalmente **não** é preciso, porque a migração da v2 só adiciona coisas. Restaure **apenas** se os dados do banco foram danificados.

> **ATENÇÃO:** restaurar com `--clean` **apaga** os objetos do banco e os recria como estavam no backup, **sobrescrevendo tudo o que foi gravado depois do backup** (incluindo, por exemplo, endpoints classificados na v2). Não faça isso sem decisão do responsável.

```bash
pg_restore -h <IP_BANCO> -U <PG_USER_DONO> -d <PG_DATABASE> --clean --if-exists backup-antes-v2.dump
```

**Se der errado:**
- `docker compose up -d` da v1 falha por porta ocupada: a v2 ainda está no ar. Rode `docker ps` e pare-a (`docker compose down` na pasta da v2).
- A v1 não sobe e você não sabe por quê: use as anotações do passo 3 (pasta, imagem, código do Git) e peça ajuda com o log (`docker compose logs`).

## 17. Problemas comuns

| O que aparece | O que significa e o que fazer |
|---|---|
| Erro `AADSTS50011` na tela da Microsoft | O endereço de retorno cadastrado no Entra não é igual ao do app. Ele precisa ser exatamente `<URL_APP>/api/auth/callback` (mesmo `https`, mesmo nome, sem barra no fim) e igual ao `APP_BASE_URL` do `.env`. Corrija no portal (passo 7). |
| `issuer mismatch` ou `unexpected JWT "iss"` | O `OIDC_ISSUER` está errado. Deve ser `https://login.microsoftonline.com/<TENANT_ID>/v2.0`, com o **código** do diretório (não o nome da empresa) e `/v2.0` no fim. |
| Entrei, mas não sou admin | A Microsoft mandou um e-mail diferente do `BOOTSTRAP_ADMIN_EMAIL` (muitas vezes o nome de usuário/UPN). Ponha esse mesmo valor no `BOOTSTRAP_ADMIN_EMAIL`, reinicie (`docker compose up -d`), saia e entre de novo. Ou adicione o optional claim `email` (passo 7.12). Se já existe algum admin, o bootstrap não faz mais nada: use o comando do passo 14. |
| O login volta para a tela inicial em loop | O app está sendo aberto em `http://` sem cadeado, mas o `APP_BASE_URL` é `https://`; ou o proxy da empresa não manda o cabeçalho `X-Forwarded-Proto: https`. Acesse sempre pelo `<URL_APP>`; peça à rede para conferir o cabeçalho (PRODUCAO.md, seção 7). |
| Não consegue conectar ao banco (`ECONNREFUSED`, `timeout`, `no pg_hba.conf entry`) | Firewall, ou o IP do app não está liberado no banco. Repita o teste do passo 6. |
| `permission denied for schema public` ou `must be owner of table departamento_endpoint` | O usuário do banco não tem as permissões do passo 6. Peça a quem administra o banco. |
| Erro no primeiro login, e o log mostra `permission denied` em `em_sessao` | Mesma causa: falta `CREATE` no schema `public`. A tabela de sessão só é criada no primeiro login. Passo 6. |
| A aba "Não classificados" dá erro 502 | `DD_URL` ou `DD_API_KEY` errados, ou o DefectDojo está fora do ar ou inalcançável. Refaça o teste do passo 8. |
| O login Microsoft parou de funcionar depois de meses | O secret do Entra expirou. Crie outro (passo 7.9), troque o `OIDC_CLIENT_SECRET` no `.env` e rode `docker compose up -d`. Enquanto isso, quem tem usuário local ou o admin de emergência (passo 14) continua entrando. |
| **Esqueci a senha do usuário local** | Um admin abre **Acessos**, clica em **Redefinir senha** na linha da pessoa e entrega a nova senha temporária (passo 13). Se o **único admin** esqueceu a senha, use o comando do passo 14 com o e-mail dele: ele redefine a senha e mantém o papel de admin. |
| **Conta bloqueada** (a pessoa digita a senha certa e não entra) | Foram 5 senhas erradas seguidas e a conta ficou bloqueada por 15 minutos. Tem duas saídas: esperar 15 minutos, ou um admin clicar em **Redefinir senha** em **Acessos** (isso também desbloqueia e gera nova senha temporária). O app não avisa que a conta está bloqueada, de propósito: a mensagem é sempre a mesma. |
| O app diz que há **tentativas demais** | Esse endereço IP passou de 20 tentativas em 15 minutos. Espere 15 minutos. Se muitas pessoas da empresa aparecem "no mesmo IP" (por causa de um proxy ou balanceador), ajuste `TRUST_PROXY` (passo 9). |
| A pessoa precisa trocar a senha e não consegue | A senha nova precisa ter **pelo menos 12 caracteres** e ser diferente da atual (a temporária). |
| Suspeita de que alguém usa a sessão de outra pessoa | Trocar a senha **não** derruba sessões abertas (valem até 8h). Veja a seção 13, "O que acontece com as sessões abertas". |

## 18. Glossário curto

- **Container:** um "pacote" fechado que roda um programa (o app, o banco) isolado do resto do servidor. O Docker é o programa que cuida deles.
- **Compose (`docker compose`):** o comando que liga, desliga e descreve vários containers de uma vez, lendo o arquivo `docker-compose.yml`. `up -d` liga; `down` desliga (sem `-v`!).
- **`.env`:** o arquivo de texto com as configurações e senhas do app. Nunca vai para o Git nem deve ser enviado por e-mail.
- **SSO (Single Sign-On):** entrar com a mesma conta da empresa, sem criar outra senha. Aqui é o botão **Entrar com Microsoft**.
- **Entra ID:** o sistema de contas e senhas da Microsoft da empresa (antes se chamava Azure AD). É ele que confirma quem você é.
- **Redirect URI (URI de redirecionamento):** o endereço para onde a Microsoft devolve você depois do login. Precisa ser exatamente o cadastrado no Entra.
- **Hash:** uma "impressão digital" da senha, que não dá para desfazer. O app guarda só o hash (com o método argon2id), nunca a senha em si. Por isso nem um admin consegue ver a senha de alguém: só gerar outra.
