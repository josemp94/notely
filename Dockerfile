# ---- deps ----
FROM node:22-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# ---- build ----
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# URL pública del servidor de edición simultánea. Las variables NEXT_PUBLIC_ se
# incrustan al compilar, así que tiene que llegar aquí, no solo al arrancar.
ARG NEXT_PUBLIC_COLLAB_URL=""
ENV NEXT_PUBLIC_COLLAB_URL=$NEXT_PUBLIC_COLLAB_URL
RUN npx prisma generate && npm run build

# ---- dependencias de producción ----
# El servidor propio (server.mjs) no puede usar el modo standalone de Next —la
# documentación de Next dice que son incompatibles—, así que el runner necesita
# node_modules de verdad, pero solo los de producción.
FROM node:22-slim AS prod-deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci --omit=dev && npx prisma generate

# ---- runner ----
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates curl && rm -rf /var/lib/apt/lists/*
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/collab/dist ./collab/dist
COPY --from=build /app/prisma ./prisma
COPY package.json next.config.ts server.mjs ./
EXPOSE 3000
# Sirve la web y, en el mismo puerto, la edición simultánea bajo /collab.
CMD ["node","server.mjs"]
