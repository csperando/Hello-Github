# Deploying the API to EC2 (Docker + ECR)

The API ships as a Docker image, built and pushed to Amazon ECR by CI, and
pulled + run on a blank Amazon Linux 2023 EC2 instance. The host itself never
needs Node.js, git, or a clone of the repo — the app only ever exists there
as a pulled image.

## 1. One-time AWS setup (console or CLI — not run by any script)

1. **Create the ECR repository**:
   ```
   aws ecr create-repository --repository-name commitment-api --region <region>
   ```
2. **IAM user for CI to push images** — a policy scoped to just this repo:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [{
       "Effect": "Allow",
       "Action": [
         "ecr:GetAuthorizationToken"
       ],
       "Resource": "*"
     }, {
       "Effect": "Allow",
       "Action": [
         "ecr:BatchCheckLayerAvailability",
         "ecr:GetDownloadUrlForLayer",
         "ecr:BatchGetImage",
         "ecr:PutImage",
         "ecr:InitiateLayerUpload",
         "ecr:UploadLayerPart",
         "ecr:CompleteLayerUpload"
       ],
       "Resource": "arn:aws:ecr:<region>:<account-id>:repository/commitment-api"
     }]
   }
   ```
   Generate an access key pair for this user — goes into GitHub secrets (below).
3. **IAM role for the EC2 instance to pull images** — no static credentials on
   the box at all, it authenticates via the instance's own role:
   - Create a role with the AWS-managed `AmazonEC2ContainerRegistryReadOnly`
     policy attached.
   - Attach it to the instance as an instance profile (EC2 console → instance
     → Actions → Security → Modify IAM role, or `aws ec2
     associate-iam-instance-profile`).

## 2. One-time instance bootstrap

Edit `AWS_ACCOUNT_ID` and `AWS_REGION` at the top of `bootstrap.sh`, then:

```
scp -r api/deploy ec2-user@<host>:~/deploy-tmp
ssh ec2-user@<host> 'bash ~/deploy-tmp/bootstrap.sh'
```

This installs Docker, nginx, and certbot (and the AWS CLI if AL2023's base
image doesn't already have it); logs in to ECR and does a first `docker
pull` (harmless no-op if nothing's been pushed yet); installs the systemd
service (`commitment-api`, which runs `docker run` under the hood — see
`commitment-api.service` — not started yet); and installs the nginx
reverse-proxy config.

It prints the remaining manual steps at the end:

1. Confirm the IAM instance profile from step 1.3 above is actually attached.
2. Create `~/commitment-api/.env` with real production secrets (every var
   `api/config/config.ts` asserts on). This is passed to the container via
   `docker run --env-file`, **not** baked into the image — the image never
   contains secrets, `.dockerignore` excludes `.env` from the build context.
3. Push a first image (via CI, or manually: `docker build -t
   <account>.dkr.ecr.<region>.amazonaws.com/commitment-api:latest api` +
   `docker push`).
4. `sudo systemctl start commitment-api`
5. Point an A record for `api.commitsforgood.com` at the instance's public IP.
6. Once DNS resolves: `sudo certbot --nginx -d api.commitsforgood.com` (adds
   TLS, rewrites `nginx-api.conf` in place). This matters beyond "nice to
   have" — the session cookie design in `.claude/plan.md` requires `Secure`,
   which needs real HTTPS in production.
7. Generate a dedicated **CI → EC2 SSH key** (separate from anything AWS —
   this is just for the GitHub Actions deploy job to log in and run
   `systemctl restart`):
   ```
   ssh-keygen -t ed25519 -f deploy_key -C "github-actions-deploy" -N ""
   ```
   Add `deploy_key.pub` to the instance's `~/.ssh/authorized_keys`. Add the
   *private* half as a GitHub Actions secret (below).

## 3. GitHub Actions secrets

Repo Settings → Secrets and variables → Actions:

| Secret | Value |
|---|---|
| `AWS_ACCESS_KEY_ID` | From the IAM push user in step 1.2 |
| `AWS_SECRET_ACCESS_KEY` | From the IAM push user in step 1.2 |
| `AWS_REGION` | e.g. `us-east-1` |
| `EC2_HOST` | Instance's public IP or DNS name |
| `EC2_SSH_USER` | `ec2-user` |
| `EC2_SSH_KEY` | The private half of the CI → EC2 SSH key from step 2.7 |

`secrets.token` (used for `actions/checkout`) should already exist from the
`vue.yml` workflow this pattern was copied from.

## 4. What the pipeline does

`.github/workflows/api.yml`, on every push to `main` touching `api/**`:

- **`test`** (GitHub-hosted runner): `npm ci`, `npm test`, `npm run build`
  (native, not containerized — fast fail-fast check before the heavier
  Docker build). Nothing downstream runs if this fails.
- **`build-and-push`**: `docker build` from `api/Dockerfile`, tags the image
  both `:${{ github.sha }}` (history/manual-rollback target) and `:latest`
  (what actually gets deployed), pushes both to ECR.
- **`deploy`**: SSHes into the EC2 instance, logs in to ECR using the
  instance's own IAM role (not GitHub's AWS credentials — those aren't
  available inside the SSH session), `docker pull ...:latest`,
  `systemctl restart commitment-api`.

**Deliberately not automated**: database migrations. Once `node-pg-migrate`
lands (see `.claude/plan.md`), applying it stays a manual/`workflow_dispatch`-
gated step, not a side effect of every push. Since the host no longer has
Node/npm installed, running it would look like a one-off container instead of
a bare `npm run migrate:up`:
```
docker run --rm --env-file ~/commitment-api/.env <image>:latest npm run migrate:up
```

## Notes / things to sanity-check before relying on this

- **Rollback**: `:${{ github.sha }}` tags exist in ECR for this reason, but
  nothing automates rolling back to one — it'd be a manual `docker pull
  <image>:<old-sha>`, retag as `:latest`, `systemctl restart`. Fine for now,
  worth automating if rollbacks become a regular need.
- **`sudo docker`/`sudo systemctl restart` from the SSH deploy script**
  assumes `ec2-user` has passwordless sudo, which is the AL2023 default —
  worth confirming rather than assuming if the instance's sudoers config has
  been touched.
- **`appleboy/ssh-action@v1.0.3`** and **`aws-actions/*`** are third-party
  actions pinned to version tags, not commit SHAs. Fine to start, but pinning
  to specific commit SHAs is a cheap supply-chain hardening step worth doing
  once this is working.
