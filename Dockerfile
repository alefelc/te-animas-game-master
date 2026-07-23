# syntax=docker/dockerfile:1.7
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

COPY source.tar.gz /tmp/source.tar.gz
RUN tar -xzf /tmp/source.tar.gz -C /app \
 && rm /tmp/source.tar.gz \
 && test -f /app/package.json \
 && test -f /app/package-lock.json \
 && test -f /app/release.json \
 && test -f /app/te-animas-game-master-main/package.json \
 && test -f /app/te-animas-game-master-main/tsconfig.json \
 && test -f /app/packages/contracts/tsconfig.json \
 && test -f /app/packages/game-domain/tsconfig.json

RUN npm ci --no-audit --no-fund
RUN npm run build:api && npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000
ARG BUILD_RELEASE=5.0.0-r3
LABEL org.opencontainers.image.title="¿Te animás? Game Master" \
      org.opencontainers.image.version=${BUILD_RELEASE}
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/packages/game-domain ./packages/game-domain
COPY --from=build /app/packages/contracts ./packages/contracts
COPY --from=build /app/te-animas-game-master-main/package.json ./te-animas-game-master-main/package.json
COPY --from=build /app/te-animas-game-master-main/dist ./te-animas-game-master-main/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=4s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "te-animas-game-master-main/dist/server.js"]
