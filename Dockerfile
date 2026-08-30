FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

# A throwaway URL so `prisma generate` and `next build` never need a live
# database. Real values are injected at runtime via Fly secrets.
ENV DATABASE_URL="postgresql://build:build@localhost:5432/build"
ENV NEXT_TELEMETRY_DISABLED=1

# Release identity (UI-3): set by scripts/deploy.sh from git describe; the
# header version chip and /api/health render from these at runtime.
ARG APP_VERSION=dev
ARG APP_GIT_SHA=""
ENV APP_VERSION=$APP_VERSION
ENV APP_GIT_SHA=$APP_GIT_SHA

RUN npx prisma generate && npm run build

ENV NODE_ENV=production

EXPOSE 3000

# Production server. Database migrations run separately via the fly.toml
# release_command. docker compose overrides this command for local dev.
CMD ["npm", "run", "start"]
