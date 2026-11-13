# Endpoint Manager

Interface web para gerenciar Endpoints e Departamentos via PostgreSQL.

## Pré-requisitos

- Docker + Docker Compose
- Acesso a um servidor PostgreSQL existente

## Configuração

1. Copie o arquivo de variáveis de ambiente:
   ```bash
   cp .env.example .env
   ```

2. Edite o `.env` com os dados do seu Postgres:
   ```env
   PG_HOST=192.168.1.100
   PG_PORT=5432
   PG_USER=postgres
   PG_PASSWORD=sua_senha
   PG_DATABASE=nome_do_banco
   ```

## Subindo o projeto

```bash
docker compose up -d --build
```

Acesse: http://localhost:3000

## Funcionalidades

- **Endpoints**: Cadastrar, editar, remover hosts. Definir criticidade (1–4) e vincular a um departamento.
- **Departamentos**: Cadastrar, editar e remover departamentos.
- Filtros por criticidade e departamento na listagem de endpoints.
- Indicador de status da conexão com o banco em tempo real.

## Criticidade

| Nível | Label   |
|-------|---------|
| 1     | Baixa   |
| 2     | Média   |
| 3     | Alta    |
| 4     | Crítica |

## Tabelas criadas automaticamente

```sql
CREATE TABLE departamentos (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(255) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE endpoints (
  id SERIAL PRIMARY KEY,
  endpoint VARCHAR(255) NOT NULL UNIQUE,
  criticidade INTEGER NOT NULL CHECK (criticidade BETWEEN 1 AND 4),
  departamento_id INTEGER REFERENCES departamentos(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);
```

As tabelas são criadas automaticamente na primeira execução se ainda não existirem.

## Portas

| Serviço  | Porta  |
|----------|--------|
| Frontend | 3000   |
| API      | 3001   |
