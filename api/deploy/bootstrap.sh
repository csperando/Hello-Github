#!/usr/bin/env bash
# One-time setup for the commitment_ API on a blank Amazon Linux 2023 EC2
# instance, running the API as a Docker container pulled from ECR.
#
# This is NOT run by CI. Run it once, by hand:
#   scp -r api/deploy ec2-user@<host>:~/deploy-tmp
#   ssh ec2-user@<host> 'bash ~/deploy-tmp/bootstrap.sh'
#
# The host itself needs no Node.js, no git, no clone of the repo -- the app
# only ever exists here as a pulled Docker image. After this completes,
# .github/workflows/api.yml handles every subsequent deploy: build+push the
# image in CI, then `docker pull` + restart here.
#
# Fill these in before running:
AWS_ACCOUNT_ID="REPLACE_ME"      # e.g. 123456789012
AWS_REGION="REPLACE_ME"          # e.g. us-east-1
ECR_REPO="commitment-api"

set -euo pipefail

if [ "$AWS_ACCOUNT_ID" = "REPLACE_ME" ] || [ "$AWS_REGION" = "REPLACE_ME" ]; then
  echo "Edit AWS_ACCOUNT_ID and AWS_REGION at the top of this script first." >&2
  exit 1
fi

ECR_IMAGE="$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/$ECR_REPO"
APP_DIR="$HOME/commitment-api"
SERVICE_NAME="commitment-api"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Installing system packages (docker, nginx, certbot)"
sudo dnf update -y
sudo dnf install -y docker nginx certbot python3-certbot-nginx
sudo systemctl enable --now docker

echo "==> Checking for AWS CLI (usually preinstalled on AL2023 -- installing if missing)"
if ! command -v aws >/dev/null 2>&1; then
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
  (cd /tmp && unzip -q awscliv2.zip && sudo ./aws/install)
fi

echo "==> This instance needs an IAM role with ECR pull access attached --"
echo "    this script can't do that part (needs AWS console/CLI access outside"
echo "    the instance). See api/deploy/README.md if it isn't attached yet."
echo "    Verifying now:"
if ! aws sts get-caller-identity >/dev/null 2>&1; then
  echo "    WARNING: no AWS credentials available via the instance metadata"
  echo "    service. Attach the IAM instance profile before continuing, or"
  echo "    'docker pull' below will fail." >&2
fi

mkdir -p "$APP_DIR"

echo "==> Setting up production .env"
if [ ! -f "$APP_DIR/.env" ]; then
  touch "$APP_DIR/.env"
  echo "    Created empty $APP_DIR/.env -- FILL IT IN NOW with real production"
  echo "    values (every var api/config/config.ts asserts on: DB credentials,"
  echo "    GITHUB_CLIENT_ID/SECRET, GITHUB_TOKEN_ENCRYPTION_KEY, etc. once that"
  echo "    work lands). This is passed to the container via --env-file, not"
  echo "    baked into the image."
fi

echo "==> Logging in to ECR and pulling the image for the first time"
aws ecr get-login-password --region "$AWS_REGION" | sudo docker login --username AWS --password-stdin "$AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com"
sudo docker pull "$ECR_IMAGE:latest" || echo "    (pull failed -- fine if nothing's been pushed to ECR yet; CI will push before the first real deploy)"

echo "==> Installing systemd service"
sed "s|__ECR_IMAGE__|$ECR_IMAGE|" "$SCRIPT_DIR/commitment-api.service" | sudo tee /etc/systemd/system/"$SERVICE_NAME".service >/dev/null
sudo systemctl daemon-reload
sudo systemctl enable "$SERVICE_NAME"
echo "    Not starting yet -- start it manually once .env is filled in and an"
echo "    image has been pushed to ECR:"
echo "      sudo systemctl start $SERVICE_NAME"

echo "==> Installing nginx reverse proxy config"
sudo cp "$SCRIPT_DIR/nginx-api.conf" /etc/nginx/conf.d/commitment-api.conf
sudo systemctl enable --now nginx

cat <<EOF

==> Remaining manual steps:
  1. Confirm an IAM instance profile with ECR pull access (e.g. the
     AmazonEC2ContainerRegistryReadOnly managed policy) is attached to this
     instance -- see api/deploy/README.md.
  2. Edit $APP_DIR/.env with real production secrets.
  3. Push a first image to ECR from CI (or manually: docker build, tag as
     $ECR_IMAGE:latest, docker push) before starting the service.
  4. sudo systemctl start $SERVICE_NAME
  5. Point an A record for api.commitsforgood.com at this instance's public IP.
  6. Once DNS resolves: sudo certbot --nginx -d api.commitsforgood.com
  7. Set up the CI -> EC2 SSH key and the GitHub Actions secrets listed in
     api/deploy/README.md (EC2_HOST, EC2_SSH_USER, EC2_SSH_KEY, AWS creds).
EOF
