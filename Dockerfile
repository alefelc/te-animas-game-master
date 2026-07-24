# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build
WORKDIR /app

ENV NPM_CONFIG_AUDIT=false \
    NPM_CONFIG_FUND=false \
    NPM_CONFIG_UPDATE_NOTIFIER=false

# Copy manifests first so dependency installation remains cacheable.
COPY package.json package-lock.json .npmrc ./
COPY packages/game-domain/package.json packages/game-domain/tsconfig.json ./packages/game-domain/
COPY packages/contracts/package.json packages/contracts/tsconfig.json ./packages/contracts/
RUN npm ci --no-audit --no-fund

# The API lives at repository root; shared packages are local workspaces.
COPY tsconfig.json ./
COPY src ./src
COPY packages/game-domain/src ./packages/game-domain/src
COPY packages/contracts/src ./packages/contracts/src
RUN npm run build \
 && npm prune --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000 \
    NODE_OPTIONS=--enable-source-maps

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/dist ./dist
COPY --from=build /app/packages/game-domain/package.json ./packages/game-domain/package.json
COPY --from=build /app/packages/game-domain/dist ./packages/game-domain/dist
COPY --from=build /app/packages/contracts/package.json ./packages/contracts/package.json
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist

USER node
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=4s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
