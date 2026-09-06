"""
Tool schemas the model can call. Kept as plain {"name", "description",
"parameters"} dicts — LangChain's bind_tools() accepts this shape directly
and normalizes it per-provider (OpenAI function-calling, Anthropic tool
use, ...), which is what makes tool-calling itself model-agnostic without
having to hand-roll a provider-specific schema per model.

Only the schemas live here. Read tools are executed immediately by
executors.py; write tools are never executed inline — every write tool
call always turns into a pending action for the user to confirm (see
actions.py), so their "implementation" here is just the schema.
"""

READ_TOOL_NAMES = {
    "list_transactions", "get_accounts", "get_cards", "get_categories",
    "get_projection", "get_reports", "get_credit_purchases", "get_plans",
}
WRITE_TOOL_NAMES = {
    "create_transaction", "update_transaction", "delete_transaction",
    "create_credit_purchase", "update_credit_purchase", "delete_credit_purchase",
    "create_card", "update_card", "delete_card",
    "create_account", "update_account", "delete_account",
    "create_plan", "update_plan",
    "parcelar_fatura",
}

_DATE = {"type": "string", "description": "Data no formato YYYY-MM-DD"}

_TRANSACTION_PROPS = {
    "description": {"type": "string", "description": "Descrição do lançamento"},
    "amount": {"type": "number", "description": "Valor em reais, maior que zero"},
    "kind": {"type": "string", "enum": ["receita", "despesa"]},
    "type": {"type": "string", "enum": ["pontual", "recorrente"]},
    "date": _DATE,
    "category": {"type": "string", "description": "Categoria (opcional)"},
    "payment_method": {"type": "string", "enum": ["a_vista"], "description": "Forma de pagamento (não usar para cartão de crédito — use create_credit_purchase)"},
    "account_id": {"type": "integer", "description": "ID da conta bancária de origem/destino — obrigatório. Use -1 para se referir à conta que você está criando NESTA MESMA resposta com create_account (nunca invente ou reaproveite um id existente para isso). Se estiver criando MAIS de uma conta nova na mesma resposta, use -1 para a primeira create_account, -2 para a segunda, e assim por diante, na ordem em que aparecem na sua resposta."},
    "interest_rate": {"type": "number", "description": "Taxa de juros por período, em % (opcional)"},
    "interest_period": {"type": "string", "enum": ["mensal", "anual"]},
    "interest_count": {"type": "integer", "description": "Número de períodos de juros"},
    "frequency": {"type": "string", "enum": ["semanal", "mensal", "anual"], "description": "Obrigatório se type=recorrente"},
    "recurrence_end_type": {"type": "string", "enum": ["por_data", "por_ocorrencias"], "description": "Obrigatório se type=recorrente"},
    "recurrence_end_date": _DATE,
    "recurrence_count": {"type": "integer"},
}

_CARD_PROPS = {
    "name": {"type": "string", "description": "Nome do cartão"},
    "bank": {"type": "string", "description": "Banco emissor (opcional)"},
    "due_day": {"type": "integer", "description": "Dia de vencimento da fatura, de 1 a 31"},
    "credit_limit": {"type": "number", "description": "Limite de crédito (opcional)"},
    "color": {"type": "string", "description": "Cor do cartão em hexadecimal, ex: #6366f1 (opcional)"},
    "account_id": {"type": "integer", "description": "ID da conta bancária usada para pagar a fatura (opcional). Use -1 para se referir à conta que você está criando NESTA MESMA resposta com create_account. Se estiver criando mais de uma conta nova na mesma resposta, use -1 para a primeira, -2 para a segunda, etc., na ordem em que aparecem."},
}

_ACCOUNT_PROPS = {
    "name": {"type": "string", "description": "Nome da conta bancária"},
    "bank": {"type": "string", "description": "Banco (opcional)"},
    "initial_balance": {"type": "number", "description": "Saldo inicial da conta (opcional, padrão 0)"},
}

_PLAN_PROPS = {
    "name": {"type": "string", "description": "Nome do plano de contas"},
}

_PURCHASE_PROPS = {
    "description": {"type": "string"},
    "total_amount": {"type": "number", "description": "Valor total da compra, maior que zero"},
    "card_id": {"type": "integer", "description": "ID do cartão de crédito. Use -1 para se referir ao cartão que você está criando NESTA MESMA resposta com create_card (nunca invente ou reaproveite um id existente para isso). Se estiver criando MAIS de um cartão novo na mesma resposta, use -1 para o primeiro create_card, -2 para o segundo, e assim por diante, na ordem em que aparecem na sua resposta."},
    "purchase_date": _DATE,
    "category": {"type": "string"},
    "installments": {"type": "integer", "description": "Número de parcelas (só para type=pontual)"},
    "type": {"type": "string", "enum": ["pontual", "recorrente"]},
    "frequency": {"type": "string", "enum": ["semanal", "mensal", "anual"], "description": "Obrigatório se type=recorrente"},
    "recurrence_end_type": {"type": "string", "enum": ["por_data", "por_ocorrencias"], "description": "Obrigatório se type=recorrente"},
    "recurrence_end_date": _DATE,
    "recurrence_count": {"type": "integer"},
}

TOOLS = [
    {
        "name": "list_transactions",
        "description": "Lista lançamentos (receitas/despesas) já cadastrados no plano ativo, com filtros opcionais.",
        "parameters": {"type": "object", "properties": {
            "start_date": _DATE, "end_date": _DATE,
            "kind": {"type": "string", "enum": ["receita", "despesa"]},
            "category": {"type": "string"},
        }},
    },
    {
        "name": "get_accounts",
        "description": "Lista as contas bancárias do plano ativo, com id, nome, banco e saldo inicial.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "get_cards",
        "description": "Lista os cartões de crédito do plano ativo, com id, nome, limite e fatura atual.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "get_categories",
        "description": "Lista as categorias já usadas em lançamentos do plano ativo.",
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "get_plans",
        "description": (
            "Lista todos os planos de contas do usuário (cada plano é uma dashboard independente, com suas "
            "próprias contas/cartões/lançamentos) e qual deles está ativo agora. Use para responder perguntas "
            "sobre planos de contas, ou para descobrir o id de um plano antes de renomeá-lo com update_plan."
        ),
        "parameters": {"type": "object", "properties": {}},
    },
    {
        "name": "get_projection",
        "description": "Retorna a projeção de saldo (linha do tempo, resumo de receitas/despesas, saldo mínimo) para um período.",
        "parameters": {"type": "object", "properties": {
            "start_date": _DATE, "end_date": _DATE,
            "account_id": {"type": "integer", "description": "Filtrar por uma conta específica (opcional)"},
        }},
    },
    {
        "name": "get_reports",
        "description": "Retorna relatório financeiro do período: médias mensais, taxa de poupança, gastos por categoria, maiores gastos/receitas, formas de pagamento.",
        "parameters": {"type": "object", "properties": {"start_date": _DATE, "end_date": _DATE}},
    },
    {
        "name": "get_credit_purchases",
        "description": "Lista compras feitas no cartão de crédito.",
        "parameters": {"type": "object", "properties": {"card_id": {"type": "integer"}}},
    },
    {
        "name": "create_transaction",
        "description": "Propõe a criação de um novo lançamento (receita ou despesa). Nunca executa direto — sempre gera uma confirmação para o usuário.",
        "parameters": {"type": "object", "properties": _TRANSACTION_PROPS,
                        "required": ["description", "amount", "kind", "type", "date", "account_id"]},
    },
    {
        "name": "update_transaction",
        "description": "Propõe a edição de um lançamento existente (todos os campos devem ser enviados, como uma substituição completa). Nunca executa direto.",
        "parameters": {"type": "object", "properties": {"transaction_id": {"type": "integer"}, **_TRANSACTION_PROPS},
                        "required": ["transaction_id", "description", "amount", "kind", "type", "date", "account_id"]},
    },
    {
        "name": "delete_transaction",
        "description": "Propõe a exclusão de um lançamento. Nunca executa direto.",
        "parameters": {"type": "object", "properties": {"transaction_id": {"type": "integer"}}, "required": ["transaction_id"]},
    },
    {
        "name": "create_credit_purchase",
        "description": "Propõe uma nova compra no cartão de crédito. Nunca executa direto.",
        "parameters": {"type": "object", "properties": _PURCHASE_PROPS,
                        "required": ["description", "total_amount", "card_id", "purchase_date"]},
    },
    {
        "name": "update_credit_purchase",
        "description": "Propõe a edição de uma compra no cartão existente (substituição completa dos campos). Nunca executa direto.",
        "parameters": {"type": "object", "properties": {"purchase_id": {"type": "integer"}, **_PURCHASE_PROPS},
                        "required": ["purchase_id", "description", "total_amount", "card_id", "purchase_date"]},
    },
    {
        "name": "delete_credit_purchase",
        "description": "Propõe a exclusão de uma compra no cartão. Nunca executa direto.",
        "parameters": {"type": "object", "properties": {"purchase_id": {"type": "integer"}}, "required": ["purchase_id"]},
    },
    {
        "name": "create_card",
        "description": "Propõe a criação de um novo cartão de crédito. Nunca executa direto.",
        "parameters": {"type": "object", "properties": _CARD_PROPS, "required": ["name", "due_day"]},
    },
    {
        "name": "update_card",
        "description": "Propõe a edição de um cartão existente (substituição completa dos campos). Nunca executa direto.",
        "parameters": {"type": "object", "properties": {"card_id": {"type": "integer"}, **_CARD_PROPS},
                        "required": ["card_id", "name", "due_day"]},
    },
    {
        "name": "delete_card",
        "description": "Propõe a exclusão de um cartão de crédito. Falha se houver compras vinculadas a ele. Nunca executa direto.",
        "parameters": {"type": "object", "properties": {"card_id": {"type": "integer"}}, "required": ["card_id"]},
    },
    {
        "name": "create_account",
        "description": "Propõe a criação de uma nova conta bancária no plano ativo. Nunca executa direto.",
        "parameters": {"type": "object", "properties": _ACCOUNT_PROPS, "required": ["name"]},
    },
    {
        "name": "update_account",
        "description": "Propõe a edição de uma conta bancária existente (substituição completa dos campos). Nunca executa direto.",
        "parameters": {"type": "object", "properties": {"account_id": {"type": "integer"}, **_ACCOUNT_PROPS},
                        "required": ["account_id", "name"]},
    },
    {
        "name": "delete_account",
        "description": "Propõe a exclusão de uma conta bancária. Falha se houver movimentações ou cartões vinculados a ela. Nunca executa direto.",
        "parameters": {"type": "object", "properties": {"account_id": {"type": "integer"}}, "required": ["account_id"]},
    },
    {
        "name": "create_plan",
        "description": (
            "Propõe a criação de um novo plano de contas — uma dashboard independente, começando vazia, "
            "com uma conta 'Conta principal' de saldo zero. NÃO ativa o plano novo automaticamente: o "
            "usuário continua vendo o plano atual até trocar manualmente pelo menu 'Trocar plano de contas' "
            "no topo da tela (trocar via chat recarregaria a página no meio da conversa). Nunca executa direto."
        ),
        "parameters": {"type": "object", "properties": _PLAN_PROPS, "required": ["name"]},
    },
    {
        "name": "update_plan",
        "description": "Propõe renomear um plano de contas existente do usuário (qualquer um da lista de get_plans, não precisa ser o ativo). Nunca executa direto.",
        "parameters": {"type": "object", "properties": {"plan_id": {"type": "integer"}, **_PLAN_PROPS},
                        "required": ["plan_id", "name"]},
    },
    {
        "name": "parcelar_fatura",
        "description": (
            "Propõe financiar uma fatura de cartão de crédito (uma transação com origem 'credit_invoice'), "
            "dividindo-a em N parcelas crescentes com juros compostos, em vez do pagamento integral automático "
            "no vencimento. Falha se a fatura já estiver parcelada ou se o lançamento não for uma fatura. "
            "Nunca executa direto."
        ),
        "parameters": {"type": "object", "properties": {
            "transaction_id": {"type": "integer", "description": "ID da transação de fatura (source=credit_invoice)"},
            "interest_count": {"type": "integer", "description": "Número total de parcelas, de 2 a 60"},
            "interest_rate": {"type": "number", "description": "Taxa de juros por período, em %, maior que zero"},
            "interest_period": {"type": "string", "enum": ["mensal", "anual"]},
        }, "required": ["transaction_id", "interest_count", "interest_rate", "interest_period"]},
    },
]
