# ---------------------------------------------------------------------------
# Network — reuse the account's default VPC to keep this cheap and simple.
# ---------------------------------------------------------------------------

data "aws_vpc" "default" {
  default = true
}

data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# ---------------------------------------------------------------------------
# Secrets — DB master password and the Flask JWT signing key.
# ---------------------------------------------------------------------------

resource "random_password" "db_master" {
  length  = 32
  special = false # Aurora master passwords reject several special chars
}

resource "random_password" "jwt_secret" {
  length  = 48
  special = true
}

# ---------------------------------------------------------------------------
# Database — Aurora Serverless v2 (PostgreSQL-compatible).
# ---------------------------------------------------------------------------

resource "aws_db_subnet_group" "this" {
  name       = "${var.project_name}-db"
  subnet_ids = data.aws_subnets.default.ids
}

resource "aws_security_group" "aurora" {
  name        = "${var.project_name}-aurora"
  description = "Allow Postgres from the App Runner VPC connector"
  vpc_id      = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "apprunner_vpc_connector" {
  name        = "${var.project_name}-apprunner-connector"
  description = "App Runner VPC connector egress"
  vpc_id      = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group_rule" "aurora_from_apprunner" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  security_group_id        = aws_security_group.aurora.id
  source_security_group_id = aws_security_group.apprunner_vpc_connector.id
}

resource "aws_rds_cluster" "this" {
  cluster_identifier     = "${var.project_name}-db"
  engine                 = "aurora-postgresql"
  engine_mode            = "provisioned"
  database_name          = var.db_name
  master_username        = var.db_master_username
  master_password        = random_password.db_master.result
  db_subnet_group_name   = aws_db_subnet_group.this.name
  vpc_security_group_ids = [aws_security_group.aurora.id]
  skip_final_snapshot    = true

  serverlessv2_scaling_configuration {
    min_capacity = var.aurora_min_capacity
    max_capacity = var.aurora_max_capacity
  }
}

resource "aws_rds_cluster_instance" "this" {
  cluster_identifier = aws_rds_cluster.this.id
  instance_class      = "db.serverless"
  engine              = aws_rds_cluster.this.engine
  engine_version      = aws_rds_cluster.this.engine_version
}

# ---------------------------------------------------------------------------
# Secrets Manager — what the backend actually reads at runtime.
# ---------------------------------------------------------------------------

resource "aws_secretsmanager_secret" "database_url" {
  name                    = "${var.project_name}/database-url"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id = aws_secretsmanager_secret.database_url.id
  secret_string = "postgresql://${var.db_master_username}:${random_password.db_master.result}@${aws_rds_cluster.this.endpoint}:5432/${var.db_name}"
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${var.project_name}/jwt-secret"
  recovery_window_in_days = 0
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id     = aws_secretsmanager_secret.jwt_secret.id
  secret_string = random_password.jwt_secret.result
}

# ---------------------------------------------------------------------------
# ECR — where CI pushes the backend image.
# ---------------------------------------------------------------------------

resource "aws_ecr_repository" "backend" {
  name         = "${var.project_name}-backend"
  force_delete = true
}

resource "aws_ecr_lifecycle_policy" "backend" {
  repository = aws_ecr_repository.backend.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "Keep only the last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}

# ---------------------------------------------------------------------------
# IAM — roles App Runner assumes to pull the image and read secrets.
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "apprunner_ecr_access_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["build.apprunner.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "apprunner_ecr_access" {
  name               = "${var.project_name}-apprunner-ecr-access"
  assume_role_policy = data.aws_iam_policy_document.apprunner_ecr_access_assume.json
}

resource "aws_iam_role_policy_attachment" "apprunner_ecr_access" {
  role       = aws_iam_role.apprunner_ecr_access.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSAppRunnerServicePolicyForECRAccess"
}

data "aws_iam_policy_document" "apprunner_instance_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["tasks.apprunner.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "apprunner_instance" {
  name               = "${var.project_name}-apprunner-instance"
  assume_role_policy = data.aws_iam_policy_document.apprunner_instance_assume.json
}

data "aws_iam_policy_document" "apprunner_instance_secrets" {
  statement {
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      aws_secretsmanager_secret.database_url.arn,
      aws_secretsmanager_secret.jwt_secret.arn,
    ]
  }
}

resource "aws_iam_role_policy" "apprunner_instance_secrets" {
  name   = "${var.project_name}-apprunner-read-secrets"
  role   = aws_iam_role.apprunner_instance.id
  policy = data.aws_iam_policy_document.apprunner_instance_secrets.json
}

# ---------------------------------------------------------------------------
# App Runner — the backend service itself.
#
# NOTE: aws_apprunner_service needs an image to already exist at
# `<ecr_repo>:var.backend_image_tag`. Keep create_apprunner_service = false
# until CI has pushed once, then flip it to true. See infra/README.md.
# ---------------------------------------------------------------------------

resource "aws_apprunner_vpc_connector" "this" {
  vpc_connector_name = "${var.project_name}-connector"
  # Not every AZ in a region supports App Runner VPC connectors; drop the
  # ones AWS rejects via var.apprunner_unsupported_subnet_ids (see variables.tf).
  subnets = [
    for s in data.aws_subnets.default.ids : s
    if !contains(var.apprunner_unsupported_subnet_ids, s)
  ]
  security_groups = [aws_security_group.apprunner_vpc_connector.id]
}

resource "aws_apprunner_service" "backend" {
  count        = var.create_apprunner_service ? 1 : 0
  service_name = "${var.project_name}-backend"

  source_configuration {
    auto_deployments_enabled = true

    authentication_configuration {
      access_role_arn = aws_iam_role.apprunner_ecr_access.arn
    }

    image_repository {
      image_repository_type = "ECR"
      image_identifier       = "${aws_ecr_repository.backend.repository_url}:${var.backend_image_tag}"

      image_configuration {
        port = "8080"

        runtime_environment_variables = {
          CORS_ORIGINS = var.cors_origins
        }

        runtime_environment_secrets = {
          DATABASE_URL   = aws_secretsmanager_secret.database_url.arn
          JWT_SECRET_KEY = aws_secretsmanager_secret.jwt_secret.arn
        }
      }
    }
  }

  instance_configuration {
    cpu               = var.apprunner_cpu
    memory            = var.apprunner_memory
    instance_role_arn = aws_iam_role.apprunner_instance.arn
  }

  network_configuration {
    egress_configuration {
      egress_type       = "VPC"
      vpc_connector_arn = aws_apprunner_vpc_connector.this.arn
    }
  }
}

# ---------------------------------------------------------------------------
# CI user — GitHub Actions pushes to ECR and triggers App Runner deploys.
# ---------------------------------------------------------------------------

resource "aws_iam_user" "ci" {
  name = "${var.project_name}-ci"
}

resource "aws_iam_access_key" "ci" {
  user = aws_iam_user.ci.name
}

data "aws_iam_policy_document" "ci" {
  statement {
    sid       = "ECRAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid = "ECRPush"
    actions = [
      "ecr:BatchCheckLayerAvailability",
      "ecr:GetDownloadUrlForLayer",
      "ecr:BatchGetImage",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:UploadLayerPart",
      "ecr:CompleteLayerUpload",
    ]
    resources = [aws_ecr_repository.backend.arn]
  }

  statement {
    sid       = "AppRunnerDeploy"
    actions   = ["apprunner:StartDeployment", "apprunner:DescribeService"]
    resources = ["arn:aws:apprunner:${var.aws_region}:*:service/${var.project_name}-backend/*"]
  }
}

resource "aws_iam_user_policy" "ci" {
  name   = "${var.project_name}-ci"
  user   = aws_iam_user.ci.name
  policy = data.aws_iam_policy_document.ci.json
}
