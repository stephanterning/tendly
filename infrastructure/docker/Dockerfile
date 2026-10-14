FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
RUN npm install --global pnpm@11.25.0
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm build

FROM build AS api
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["pnpm", "--filter", "@tendly/api", "exec", "node", "dist/main.js"]

FROM build AS worker
ENV NODE_ENV=production
USER node
CMD ["pnpm", "--filter", "@tendly/worker", "exec", "node", "dist/main.js"]

FROM nginxinc/nginx-unprivileged:1.28-alpine AS web
COPY infrastructure/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
