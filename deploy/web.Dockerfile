# Builds the React app and serves it with Caddy, which also proxies /api, /files and /health to the API.
FROM node:24-alpine AS build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# '' = same origin: the browser calls /api/... on the same address that served the page
ARG REACT_APP_API_URL=
ENV REACT_APP_API_URL=$REACT_APP_API_URL
RUN npm run build

FROM caddy:2-alpine
COPY --from=build /app/build /srv
COPY deploy/Caddyfile /etc/caddy/Caddyfile
