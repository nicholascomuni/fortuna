variable "aws_region" {
  description = "AWS region for every resource."
  type        = string
  default     = "us-east-1"
}

variable "project_name" {
  description = "Prefix used to name every resource (kebab-case)."
  type        = string
  default     = "controle-financeiro"
}

variable "db_name" {
  description = "Name of the Postgres database created inside the Aurora cluster."
  type        = string
  default     = "finance"
}

variable "db_master_username" {
  description = "Master username for the Aurora cluster."
  type        = string
  default     = "finance_admin"
}

variable "aurora_min_capacity" {
  description = "Minimum Aurora Serverless v2 capacity, in ACUs (0.5 is the lowest, scales to ~zero cost when idle)."
  type        = number
  default     = 0.5
}

variable "aurora_max_capacity" {
  description = "Maximum Aurora Serverless v2 capacity, in ACUs."
  type        = number
  default     = 2
}

variable "apprunner_cpu" {
  description = "App Runner vCPU allocation (App Runner units, e.g. \"0.25 vCPU\")."
  type        = string
  default     = "0.25 vCPU"
}

variable "apprunner_memory" {
  description = "App Runner memory allocation (e.g. \"0.5 GB\")."
  type        = string
  default     = "0.5 GB"
}

variable "backend_image_tag" {
  description = "Tag of the backend image App Runner tracks in ECR. CI pushes this tag on every deploy."
  type        = string
  default     = "latest"
}

variable "cors_origins" {
  description = "Comma-separated list of allowed frontend origins (e.g. the Cloudflare Pages domain), passed to the backend as CORS_ORIGINS."
  type        = string
  default     = "*"
}

variable "apprunner_unsupported_subnet_ids" {
  description = <<-EOT
    Default-VPC subnet IDs to exclude from the App Runner VPC connector
    because App Runner doesn't support their AZ (Terraform will tell you
    exactly which one via an InvalidRequestException — add it here and
    re-apply; repeat if a second one also fails).
  EOT
  type    = list(string)
  default = ["subnet-0d50ea61e2c4b8ee9"]
}

variable "openai_api_key" {
  description = <<-EOT
    OpenAI API key used by the backend's AI assistant (OPENAI_API_KEY).
    Leave empty to deploy without it — the assistant then reports itself
    as unconfigured instead of erroring. Set this in a local, gitignored
    terraform.tfvars, never commit a real key.
  EOT
  type      = string
  default   = ""
  sensitive = true
}

variable "create_apprunner_service" {
  description = <<-EOT
    Whether to create the App Runner service. Keep this false on the FIRST apply
    (before any image exists in ECR), then set it to true and re-apply once the
    initial image has been pushed. See infra/README.md.
  EOT
  type    = bool
  default = false
}
