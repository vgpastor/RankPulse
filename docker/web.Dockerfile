# BACKLOG #16 — multi-stage Docker image for the Vite SPA.
# Builder produces apps/web/dist/, runtime is plain nginx serving the
# static assets. SPA routes fall back to /index.html so React Router
# handles client-side navigation.

FROM node:24.10.0-alpine AS builder
WORKDIR /app
RUN npm install -g pnpm@10.33.2

ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json turbo.json tsconfig.base.json ./
COPY apps ./apps
COPY packages ./packages

RUN pnpm install --frozen-lockfile
RUN pnpm --filter @rankpulse/web build

# ---------- runtime ----------
FROM nginx:1.27-alpine AS runtime

# History API fallback for the SPA + far-future caching for hashed
# asset filenames produced by Vite (`assets/index-<hash>.js`).
RUN printf 'server {\n\
\tlisten 80;\n\
\troot /usr/share/nginx/html;\n\
\tlocation / {\n\
\t\ttry_files $uri $uri/ /index.html;\n\
\t}\n\
\tlocation ~* \\.(?:css|js|woff2?|svg|png|jpg|jpeg|gif|ico)$ {\n\
\t\texpires 30d;\n\
\t\tadd_header Cache-Control "public, immutable";\n\
\t}\n\
}\n' > /etc/nginx/conf.d/default.conf

COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s --retries=3 \
	CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1
CMD ["nginx", "-g", "daemon off;"]
