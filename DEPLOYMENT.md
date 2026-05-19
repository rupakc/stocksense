# StockSense India — GCP Production Deployment

## Prerequisites

- A GCP project with billing enabled
- `gcloud` CLI installed and authenticated locally (for one-time SA setup)
- Terraform >= 1.6 (used by CI; not required locally unless running manually)
- Docker (for local image builds/testing)

---

## 1. GCP Service Account Setup

Create a deployer service account and grant it the roles CI needs:

```bash
PROJECT_ID="your-gcp-project-id"
SA_NAME="github-deployer"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"

# Create the SA
gcloud iam service-accounts create "$SA_NAME" \
  --display-name="GitHub Actions Deployer" \
  --project="$PROJECT_ID"

# Grant required roles
for ROLE in \
  roles/run.admin \
  roles/artifactregistry.admin \
  roles/secretmanager.admin \
  roles/storage.admin \
  roles/iam.serviceAccountUser \
  roles/resourcemanager.projectIamAdmin \
  roles/monitoring.admin \
  roles/logging.admin \
  roles/serviceusage.serviceUsageAdmin; do
  gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member="serviceAccount:$SA_EMAIL" \
    --role="$ROLE"
done

# Export the JSON key
gcloud iam service-accounts keys create sa-key.json \
  --iam-account="$SA_EMAIL"
```

Copy the contents of `sa-key.json` — you will need it as a GitHub secret.
Delete the file from your local machine after copying.

---

## 2. Required GitHub Secrets

In your repository go to **Settings → Secrets and variables → Actions** and add:

| Secret name                  | Value                                                                 |
|------------------------------|-----------------------------------------------------------------------|
| `GCP_PROJECT_ID`             | Your GCP project ID (e.g. `my-project-123`)                          |
| `GCP_SA_KEY`                 | Full JSON content of `sa-key.json` from the step above               |
| `JWT_SECRET_KEY`             | A strong random secret (e.g. `openssl rand -hex 32`)                 |
| `STOCKSENSE_ADMIN_PASSWORD`  | The initial admin password for the StockSense web UI                 |
| `CORS_ORIGINS` *(optional)*  | JSON array of allowed origins, e.g. `["https://your-frontend-url"]`. Defaults to localhost only. Set this after the first deploy once you know the frontend Cloud Run URL. |

---

## 3. First-Time Deployment

Push to the `main` branch. The `Deploy` workflow will:

1. **bootstrap** — Enable GCP APIs, create the Terraform state bucket
   (`{project_id}-tf-state`), create the Artifact Registry repo (`stocksense`),
   and upsert secrets into Secret Manager.
2. **push-images** — Build and push `stocksense/backend` and `stocksense/frontend`
   Docker images tagged with the commit SHA.
3. **terraform** — Run `terraform init / plan / apply` to provision Cloud Run
   services, GCS bucket, IAM bindings, and monitoring resources.

After the workflow completes the URLs are printed at the end of the **terraform**
job under "Show URLs".

---

## 4. SQLite Persistence — Important Limitation

The backend uses SQLite stored at `/tmp/stocksense.db` inside the Cloud Run
container. Cloud Run containers are **ephemeral**: the database is wiped on
every cold start, scale-down to zero, or new deployment.

**What this means in practice:**
- Watchlist, prediction cache, and alert data are lost on restarts.
- The app re-populates the default watchlist on startup via `init_db()`, so basic
  functionality resumes automatically.
- Trained ML model files stored in memory are also lost; the background
  re-training loop will rebuild them after startup.

**Options for persistent storage:**

**Option A — Cloud SQL (recommended for production):**
```bash
# Create a Cloud SQL PostgreSQL instance
gcloud sql instances create stocksense-db \
  --database-version=POSTGRES_15 \
  --tier=db-f1-micro \
  --region=europe-west1 \
  --project="$PROJECT_ID"

# Update DATABASE_URL env var in modules/backend_service/main.tf:
# "postgresql+asyncpg://user:password@/stocksense?host=/cloudsql/PROJECT:REGION:INSTANCE"
```

**Option B — SQLite backup/restore via GCS (lightweight):**
Add startup/shutdown hooks to the backend that copy `stocksense.db` to/from the
`{project_id}-stocksense-models` GCS bucket. The `MODELS_BUCKET` env var is
already available in the container for this purpose.

---

## 5. Updating Environment Variables and Secrets

**To rotate a secret:**
```bash
echo -n "new-value" | gcloud secrets versions add jwt-secret-key \
  --data-file=- --project="$PROJECT_ID"
# Then redeploy (push to main) so Cloud Run picks up the new version.
```

**To change a plain env var** (e.g. `CORS_ORIGINS`):
Edit `infrastructure/terraform/modules/backend_service/main.tf`, update the
`value` field, commit, and push to `main`.

---

## 6. Manual Terraform Operations

If you need to run Terraform locally:

```bash
cd infrastructure/terraform

# Authenticate
gcloud auth application-default login

# Init with the remote state bucket
terraform init \
  -backend-config="bucket=${PROJECT_ID}-tf-state" \
  -backend-config="prefix=terraform/state"

# Copy the example vars file and fill in your values
cp terraform.tfvars.example terraform.tfvars

terraform plan
terraform apply
```

---

## 7. Monitoring Dashboard

After deployment, view the production dashboard at:

```
https://console.cloud.google.com/monitoring/dashboards?project=YOUR_PROJECT_ID
```

Look for **StockSense India — Production** in the dashboard list.

Alert policies notify `rchakraborty@dataguard.com` for:
- Backend uptime failures (health check failing > 2 min)
- High 5xx error rate (> 5% over 5 min)
- High p99 latency (> 10 s over 5 min)

---

## 8. Rolling Back a Deployment

To roll back to a previous image, re-run the deploy workflow on an older commit
or manually update the Cloud Run service via the console:

```bash
gcloud run services update stocksense-backend \
  --image="europe-west1-docker.pkg.dev/${PROJECT_ID}/stocksense/backend:PREVIOUS_SHA" \
  --region=europe-west1 \
  --project="$PROJECT_ID"
```
