output "ecr_repository_url" {
  description = "Push backend images here (tag ':latest' by default)."
  value       = aws_ecr_repository.backend.repository_url
}

output "aurora_endpoint" {
  description = "Aurora Serverless v2 writer endpoint."
  value       = aws_rds_cluster.this.endpoint
}

output "apprunner_service_url" {
  description = "Public URL of the backend once create_apprunner_service = true."
  value       = try(aws_apprunner_service.backend[0].service_url, null)
}

output "apprunner_service_arn" {
  description = "ARN used by CI to call apprunner:StartDeployment."
  value       = try(aws_apprunner_service.backend[0].arn, null)
}

output "ci_access_key_id" {
  description = "Add as the AWS_ACCESS_KEY_ID GitHub secret."
  value       = aws_iam_access_key.ci.id
}

output "ci_secret_access_key" {
  description = "Add as the AWS_SECRET_ACCESS_KEY GitHub secret. Only ever shown once here — re-run `terraform output -raw ci_secret_access_key` if you need it again."
  value       = aws_iam_access_key.ci.secret
  sensitive   = true
}
