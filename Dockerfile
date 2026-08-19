# syntax=docker/dockerfile:1

# ---- Builder: full dependency install + build --------------------------------
# `npm run build` is `react-router build`, which invokes vite — and vite is a
# devDependency. So the build MUST run with dev deps present; a prod-only install
# here fails with "vite: not found". Prisma generate mirrors the CI build step.
FROM node:24-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV=development

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npx prisma generate
RUN npm run build

# ---- Runtime: production deps + build artifacts only -------------------------
# react-router-serve serves the compiled bundle in build/; the app source is not
# needed at runtime. docker-start runs `prisma generate && prisma migrate deploy`
# before boot, so the schema + migrations must be present (prisma CLI and
# @prisma/client are production dependencies).
FROM node:24-alpine
RUN apk add --no-cache openssl
WORKDIR /app

ENV NODE_ENV=production

EXPOSE 3000

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=builder /app/build ./build
COPY prisma ./prisma

CMD ["npm", "run", "docker-start"]
