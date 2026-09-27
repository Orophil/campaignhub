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

### `frontend/.env.local`

| Variable                 | Default                     | Purpose |
| ------------------------ | --------------------------- | ------- |
| `NEXT_PUBLIC_API_URL`    | `http://localhost:4000/api` | REST base URL |
| `NEXT_PUBLIC_SOCKET_URL` | `http://localhost:4000`     | Socket.IO endpoint |

---

## 3. Tests

```bash
cd backend
npm test          # unit tests: status workflow, scheduling conflict rule, caption limits (88 tests)
npm run test:e2e  # end-to-end tests against a real database (13 tests)
```

The e2e suite refuses to run unless `DATABASE_URL` contains `test`, because it wipes the database:

```bash
createdb campaignhub_test
DATABASE_URL=postgres://postgres:postgres@localhost:5432/campaignhub_test npm run test:e2e
```

Unit tests live in `backend/test/*.spec.ts`; the pure rule modules they cover are `src/posts/workflow.ts`, `src/posts/scheduling.ts` and `src/common/caption-limits.ts`.

---

## 4. Seed data & login credentials

`npm run seed` (or the `seed` compose service) wipes the database and creates 1 admin, 2 creators, 2 reviewers, 3 clients and 18 posts (3 in every status), each with a realistic audit trail and comments. The login page also has one-click buttons for these accounts.

| Role     | Name         | Email                            | Password       |
| -------- | ------------ | -------------------------------- | -------------- |
| ADMIN    | Anita Rao    | `admin@campaignhub.dev`          | `Admin@123`    |
| CREATOR  | Priya Sharma | `priya.creator@campaignhub.dev`  | `Creator@123`  |
| CREATOR  | Arjun Mehta  | `arjun.creator@campaignhub.dev`  | `Creator@123`  |
| REVIEWER | Kavya Iyer   | `kavya.reviewer@campaignhub.dev` | `Reviewer@123` |
| REVIEWER | Rohan Das    | `rohan.reviewer@campaignhub.dev` | `Reviewer@123` |
---

## 5. Features completed

### Required

- [x] **Auth** – JWT (bcrypt-hashed passwords), global `JwtAuthGuard` + `RolesGuard`, `@Roles()` decorator; `/auth/login`, `/auth/me`.
- [x] **Roles** – ADMIN manages users/clients and reviewer assignments; CREATOR creates/edits/submits; REVIEWER approves or requests changes only for assigned clients.
- [x] **Entities** – User, Client (+ reviewers many-to-many), Post (with `version`), Comment, AuditLog; Prisma schema in `backend/prisma/schema.prisma`, migrations in `backend/prisma/migrations`.
- [x] **Status workflow enforced on the backend** – `DRAFT → IN_REVIEW → APPROVED → SCHEDULED → PUBLISHED`, `IN_REVIEW ⇄ CHANGES_REQUESTED`. Anything else → `400 { code: "INVALID_TRANSITION", message: "Invalid status transition: DRAFT → SCHEDULED. From DRAFT a post can only move to: IN_REVIEW." }`.
- [x] **Business rules**
  - Only the creator can edit, only while `DRAFT` / `CHANGES_REQUESTED` (`403` / `400 NOT_EDITABLE`).
  - Reviewers only see and act on posts of assigned clients (list is filtered, detail/actions return `403 NOT_ASSIGNED`).
  - Nobody can approve or review their own post (`403 SELF_REVIEW`) – checked before the role check, so it holds even for a reviewer-author.
  - Requesting changes needs a comment ≥ 10 characters (`400 COMMENT_REQUIRED`).
  - Caption limits per platform validated on the backend (X 280, Instagram 2,200, LinkedIn 3,000, Facebook 5,000), counted by Unicode code point so emoji count as 1 on both ends.
  - Scheduling conflict: same client + platform must be ≥ 2 h apart → `409 { code: "SCHEDULE_CONFLICT", conflictingPostId, conflictingScheduledAt }`. A Postgres advisory lock makes the check safe under concurrent requests (covered by an e2e test).
  - Scheduled time must be in the future (`400 SCHEDULE_IN_PAST`); stored as `timestamptz` (UTC), displayed in IST everywhere in the UI.
  - Optimistic locking: every `PATCH /posts/:id` and `POST /posts/:id/transition` must send `version`; a stale version → `409 { code: "VERSION_CONFLICT", currentVersion }`. Implemented as a conditional `UPDATE … WHERE version = ?`, not a read-then-write.
  - Every status change (including creation and the system's auto-publish) writes an `AuditLog` row in the same transaction.
  - Background job (`@nestjs/schedule`, every minute) marks due `SCHEDULED` posts `PUBLISHED`; idempotent across replicas.
- [x] **Frontend**
  - Login with one-click demo accounts; nav, buttons and board actions adapt to the role. The API returns `permissions` (`canEdit`, allowed `transitions`) with every post so the UI never guesses.
  - Kanban board: one column per status, filter by client and platform (persisted), "only mine" for creators, drag & drop between columns (valid targets highlighted; invalid drops show the API's 400 message).
  - Post editor with live per-platform character counter, progress meter, over-limit state, IST date-time picker, and a live platform-styled preview (hashtags, "see more" fold, Instagram/X/LinkedIn/Facebook layouts).
  - Post detail: facts, allowed actions, preview, comment thread, audit timeline (who / from → to / when in IST).
  - Clear error UI for `409` schedule conflicts (link to the conflicting post), `409` version conflicts ("Load latest" / "Keep my changes and retry"), `400` invalid transitions and validation errors.
  - Loading, empty and error states on every page; responsive layout down to phone width (collapsible nav, horizontally scrolling board, single-column calendar).
- [x] **Unit tests** for the transition table + permissions and the scheduling-conflict rule (plus caption limits).
- [x] **Seed script** with credentials listed above.

### Bonus

- [x] **Real-time notifications** – Socket.IO gateway authenticated with the JWT; admins/creators join a staff room, reviewers join only their clients' rooms. Status changes show a toast (with a link) for everyone else and silently refresh open boards/detail pages.
- [x] **Weekly calendar** of scheduled posts, per client (colour-coded), IST, prev/next week.
- [x] **Swagger** at `/api/docs` (with bearer auth persisted).
- [x] **Docker Compose** with db, api, seed and web services.
---

## 6. API overview

All routes are prefixed with `/api`, and all except `/auth/login` and `/health` require `Authorization: Bearer <token>`.

| Method | Path                    | Who               | Notes |
| ------ | ----------------------- | ----------------- | ----- |
| POST   | `/auth/login`           | public            | → `{ accessToken, user }` |
| GET    | `/auth/me`              | any               | |
| GET    | `/users?role=`          | ADMIN             | |
| POST   | `/users`                | ADMIN             | `{ name, email, password, role }` |
| GET    | `/clients`              | any               | reviewers get only their clients |
| POST   | `/clients`              | ADMIN             | `{ brandName, reviewerIds[] }` |
| PATCH  | `/clients/:id`          | ADMIN             | |
| PUT    | `/clients/:id/reviewers`| ADMIN             | `{ reviewerIds[] }` |
| GET    | `/posts?clientId&platform&status&from&to` | any | reviewers get only assigned clients; each post carries `permissions` |
| GET    | `/posts/:id`            | any (scoped)      | includes `comments`, `auditLogs`, `client.reviewers` |
| POST   | `/posts`                | CREATOR           | `{ clientId, platform, caption, scheduledAt? }` |
| PATCH  | `/posts/:id`            | CREATOR (owner)   | `{ version, caption?, platform?, clientId?, scheduledAt? }` |
| POST   | `/posts/:id/transition` | depends on target | `{ toStatus, version, comment?, scheduledAt? }` |
| POST   | `/posts/:id/comments`   | any (scoped)      | `{ message }` |
| GET    | `/health`               | public            | |

Error bodies always have `statusCode`, `message` and, for business rules, a stable `code` (`INVALID_TRANSITION`, `SELF_REVIEW`, `NOT_ASSIGNED`, `COMMENT_REQUIRED`, `CAPTION_TOO_LONG`, `SCHEDULE_CONFLICT`, `SCHEDULE_IN_PAST`, `VERSION_CONFLICT`, `NOT_EDITABLE`, …).

---

## 7. Project layout

```
backend/
  prisma/
    schema.prisma    data model (users, clients, client_reviewers, posts, comments, audit_logs)
    migrations/      SQL migrations (prisma migrate)
  src/
    common/          enums (re-exported from Prisma), caption limits
    database/        PrismaModule / PrismaService, seed.ts (demo data)
    modules/
      auth/          login, JWT strategy, guards, @Roles / @CurrentUser / @Public, dto/
      users/         admin user CRUD, dto/
      clients/       clients + reviewer assignment, dto/
      posts/
        domain/workflow.ts    transition table + who-may-do-what (pure, unit-tested)
        domain/scheduling.ts  2-hour conflict rule + future check (pure, unit-tested)
        posts.service.ts      transactions, optimistic locking, advisory lock, audit log
        publisher.service.ts  every-minute auto-publish job
        dto/
      events/        Socket.IO gateway
      health/        GET /api/health
  test/              unit specs + e2e/
frontend/
  src/app/           login, board, calendar, admin, posts/new, posts/[id], posts/[id]/edit
  src/components/    AppShell, PostEditor, PostPreview, TransitionDialog, Toasts, ui
  src/lib/           api client, auth context, socket context, time (IST) helpers, constants
docker-compose.yml
DECISIONS.md