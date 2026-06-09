# Minhas Finanças — Controle de Gastos Pessoais

Aplicação full stack para controle financeiro pessoal e projeção de saldo.

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Python · Flask · SQLAlchemy · SQLite |
| Frontend | React · Vite · Recharts · Tailwind CSS |

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

O banco de dados SQLite (`finance.db`) é criado automaticamente na primeira execução.

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
    │   │   ├── NewTransaction.jsx     # Cadastro de movimentação
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
