#!/usr/bin/env bash
set -euo pipefail
PROJECT=minmaxdeals-crm-email
REGION=us-east1
ACCOUNT=front-app-publisher@minmaxdeals-crm-email.iam.gserviceaccount.com
IMAGE=us-east1-docker.pkg.dev/minmaxdeals-crm-email/front-app-publisher/publisher:v1
cd -- "$(dirname -- "$0")"
if ! gcloud iam service-accounts describe "$ACCOUNT" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud iam service-accounts create front-app-publisher --display-name=Front-App-Publisher --project="$PROJECT"
fi
for item in front-sftp-host front-sftp-port front-sftp-username front-sftp-password; do
  gcloud secrets add-iam-policy-binding "$item" --project="$PROJECT" --member="serviceAccount:$ACCOUNT" --role=roles/secretmanager.secretAccessor --condition=None --quiet >/dev/null
done
if ! gcloud artifacts repositories describe front-app-publisher --location="$REGION" --project="$PROJECT" >/dev/null 2>&1; then
  gcloud artifacts repositories create front-app-publisher --repository-format=docker --location="$REGION" --project="$PROJECT"
fi
gcloud builds submit --tag="$IMAGE" --project="$PROJECT" --quiet
gcloud run jobs deploy front-app-publisher --image="$IMAGE" --service-account="$ACCOUNT" --region="$REGION" --project="$PROJECT" --tasks=1 --parallelism=1 --max-retries=0 --task-timeout=180s --cpu=1 --memory=512Mi --set-env-vars=ACTION=probe --set-secrets=SFTP_HOST=front-sftp-host:latest,SFTP_PORT=front-sftp-port:latest,SFTP_USERNAME=front-sftp-username:latest,SFTP_PASSWORD=front-sftp-password:latest --quiet
gcloud run jobs execute front-app-publisher --region="$REGION" --project="$PROJECT" --wait
