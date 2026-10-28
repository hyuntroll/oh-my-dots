FROM node:24.22.1-bookworm-slim@sha256:be8204d4bd327363357f532187b752ff62759c31bedf98e9e18fc08c9cbd605c
WORKDIR /app
RUN npm install -g --registry=https://registry.npmjs.org @opencode/cli@2.0.32 && npm cache clean --force
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run original:verify && npm run assets:verify && npm run build
ENV NODE_ENV=production DOTS_SERVICE_CONFIG=/data/config.json
ENV XDG_DATA_HOME=/tmp/ohmydots/data XDG_CONFIG_HOME=/tmp/ohmydots/config XDG_CACHE_HOME=/tmp/ohmydots/cache XDG_STATE_HOME=/tmp/ohmydots/state
EXPOSE 3420
CMD ["node", "server/service.mjs"]
