# ---- build stage
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma
RUN npm ci
COPY tsconfig*.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- runtime stage
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
COPY prisma ./prisma
# postinstall runs `prisma generate`, so the client matches prisma/schema.prisma.
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
EXPOSE 4000
# Pending migrations are applied on boot; Prisma takes a lock so replicas don't race.
CMD ["sh", "-c", "npx prisma migrate deploy && exec node dist/main.js"]
