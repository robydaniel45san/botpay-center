# ── Stage 1: Build React ──────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# ── Stage 2: Serve con Nginx ──────────────────────────
FROM nginx:alpine AS production

# Config de nginx para SPA (redirige todo a index.html)
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf

# Archivos compilados
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
