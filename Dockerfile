# ---- Stage 1: build the frontend ----
FROM node:22-alpine AS client-build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Stage 2: runtime (API server + static SPA) ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server ./server
COPY database ./database
COPY --from=client-build /app/dist ./dist

EXPOSE 3001

# Fail fast if JWT_SECRET is missing (enforced by ensureJwtSecret in prod too)
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:3001/api/health || exit 1

CMD ["node", "server/index.mjs"]
