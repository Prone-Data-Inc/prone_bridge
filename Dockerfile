# ProneBridge in one container: the API and the built web app on port 8000.
#   docker build -t pronebridge .
#   docker run --rm -p 8000:8000 --env-file .env pronebridge
# Vercel does not use this file. It is for running the project locally and for anyone who wants a container.

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8000 \
    SERVE_CLIENT=true
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY server ./server
COPY shared ./shared
COPY --from=build /app/client/dist ./client/dist
USER node
EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8000/api/health || exit 1
CMD ["node", "server/src/index.js"]
