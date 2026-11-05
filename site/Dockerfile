# Build stage: runs the release gate (sign-offs, tests, dependency audit) and the production build.
FROM node:24-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG SITE_URL
ARG ALLOW_UNREVIEWED=0
ENV SITE_URL=$SITE_URL ALLOW_UNREVIEWED=$ALLOW_UNREVIEWED
RUN npm run release

# Run stage: only what the server needs.
FROM node:24-slim
WORKDIR /app
ENV NODE_ENV=production DATABASE_PATH=/data/app.db PORT=8080
COPY package*.json ./
RUN npm ci --omit=dev
COPY server ./server
COPY security-headers.json ./
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 8080
CMD ["node", "server/index.mjs"]
