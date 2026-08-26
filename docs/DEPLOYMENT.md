# Deployment Guide

This guide covers deploying `pubpdf` to production on Google Cloud Run (API + Worker) and Vercel (Web dashboard), with Cloud SQL (PostgreSQL), Memorystore (Redis), and Cloud Storage as backing services.

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 (22 recommended) |
| Docker | ≥ 26 |
| `gcloud` CLI | latest |
| `npm` | ≥ 10 |

Authenticate with Google Cloud and set the project:
```bash
gcloud auth login
gcloud config set project <YOUR_GCP_PROJECT_ID>
```

---

## 1. Google Cloud Infrastructure

### 1.1 Enable APIs
```bash
gcloud services enable \
  run.googleapis.com \
  sqladmin.googleapis.com \
  redis.googleapis.com \
  storage.googleapis.com \
  artifactregistry.googleapis.com \
  secretmanager.googleapis.com \
  vpcaccess.googleapis.com
```

### 1.2 Cloud SQL (PostgreSQL 15)
```bash
gcloud sql instances create pubpdf-db \
  --database-version=POSTGRES_15 \
  --tier=db-g1-small \
  --region=us-east1 \
  --storage-auto-increase \
  --no-assign-ip \
  --network=default

gcloud sql databases create epub2pdf --instance=pubpdf-db
gcloud sql users create pubpdf \
  --instance=pubpdf-db \
  --password=<STRONG_RANDOM_PASSWORD>
```

### 1.3 Memorystore (Redis)
```bash
gcloud redis instances create pubpdf-redis \
  --size=1 \
  --region=us-east1 \
  --redis-version=redis_7_0 \
  --network=default
```

Note the Redis IP (`gcloud redis instances describe pubpdf-redis --region=us-east1 --format='value(host)'`).

### 1.4 Cloud Storage bucket
```bash
gsutil mb -l us-east1 gs://pubpdf-conversions
gsutil uniformbucketlevelaccess set on gs://pubpdf-conversions
```

### 1.5 VPC Connector (for Cloud Run ↔ private services)
```bash
gcloud compute networks vpc-access connectors create pubpdf-connector \
  --region=us-east1 \
  --subnet=default \
  --subnet-project=<YOUR_GCP_PROJECT_ID>
```

### 1.6 Service Accounts
```bash
# API service account
gcloud iam service-accounts create pubpdf-api \
  --display-name="PubPDF API"

# Worker service account
gcloud iam service-accounts create pubpdf-worker \
  --display-name="PubPDF Worker"

# Grant Cloud Storage access (worker uploads PDFs; API generates signed URLs)
for SA in pubpdf-api pubpdf-worker; do
  gcloud storage buckets add-iam-policy-binding gs://pubpdf-conversions \
    --member="serviceAccount:${SA}@<PROJECT>.iam.gserviceaccount.com" \
    --role=roles/storage.objectAdmin
done

# Cloud SQL Client (both services)
for SA in pubpdf-api pubpdf-worker; do
  gcloud projects add-iam-policy-binding <PROJECT> \
    --member="serviceAccount:${SA}@<PROJECT>.iam.gserviceaccount.com" \
    --role=roles/cloudsql.client
done
```

---

## 2. Secrets (Secret Manager)

Store all sensitive values in Secret Manager rather than Cloud Run env vars directly:
```bash
echo -n "postgresql://pubpdf:<password>@/epub2pdf?host=/cloudsql/<PROJECT>:us-east1:pubpdf-db" \
  | gcloud secrets create POSTGRES_URL --data-file=-

echo -n "redis://<redis-host>:6379" | gcloud secrets create REDIS_URL --data-file=-
echo -n "sk_prod-<long-random>" | gcloud secrets create API_KEYS_BOOTSTRAP --data-file=-
```

---

## 3. Database Migration

Run the migrations once against Cloud SQL before deploying services:
```bash
# Using Cloud SQL Auth Proxy locally
cloud-sql-proxy <PROJECT>:us-east1:pubpdf-db &
POSTGRES_URL="postgresql://pubpdf:<password>@127.0.0.1:5432/epub2pdf" \
  node scripts/migrate.js
```

---

## 4. Build and Push Docker Images

Build from the **repo root** (both Dockerfiles use the repo root as context):
```bash
# Artifact Registry repository
gcloud artifacts repositories create pubpdf \
  --repository-format=docker \
  --location=us-east1

export REGISTRY=us-east1-docker.pkg.dev/<PROJECT>/pubpdf

# API image
docker build -f packages/api/Dockerfile -t ${REGISTRY}/api:latest .
docker push ${REGISTRY}/api:latest

# Worker image
docker build -f packages/worker/Dockerfile -t ${REGISTRY}/worker:latest .
docker push ${REGISTRY}/worker:latest
```

---

## 5. Deploy API to Cloud Run

```bash
gcloud run deploy pubpdf-api \
  --image=${REGISTRY}/api:latest \
  --region=us-east1 \
  --platform=managed \
  --service-account=pubpdf-api@<PROJECT>.iam.gserviceaccount.com \
  --vpc-connector=pubpdf-connector \
  --set-secrets="POSTGRES_URL=POSTGRES_URL:latest,REDIS_URL=REDIS_URL:latest,API_KEYS_BOOTSTRAP=API_KEYS_BOOTSTRAP:latest,S3_ACCESS_KEY_ID=S3_ACCESS_KEY_ID:latest,S3_SECRET_ACCESS_KEY=S3_SECRET_ACCESS_KEY:latest" \
  --set-env-vars="NODE_ENV=production,S3_BUCKET_NAME=pubpdf-conversions,S3_REGION=us-east1,CORS_ALLOWED_ORIGINS=https://pubpdf.vercel.app" \
  --min-instances=1 \
  --max-instances=10 \
  --memory=512Mi \
  --cpu=1 \
  --timeout=60s \
  --allow-unauthenticated
```

The API URL will be displayed after deploy — note it for the Vercel `NEXT_PUBLIC_API_BASE_URL` env var.

---

## 6. Deploy Worker to Cloud Run

```bash
gcloud run deploy pubpdf-worker \
  --image=${REGISTRY}/worker:latest \
  --region=us-east1 \
  --platform=managed \
  --service-account=pubpdf-worker@<PROJECT>.iam.gserviceaccount.com \
  --vpc-connector=pubpdf-connector \
  --set-secrets="POSTGRES_URL=POSTGRES_URL:latest,REDIS_URL=REDIS_URL:latest,S3_ACCESS_KEY_ID=S3_ACCESS_KEY_ID:latest,S3_SECRET_ACCESS_KEY=S3_SECRET_ACCESS_KEY:latest" \
  --set-env-vars="NODE_ENV=production,S3_BUCKET_NAME=pubpdf-conversions,S3_REGION=us-east1,MAX_CONCURRENT_JOBS=2,CHROME_PATH=/usr/bin/chromium,PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium" \
  --no-allow-unauthenticated \
  --min-instances=0 \
  --max-instances=5 \
  --memory=2Gi \
  --cpu=2 \
  --timeout=600s
```

**Note:** The Worker is not publicly addressable — it polls Redis (BullMQ). The Cloud Run URL is only used for health checks from internal monitoring.

---

## 7. Deploy Web Dashboard to Vercel

```bash
cd packages/web
vercel --prod
```

Set these environment variables in the Vercel project settings:
| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_BASE_URL` | `https://pubpdf-api-xxxx-ue.a.run.app` |

---

## 8. Smoke Test

Once all services are deployed:

```bash
API_BASE_URL=https://pubpdf-api-xxxx-ue.a.run.app \
API_KEY=sk_prod-<your-key> \
SMOKE_EPUB=fixtures/sample.epub \
  node scripts/smoke-test.js
```

A successful run outputs: `PASS - full pipeline (API -> queue -> worker -> engines -> storage -> signed download) verified.`

---

## 9. Rollback

```bash
# List recent revisions
gcloud run revisions list --service=pubpdf-api --region=us-east1

# Rollback to a specific revision
gcloud run services update-traffic pubpdf-api \
  --region=us-east1 \
  --to-revisions=pubpdf-api-00005-xxx=100
```

---

## 10. Kubernetes (Alternative)

Kubernetes manifests are in `infra/k8s/`. Apply in order:
```bash
kubectl apply -f infra/k8s/00-namespace.yaml
kubectl apply -f infra/k8s/01-configmap.yaml
kubectl apply -f infra/k8s/02-secret.yaml   # populate with real values first
kubectl apply -f infra/k8s/10-api.yaml
kubectl apply -f infra/k8s/20-worker.yaml
kubectl apply -f infra/k8s/30-web.yaml
kubectl apply -f infra/k8s/40-ingress.yaml
```

See `infra/k8s/02-secret.yaml` for all required secret keys.
