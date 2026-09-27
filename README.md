# CampaignHub – Social Media Content Approval System

A full-stack app for media agencies that create social posts for several client brands. Every post moves through an enforced approval workflow (draft → review → approval → scheduling → auto-publish) with role-based access, optimistic locking, scheduling-conflict checks, comments, an audit trail and real-time notifications.

| Layer    | Stack                                                                 |
| -------- | --------------------------------------------------------------------- |
| Backend  | NestJS 11 · TypeScript · Prisma 6 · PostgreSQL 16 · JWT + bcrypt · Socket.IO · Swagger |
| Frontend | Next.js 16.3.6 (App Router) · React 19 · TypeScript · socket.io-client · plain CSS |
| Tests    | Jest (unit) · Jest + Supertest against a real Postgres (e2e)          |
| Infra    | Docker Compose (db + api + seed + web)                                 |

---

## 1. Quick start

### Option A – Docker Compose (nothing to install except Docker)

```bash
docker compose up --build
```

- Web app → http://localhost:3000
- API → http://localhost:4000/api
- Swagger docs → http://localhost:4000/api/docs

The `seed` service runs once, applies migrations and loads the demo data (see §4). Re-run it any time with `docker compose run --rm seed`.

### Option B – run locally

Prerequisites: Node 20+ (tested on 22), PostgreSQL 14+ (tested on 16).

```bash
# 1. Database
createdb campaignhub            # or: psql -c "CREATE DATABASE campaignhub"

# 2. Backend
cd backend
cp .env.example .env            # edit DATABASE_URL / JWT_SECRET if needed
npm install                     # also runs `prisma generate`
npm run migrate:deploy          # creates the schema (prisma migrate deploy)
npm run seed                    # loads demo users / clients / posts
npm run start:dev               # API on http://localhost:4000/api

From the repo root there are shortcuts: `npm run install:all`, `npm run migrate`, `npm run seed`, `npm run dev:api`, `npm run dev:web`, `npm test`, `npm run test:e2e`.

---

## 2. Environment variables

### `backend/.env`

| Variable            | Default                                                  | Purpose |
| ------------------- | -------------------------------------------------------- | ------- |
| `DATABASE_URL`      | `postgres://postgres:postgres@localhost:5432/campaignhub` | PostgreSQL connection string |
| `JWT_SECRET`        | *(required)*                                             | Secret used to sign access tokens |
| `JWT_EXPIRES_IN`    | `8h`                                                     | Token lifetime |
| `PORT`              | `4000`                                                   | HTTP port |
| `CORS_ORIGIN`       | `http://localhost:3000`                                  | Comma-separated allowed browser origins |
| `PUBLISHER_ENABLED` | `true`                                                   | Set `false` to switch off the every-minute publisher job on an instance |
