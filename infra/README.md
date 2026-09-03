# Infra — Terraform + GitHub Actions

Provisiona Aurora Serverless v2 (Postgres), ECR e App Runner na AWS. Depois do
setup inicial, todo `git push` na `main` que toque em `backend/**` builda,
publica no ECR e redeploya o App Runner sozinho via GitHub Actions.

Você roda o `terraform apply` localmente (não há credenciais AWS nesta
máquina/sessão do Claude). O GitHub Actions só cuida do build/push/deploy
contínuo — ele precisa de uma chave de acesso IAM que o próprio Terraform cria
para isso.

## Pré-requisitos

- [AWS CLI](https://docs.aws.amazon.com/cli/latest/userguide/getting-started-install.html) configurado (`aws configure`) com um usuário/role que tenha permissão de admin (ou pelo menos para criar VPC SGs, RDS, ECR, IAM, App Runner, Secrets Manager).
- [Terraform](https://developer.hashicorp.com/terraform/install) >= 1.5.
- Acesso para criar secrets/variables no repositório do GitHub (`gh` CLI já está disponível, ou use o site).

## Passo a passo (bootstrap)

App Runner exige que a imagem já exista no ECR no momento em que o serviço é
criado — por isso o apply é em duas etapas.

```bat
cd infra
copy terraform.tfvars.example terraform.tfvars
terraform init
```

**1. Primeiro apply — só a infra que não depende de imagem** (`create_apprunner_service = false`, valor padrão do `terraform.tfvars.example`):

```bat
terraform apply
```

Isso cria o Aurora, o ECR, o VPC connector e o usuário de CI.

**2. Configure o GitHub Actions** com os valores gerados. Em vez de copiar/colar valores manualmente (o `ci_secret_access_key` é sensível), manda a saída do `terraform output` direto pro `gh` com pipe (`|`) — funciona igual no cmd, PowerShell ou bash:

```bat
terraform output -raw ci_access_key_id | gh secret set AWS_ACCESS_KEY_ID
terraform output -raw ci_secret_access_key | gh secret set AWS_SECRET_ACCESS_KEY
gh variable set AWS_REGION --body "us-east-1"
terraform output -raw ecr_repository_url | gh variable set ECR_REPOSITORY_URL
```

**3. Dispare o workflow uma vez** (manualmente, antes de existir o App Runner service) para publicar a primeira imagem no ECR:

```bat
gh workflow run deploy-backend.yml
gh run watch
```

**4. Segundo apply — agora crie o App Runner service**, já que a imagem `:latest` existe. Abra `infra/terraform.tfvars` e mude `create_apprunner_service` para `true`, depois:

```bat
terraform apply
terraform output apprunner_service_url
```

Pronto — daqui pra frente, todo push em `backend/**` builda, publica no ECR
e o App Runner redeploya sozinho (`auto_deployments_enabled = true` reage ao
push da tag `:latest`; o workflow não chama `start-deployment` porque isso
corre risco de bater um deploy já em andamento e falhar com "isn't in
RUNNING state" mesmo quando o deploy real deu certo).

## Depois de ter o domínio do Cloudflare Pages

Edite `cors_origins` em `terraform.tfvars` com a URL real do Pages:

```hcl
cors_origins = "https://controle-financeiro.pages.dev"
```

e rode de novo:

```bat
terraform apply
```

## Destruir tudo

```bat
terraform destroy
```

Isso apaga o Aurora, o App Runner, o ECR (com `force_delete`) e o usuário de
CI — remova também os secrets/variables do GitHub (`gh secret remove ...`).
