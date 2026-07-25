
# verify with .env
# REST_PORT := 3000
# VUE_PORT := 5176

.PHONY: prep dev api-dev api-test api-install vue-dev vue-install db-init

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
