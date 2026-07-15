FROM node:22-alpine

WORKDIR /app

ENV NODE_ENV=production \
    PORT=3000

COPY .npmrc package*.json ./

RUN npm ci --omit=dev --no-audit --no-fund --ignore-scripts \
    && npm cache clean --force

COPY --chown=node:node dist ./dist

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health || exit 1

CMD ["node", "dist/server.js"]
