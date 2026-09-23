# The demonstration image.
#
# Three stages so the thing that ships carries no compiler, no development
# dependency and no source: dependencies, build, then a runtime stage holding
# only Next's standalone output.
#
# It runs the demonstration composition, which reaches no external service. The
# container needs one Postgres and nothing else - not Odoo, not Meilisearch, not
# the OCR service, not the payment gateway. That is the whole reason this is
# deployable on hosting that costs nothing.

# ---- dependencies ----------------------------------------------------------
FROM node:26-alpine AS deps
WORKDIR /app
# Only the manifests, so this layer is rebuilt when dependencies change and not
# when a source file does.
COPY package.json package-lock.json ./
RUN npm ci

# ---- build -----------------------------------------------------------------
FROM node:26-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# The build reads the environment through the same parser the server does, and
# DEMO_MODE fills in the addresses of the services this build does not have.
ENV DEMO_MODE=true
ENV NEXT_TELEMETRY_DISABLED=1
# Next prerenders pages at build time, and the layout reads the environment, so
# the build needs a database URL that parses. It must never be one that
# connects: `.invalid` is reserved by RFC 2606 and cannot resolve, so a build
# step that tries to query the database fails here rather than silently reaching
# something. The real URL is supplied to the container at run time.
ENV PORTAL_DATABASE_URL=postgres://build:build@postgres.invalid:5432/build
RUN npm run build

# ---- runtime ---------------------------------------------------------------
FROM node:26-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV DEMO_MODE=true
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# A non-root user, created here rather than relying on the base image's `node`
# user existing with a usable home. A process that does not need to write
# outside its own directory should not be able to.
RUN addgroup --system --gid 1001 portal \
 && adduser --system --uid 1001 --ingroup portal portal

# The standalone output, plus the one directory it does not include: the built
# static assets. There is no `public/` in this project - every image the portal
# serves is under `.next/static` - so nothing is copied for it. A COPY of a
# directory that does not exist fails the build, which is how this was found.
COPY --from=build --chown=portal:portal /app/.next/standalone ./
COPY --from=build --chown=portal:portal /app/.next/static ./.next/static

# Migrations and the script that applies them. A demonstration host offers no
# convenient place to run them by hand, so the container runs them at start.
COPY --from=build --chown=portal:portal /app/db ./db
COPY --from=build --chown=portal:portal /app/scripts ./scripts
# `demo-account.mjs` imports `src/domain/password.ts` by relative path, and the
# standalone output carries no source. Node 26 strips the types natively, so the
# file is usable as it stands.
COPY --from=build --chown=portal:portal /app/src/domain ./src/domain

USER portal
EXPOSE 3000

# Migrate, create the demonstration account, then serve. If either step fails
# the container does not start, which is the correct order: a portal serving
# against a schema it does not have, or one nobody can sign in to, fails one
# visitor at a time instead of once, visibly, here.
CMD ["sh", "-c", "node scripts/migrate.mjs && node scripts/demo-account.mjs && node server.js"]
