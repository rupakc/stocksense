variable "project_id" {
  description = "Existing GCP project ID"
  type        = string
}

variable "region" {
  description = "GCP region for all resources"
  type        = string
  default     = "europe-west1"
}

variable "admin_email" {
  description = "Email for monitoring alerts"
  type        = string
}

variable "backend_image" {
  description = "Full Artifact Registry image tag for the backend"
  type        = string
}

variable "frontend_image" {
  description = "Full Artifact Registry image tag for the frontend"
  type        = string
}

variable "cors_origins" {
  description = "JSON array string of allowed CORS origins for the backend (set to frontend Cloud Run URL after first deploy)"
  type        = string
  default     = "[\"http://localhost:5173\",\"http://localhost:3000\"]"
}
