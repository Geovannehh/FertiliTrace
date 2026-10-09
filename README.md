# FertiliTrace Platform

Controle de movimentações de fertilizantes: **Navio → Descarga → Transportador → Armazém → Box → Caminhão**. Interface em português, React e TypeScript, API Node.js, PostgreSQL com Prisma, Docker e análise em Python.

## O que funciona

- Chegadas criam lotes com produto, navio, referência e peso.
- Transferências registram origem, destino, lote, documento, observação, operador e horário.
- Saldos são calculados pelos registros; saída exige saldo disponível do lote na origem.
- O fluxo exige a próxima etapa. Também permite transferência entre boxes.
- Boxes possuem capacidade e aceitam apenas um produto por vez; vários lotes do mesmo produto são permitidos.
- Painel, pesquisa, filtro por produto, ocupação dos boxes e histórico completo por lote.
- Conciliações guardam saldo esperado, medição física, diferença e método informado.
- Alertas configuráveis por peso absoluto **ou** percentual. A última medição de cada box determina seu alerta ativo.
- Tratativas preservam a medição e o histórico, sem ajuste automático de estoque.
- Exportação CSV e análise Python sem dependências externas.
- Gravações com revisão e comparação atômica evitam sobrescrever uma operação concorrente. Cada comando possui chave de idempotência.

**Exemplo:** entrada de 1.250 t e expedição de 1.210 t deixam saldo de 40 t. Isso, sozinho, não confirma uma perda. Medição física de 0 t contra saldo esperado de 40 t gera divergência de −40 t.

## Demonstração

A primeira execução cria dados fictícios: quatro lotes, seis boxes, 9.800 t recebidas, 2.580 t expedidas, saldo de 7.220 t e duas divergências abertas. Esses registros são gravados apenas quando a base está vazia; recarregar a aplicação não recria a base. Novas operações são persistidas junto à demonstração.

Os valores de N/P/K classificam o **produto**, sem converter peso em massa de nutriente ou pureza química. MAP é classificado pelo fósforo e identificado como N + P. Os limites iniciais de 10 t ou 2% são parâmetros de demonstração, sem pretensão de tolerância oficial. Horários na interface usam Brasília; o banco e o CSV usam ISO UTC.

## Executar a stack solicitada com Docker

Requer Docker Engine com Compose. No diretório do projeto:

```bash
cp .env.example .env
```

Edite `.env`, definindo `POSTGRES_PASSWORD` e `API_TOKEN`. Use valores aleatórios, por exemplo, gerados por `python -c "import secrets; print(secrets.token_hex(32))"`. Para a senha interpolada na URL do PostgreSQL, use o resultado hexadecimal, evitando caracteres que precisam de codificação na URL. Nunca envie `.env` ao Git.

```bash
docker compose up --build -d
docker compose logs -f api
```

Abra **http://localhost:3000**. O Compose inicia PostgreSQL, gera o Prisma Client, aplica o esquema inicial e serve React com Nginx. A API não publica uma porta no host; o Nginx encaminha as chamadas e injeta o token apenas no servidor. Os dados ficam no volume `fertilitrace_db`.

```bash
docker compose down
```

Esse comando mantém o volume. `docker compose down -v` apaga os dados; use apenas quando desejar removê-los.

O ambiente Docker é destinado ao desenvolvimento em rede confiável. O token autentica o gateway na API; a interface local não possui autenticação individual ou perfis de acesso. Para disponibilizá-la fora desse ambiente, implemente autenticação e autorização por usuário, HTTPS e políticas de acesso. Na versão hospedada, o acesso é privado e a API verifica a sessão do usuário.

## Desenvolvimento sem Docker

Requer Node.js 22.13+, pnpm e PostgreSQL disponível.

```bash
pnpm install --frozen-lockfile
npm ci --prefix services/api
cd services/api
```

Defina `DATABASE_URL`, `API_TOKEN` e, opcionalmente, `PORT` no ambiente da API. O Prisma pode ler um arquivo `services/api/.env`, mas o processo Node precisa receber as variáveis no ambiente; não comite o arquivo.

```bash
npm run generate
npm run schema:push
npm run build
npm start
```

Em outro terminal, na raiz, defina o mesmo `API_TOKEN` para o proxy de desenvolvimento. `FERTILI_API_URL` assume `http://localhost:8000`.

```bash
pnpm exec vite --config vite.portable.config.ts
```

Para compilar o frontend portátil:

```bash
pnpm build:portable
```

## Versão hospedada

O projeto também inclui a adaptação para hospedagem gerenciada: React/Vinext, autenticação ChatGPT e SQLite persistente via D1. Essa versão usa `server/ledger-store.ts` e a migração em `drizzle/`. A versão Docker usa **Node.js + PostgreSQL + Prisma**. Ambas reutilizam a mesma interface e as mesmas regras em `domain/ledger.ts`.

Esse desenho mantém a versão acessível funcionando com o banco disponível na hospedagem, e entrega a stack PostgreSQL solicitada como código executável. A versão online não usa PostgreSQL.

## Análise Python

Na tela Movimentações, remova filtros e exporte o CSV para analisar o conjunto completo. A exportação respeita os filtros ativos; exportações parciais produzem análises parciais. Quantidades internas e no CSV são **quilogramas inteiros**, com precisão de 0,001 t.

```bash
python analysis/analyze.py fertilitrace-movimentacoes.csv
python analysis/analyze.py fertilitrace-movimentacoes.csv --output resultado.json
```

O script separa recebimentos externos de expedições e calcula saldos por produto e local. Não soma as etapas internas como recebimentos e não classifica saldo remanescente como perda. O CSV de movimentações não contém as medições físicas; essas são consultadas na central de alertas.

## Estrutura

| Caminho                             | Responsabilidade                                 |
| ----------------------------------- | ------------------------------------------------ |
| `app/page.tsx`                      | Interface operacional                            |
| `components/fertili/`               | Formulários de operação                          |
| `domain/ledger.ts`                  | Regras, validação, saldo e demonstração          |
| `app/api/platform/route.ts`         | API da versão hospedada                          |
| `server/ledger-store.ts`            | Persistência D1 com revisão atômica              |
| `services/api/src/server.ts`        | API Node.js autenticada pelo gateway             |
| `services/api/prisma/schema.prisma` | Esquema PostgreSQL                               |
| `frontend/`                         | Entrada React portátil e Nginx                   |
| `docker-compose.yml`                | PostgreSQL, API e frontend                       |
| `analysis/analyze.py`               | Análise do CSV                                   |
| `tests/`                            | Regras de negócio, análise e concorrência SQLite |

## Verificações

```bash
pnpm exec tsc --noEmit
pnpm test:domain
python -m unittest discover -s tests -p '*_test.py'
pnpm build:portable
```

Os testes cobrem saldo sem contagem duplicada, precisão do peso, trajeto, validações, conservação do estoque, idempotência, conciliação, tratativa, limites e proteção contra revisão obsoleta.

Nesta entrega, foram validados TypeScript, testes de domínio, migração SQLite, análise Python, geração do Prisma Client e builds da API e do frontend. O ambiente de execução não possui Docker; portanto, o conjunto Docker/PostgreSQL ainda precisa de validação integrada em um ambiente com Docker. A interface não passou por teste de navegação automatizado.

## Escopo inicial

O MVP atende um terminal, com cadastro inicial fixo de produtos e boxes. A persistência guarda o diário como um snapshot JSON com revisão; no PostgreSQL, é um campo JSONB. Limite de 20.000 movimentações e payload de 1,5 MB, o que ocorrer primeiro. As operações de movimentação não podem ser editadas ou excluídas pela interface. Não há emissão fiscal, balança integrada, ERP, ajuste de estoque ou cálculo de teor NPK.

Para ampliar a operação, normalize o diário em tabelas relacionais com restrições, adote migrações Prisma versionadas no lugar de `db push`, paginação e autorização por papel. A integridade aqui depende de todas as gravações passarem pela API; não representa um registro inviolável contra edição direta do banco.
