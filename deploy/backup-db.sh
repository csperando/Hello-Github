#!/usr/bin/env bash
set -euo pipefail

compose_dir="/home/ec2-user"
backup_dir="/home/ec2-user/pg-backups"
mkdir -p "$backup_dir"

# cron doesn't load POSTGRES_USER/POSTGRES_DATABASE on its own - pull them from the same .env
# compose.yml uses.
set -a
source "$compose_dir/.env"
set +a

ts=$(date +%F_%H%M%S)
docker compose --project-directory "$compose_dir" exec -T db \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DATABASE" \
  | gzip > "$backup_dir/backup_${ts}.sql.gz"

find "$backup_dir" -name 'backup_*.sql.gz' -mtime +7 -delete
