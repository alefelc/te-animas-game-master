# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

COPY package.json package-lock.json ./
COPY packages/game-domain/package.json packages/game-domain/tsconfig.json ./packages/game-domain/
COPY packages/contracts/package.json packages/contracts/tsconfig.json ./packages/contracts/
COPY te-animas-game-master-main/package.json te-animas-game-master-main/tsconfig.json ./te-animas-game-master-main/
RUN npm ci --no-audit --no-fund

COPY packages/game-domain/src ./packages/game-domain/src
COPY packages/contracts/src ./packages/contracts/src
COPY te-animas-game-master-main/src ./te-animas-game-master-main/src
RUN npm run build:api && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ARG BUILD_RELEASE=5.0.1-r2
LABEL org.opencontainers.image.title="¿Te animás? Game Master" \
      org.opencontainers.image.version=${BUILD_RELEASE}
ENV NODE_ENV=production \
    PORT=3000 \
    BUILD_RELEASE=${BUILD_RELEASE}

COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/packages/game-domain/package.json ./packages/game-domain/package.json
COPY --from=build --chown=node:node /app/packages/game-domain/dist ./packages/game-domain/dist
COPY --from=build --chown=node:node /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build --chown=node:node /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build --chown=node:node /app/te-animas-game-master-main/package.json ./te-animas-game-master-main/package.json
COPY --from=build --chown=node:node /app/te-animas-game-master-main/dist ./te-animas-game-master-main/dist

USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=4s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "te-animas-game-master-main/dist/server.js"]
