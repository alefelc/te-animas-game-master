FROM node:22-alpine AS build
WORKDIR /app

ENV NPM_CONFIG_REGISTRY=https://registry.npmjs.org/ \
    NPM_CONFIG_FETCH_RETRIES=5 \
    NPM_CONFIG_FETCH_RETRY_MINTIMEOUT=20000 \
    NPM_CONFIG_FETCH_RETRY_MAXTIMEOUT=120000

COPY package*.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json ./
# La API usa solo los fuentes TypeScript planos de src/. Esto evita que
# restos de un frontend antiguo dentro de subcarpetas entren al build.
COPY src/*.ts ./src/
RUN npm run build \
    && npm prune --omit=dev \
    && npm cache clean --force

FROM node:22-alpine AS runtime
LABEL org.opencontainers.image.title="te-animas-adaptive-api" \
      org.opencontainers.image.version="1.8.2"
WORKDIR /app
ENV NODE_ENV=production

COPY --from=build --chown=node:node /app/package*.json ./
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1
CMD ["node", "dist/server.js"]
