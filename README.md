# Minhas Finanças — Controle de Gastos Pessoais

Aplicação full stack para controle financeiro pessoal e projeção de saldo.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Python · Flask · SQLAlchemy · roda em container no **AWS App Runner** |
| Banco de dados | **PostgreSQL** (AWS Aurora Serverless v2) — SQLite localmente |
| Frontend | React · Vite · Recharts · Tailwind CSS · hospedado no **Cloudflare Pages** |

---

## Pré-requisitos

- **Python 3.10+**
- **Node.js 18+** e **npm**

---

## Rodando o backend

```bash
cd backend

# Crie e ative um ambiente virtual (recomendado)
python -m venv .venv

# Windows
.venv\Scripts\activate

# Linux / macOS
source .venv/bin/activate

# Instale as dependências
pip install -r requirements.txt

# Inicie o servidor (porta 5000)
python app.py
```

Por padrão (sem `DATABASE_URL` definida) usa SQLite local (`finance.db`), criado automaticamente na primeira execução. Para rodar localmente contra um Postgres, defina `DATABASE_URL` (veja `backend/.env.example`).

---

## Deploy em produção

Banco (Aurora Serverless v2) e backend (App Runner) são provisionados via
Terraform, com deploy contínuo automatizado por GitHub Actions a cada push.
Passo a passo completo em [infra/README.md](infra/README.md) — resumo:

1. `cd infra && terraform apply` (duas vezes — App Runner precisa que a imagem já exista no ECR na primeira criação, ver infra/README.md).
2. GitHub Actions ([.github/workflows/deploy-backend.yml](.github/workflows/deploy-backend.yml)) builda e publica a imagem no ECR e redeploya o App Runner a cada push em `backend/**`.

### Frontend — Cloudflare Workers (Static Assets)

1. Conecte o repositório no dashboard da Cloudflare (Workers & Pages → Create → Connect to Git). Todo push builda e publica automaticamente, sem código extra.
2. Root directory: `frontend` · Build command: `npm run build` · Production branch: `master`.
3. Em *Settings → Environment variables*, defina `VITE_API_URL` com a URL pública do App Runner (`terraform output apprunner_service_url` + `/api`).
4. O fallback de rotas do React Router (SPA) é automático — a Cloudflare gera um `wrangler.jsonc` com `assets.not_found_handling: "single-page-application"` no primeiro build. Não use `frontend/public/_redirects`; nesse modo de deploy (Workers Static Assets) ele conflita com o motor de redirects deles.
5. Depois de saber o domínio (produção + preview), atualize `cors_origins` em `infra/terraform.tfvars` e rode `terraform apply` de novo, pra restringir o CORS do backend a esses domínios (aceita wildcard, ex.: `https://*-fortuna.nick-comuni995.workers.dev`).

---

## Rodando o frontend

```bash
cd frontend

npm install
npm run dev
```

Acesse **http://localhost:5173** no navegador.

---

## Estrutura do projeto

```
controle_financeiro/
├── backend/
│   ├── app.py          # Ponto de entrada Flask
│   ├── extensions.py   # Instância do SQLAlchemy
│   ├── models.py       # Modelos Transaction e Settings
│   ├── routes.py       # Endpoints da API REST
│   ├── projection.py   # Lógica de expansão de recorrências e projeção de saldo
│   └── requirements.txt
└── frontend/
    ├── src/
    │   ├── api/client.js          # Camada de comunicação com a API
    │   ├── components/
    │   │   ├── Layout.jsx         # Navegação e estrutura de página
    │   │   ├── SummaryCard.jsx    # Cards de resumo
    │   │   ├── BalanceChart.jsx   # Gráfico de saldo (Recharts)
    │   │   ├── TransactionTable.jsx
    │   │   └── TransactionForm.jsx
    │   ├── pages/
    │   │   ├── Dashboard.jsx          # Tela principal
    │   │   └── RecurringTransactions.jsx
    │   └── utils/format.js        # Formatação BRL e datas
    └── .env                       # VITE_API_URL
```

---

## API Reference

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| GET | `/api/settings` | Retorna saldo inicial |
| PUT | `/api/settings` | Atualiza saldo inicial |
| GET | `/api/transactions` | Lista movimentações (filtros: kind, category, type, start, end) |
| POST | `/api/transactions` | Cria movimentação |
| PUT | `/api/transactions/{id}` | Edita movimentação |
| DELETE | `/api/transactions/{id}` | Exclui movimentação |
| GET | `/api/recurring` | Lista apenas regras recorrentes |
| GET | `/api/projection?start=&end=` | Projeção de saldo expandida com recorrências |
| GET | `/api/categories` | Lista categorias cadastradas |

---

## Funcionalidades

- **Dashboard** com cards de resumo (receitas, despesas, saldo projetado, menor saldo)
- **Gráfico de área** do saldo acumulado ao longo do tempo
- **Tabela** com todas as movimentações e saldo acumulado por linha
- **Destaque em vermelho** quando o saldo fica negativo
- **Filtros** por período, tipo e categoria
- **Cadastro** de movimentações pontuais e recorrentes (semanal, mensal, anual)
- **Recorrências** armazenadas como regras — não como cópias individuais
- **Editar e excluir** qualquer movimentação
- Moeda em **R$ (BRL)** e datas em **dd/mm/aaaa**
- Layout **responsivo** para desktop e mobile
