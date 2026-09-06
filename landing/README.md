# Landing page — Fortuna

Site estático simples (sem build, sem framework) para apresentar o Fortuna,
explicar como funciona e vender os planos mensal/anual. Reaproveita as
mesmas cores, fonte (Inter) e o mesmo logo do app principal
(`frontend/src/index.css` / `frontend/src/components/Icons.jsx`), mas é um
projeto separado — pode ser hospedado como um site estático qualquer
(Cloudflare Pages, Netlify, GitHub Pages, um bucket S3, etc.), inclusive
num domínio/subdomínio diferente do app.

Arquivos:
- `index.html` — estrutura da página (hero, como funciona, recursos, preços, FAQ).
- `styles.css` — todo o visual, com as variáveis de cor copiadas do app.
- `script.js` — pequenas interações (menu mobile, ano do rodapé) e os pontos
  de configuração abaixo.
- `favicon.svg` — mesmo ícone do app.

## Preços já configurados na página

- **Mensal:** R$ 29,90/mês.
- **Anual:** R$ 238,80/ano (equivalente a R$ 19,90/mês — cerca de 4 meses grátis).

Para mudar valores, edite os cartões de preço em `index.html` (seção
`#precos`) — os números não vêm de nenhuma API, são texto fixo.

## O que falta integrar/configurar

### 1. Login / cadastro (reaproveitado do app, nenhum código novo)

Os botões "Entrar" e "Assinar mensal/anual" já apontam para o app principal
(`APP_URL` em `script.js`, hoje `https://fortuna.nick-comuni995.workers.dev`,
mais `/login` ou `/cadastro?plano=mensal|anual`). Não existe formulário de
login/cadastro duplicado aqui — de propósito, para não ter duas
implementações de autenticação para manter.

- [ ] Se o domínio de produção do app mudar, atualize `APP_URL` em `script.js`.
- [ ] Opcional: hoje o parâmetro `?plano=mensal|anual` na URL de cadastro é
      só informativo — o `Cadastro.jsx` do app não lê nem faz nada com ele
      ainda. Se você quiser que a pessoa já saia do cadastro indo direto
      para o checkout do plano escolhido, isso precisa de um pequeno ajuste
      no `frontend/src/pages/Cadastro.jsx` para ler esse parâmetro.

### 2. Stripe — pagamento dos planos

A página **não** faz nenhuma chamada ao Stripe hoje. O jeito mais simples de
ativar cobrança real, sem escrever backend nenhum:

- [ ] Criar uma conta Stripe (ou usar uma existente) e pegar as chaves de
      API (`sk_live_...` / `sk_test_...`) no Dashboard.
- [ ] Criar dois **Products** no Stripe: "Fortuna Mensal" e "Fortuna Anual".
- [ ] Criar um **Price** recorrente em cada um: R$ 29,90/mês e
      R$ 238,80/ano.
- [ ] Criar um **Payment Link** para cada Price (Dashboard → Payment Links).
- [ ] Colar as duas URLs em `STRIPE_PAYMENT_LINKS` no topo de `script.js`
      (`mensal` e `anual`). É só isso — os botões de preço passam a abrir o
      checkout do Stripe automaticamente assim que os links existirem (veja
      a lógica em `script.js`); enquanto estiverem `null`, o botão manda a
      pessoa para o cadastro do app normalmente.
- [ ] Configurar em cada Payment Link a "Confirmation page" para redirecionar
      de volta pro app (ex.: `https://fortuna.nick-comuni995.workers.dev/login`)
      depois do pagamento.

Isso já cobra de verdade, mas **não liga automaticamente o pagamento a uma
conta específica do usuário** — um Payment Link estático não sabe quem
pagou. Para isso (essencial se você quiser bloquear/liberar funcionalidades
do app por assinatura), o próximo passo é:

- [ ] Trocar o Payment Link estático por uma **Checkout Session** criada
      dinamicamente por um endpoint no backend (`backend/`), passando
      `client_reference_id=<user_id>` (ou `customer_email`) — assim dá pra
      saber quem pagou.
- [ ] Adicionar um campo de status de assinatura no modelo `User`
      (`backend/models.py`), por exemplo `subscription_status` /
      `subscription_plan` / `stripe_customer_id`.
- [ ] Criar um **webhook endpoint** no backend (`checkout.session.completed`,
      `invoice.paid`, `customer.subscription.deleted`, etc.) que atualiza
      esse status quando o Stripe avisar que o pagamento foi feito, renovado
      ou cancelado. Vai precisar da **Webhook Signing Secret** do Stripe
      (`whsec_...`) como variável de ambiente, igual já é feito com a chave
      da OpenAI (`infra/main.tf` + Secrets Manager).
- [ ] Decidir e implementar o que o app faz com uma conta sem assinatura
      ativa (bloquear tudo? liberar um período de teste? só bloquear o
      assistente de IA?).

### 3. Deploy da landing

Nenhum deploy foi configurado ainda — é só HTML/CSS/JS estático, então
qualquer host estático serve. Duas opções simples:

- [ ] Cloudflare Pages (mesma plataforma do app) apontando pra pasta
      `landing/` como um projeto separado, num domínio/subdomínio à parte
      (ex.: `fortuna.com` para a landing, `app.fortuna.com` para o app).
- [ ] Um segundo site estático na mesma conta Cloudflare Workers/Pages já
      usada pelo `frontend/`.

Depois de decidir o domínio final da landing, atualize os links internos
se necessário (hoje todos os links de navegação são âncoras `#` na própria
página, então não há nada hardcoded para o domínio da própria landing).
