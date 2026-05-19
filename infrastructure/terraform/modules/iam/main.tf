variable "project_id" { type = string }
variable "region"     { type = string }

data "google_project" "current" {
  project_id = var.project_id
}

locals {
  default_compute_sa = "${data.google_project.current.number}-compute@developer.gserviceaccount.com"
}

resource "google_project_iam_member" "compute_sa_secret_accessor" {
  project = var.project_id
  role    = "roles/secretmanager.secretAccessor"
  member  = "serviceAccount:${local.default_compute_sa}"
}

resource "google_project_iam_member" "compute_sa_storage_admin" {
  project = var.project_id
  role    = "roles/storage.objectAdmin"
  member  = "serviceAccount:${local.default_compute_sa}"
}

resource "google_project_iam_member" "compute_sa_log_writer" {
  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${local.default_compute_sa}"
}

output "compute_sa_email" { value = local.default_compute_sa }
