variable "project_id"    { type = string }
variable "region"        { type = string }
variable "image"         { type = string }
variable "data_bucket" { type = string }
variable "cors_origins"  {
  type    = string
  default = "[\"http://localhost:5173\",\"http://localhost:3000\"]"
}

resource "google_cloud_run_v2_service" "backend" {
  project  = var.project_id
  name     = "stocksense-backend"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    execution_environment = "EXECUTION_ENVIRONMENT_GEN2"
    timeout               = "600s"

    scaling {
      min_instance_count = 1
      max_instance_count = 3
    }

    containers {
      image = var.image

      ports {
        container_port = 8000
      }

      resources {
        limits = {
          memory = "2Gi"
          cpu    = "2"
        }
      }

      env {
        name  = "ENV"
        value = "production"
      }
      env {
        name  = "DATABASE_URL"
        value = "sqlite+aiosqlite:////tmp/stocksense.db"
      }
      env {
        name  = "GCS_BUCKET"
        value = var.data_bucket
      }
      env {
        name  = "CORS_ORIGINS"
        value = var.cors_origins
      }
      env {
        name  = "MODEL_DIR"
        value = "/tmp/models"
      }

      env {
        name = "JWT_SECRET_KEY"
        value_source {
          secret_key_ref {
            secret  = "jwt-secret-key"
            version = "latest"
          }
        }
      }
      env {
        name = "DEFAULT_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = "stocksense-admin-password"
            version = "latest"
          }
        }
      }

      liveness_probe {
        http_get {
          path = "/health"
        }
        period_seconds    = 30
        failure_threshold = 3
      }

      startup_probe {
        http_get {
          path = "/health"
        }
        initial_delay_seconds = 30
        period_seconds        = 10
        failure_threshold     = 18
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "backend_public" {
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.backend.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "url" { value = google_cloud_run_v2_service.backend.uri }
