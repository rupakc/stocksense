variable "project_id" { type = string }
variable "region"     { type = string }

resource "google_storage_bucket" "data" {
  project                     = var.project_id
  name                        = "${var.project_id}-stocksense-data"
  location                    = var.region
  uniform_bucket_level_access = true
  force_destroy               = true

  versioning {
    enabled = true
  }

  # Keep only the last 10 versions of each object to bound storage costs
  lifecycle_rule {
    condition { num_newer_versions = 10 }
    action    { type = "Delete" }
  }
}

output "bucket_name" { value = google_storage_bucket.data.name }
