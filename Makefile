
# verify with .env
# REST_PORT := 3000
# VUE_PORT := 5176

.PHONY: prep dev api-dev api-test api-install vue-dev vue-install db-init db-promote-admin stripe-listen

prep: api-install vue-install

dev:
	trap 'kill 0' EXIT INT TERM; \
	cd api && npm run dev & \
	cd vue && npm run dev & \
	wait

# API
api-dev:
	cd api && npm run dev

api-test:
	cd api && npm run test

api-install:
	cd api && npm install

# VUE
vue-dev:
	cd vue && npm run dev

vue-install:
	cd vue && npm install

# DB
db-init:
	PGPASSWORD=$(POSTGRES_PASSWORD) psql -h $(POSTGRES_HOST) -p $(POSTGRES_PORT) -U $(POSTGRES_USER) -d $(POSTGRES_DATABASE) -f db/init.sql

# promote an existing user (must have logged in via GitHub at least once) to admin
# usage: make db-promote-admin GH_USER=<github_username>
db-promote-admin:
	PGPASSWORD=$(POSTGRES_PASSWORD) psql -h $(POSTGRES_HOST) -p $(POSTGRES_PORT) -U $(POSTGRES_USER) -d $(POSTGRES_DATABASE) -c "UPDATE users SET role = 'admin' WHERE github_username = '$(GH_USER)';"

# STRIPE
# forward test-mode webhooks to the local API (run `stripe login` once first);
# copy the printed whsec_... into .env as STRIPE_WEBHOOK_SECRET and restart the API
# keep STRIPE_EVENTS in sync with PaymentsService.handleWebhookEvent
STRIPE_EVENTS := payment_intent.succeeded,invoice.paid,customer.subscription.updated,customer.subscription.deleted,charge.refunded,charge.dispute.created

stripe-listen:
	stripe listen --events $(STRIPE_EVENTS) --forward-to localhost:$(or $(REST_PORT),3000)/payments/webhook
