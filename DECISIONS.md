# DECISIONS.md

Notes on the choices I made while building CampaignHub, the problem that cost me the most time, and what I'd do with another week.

## Three key technical decisions

### 1. Keep the workflow rules in pure functions, and let the API tell the UI what's allowed

The transition table (`ALLOWED_TRANSITIONS`) and the "who may do this" checks (`assertActorMayTransition`) live in `backend/src/posts/workflow.ts` with no database or Nest dependencies. The same goes for the 2-hour rule in `scheduling.ts`. The service calls them inside a transaction, and the unit tests exercise every one of the 36 possible from→to pairs plus every actor/role combination without spinning up a database.

The second half of that decision: every post the API returns carries a `permissions` object (`canEdit`, `transitions[]`) computed by running those same functions for the current user. The frontend renders exactly the buttons it's told to and never re-implements a rule. That's why a reviewer looking at their own post sees "You can't review your own post" instead of an Approve button, and why adding a rule later is a one-place change.

**Rejected:** a state-machine library (XState) – heavier than a 6-row table and would have hidden the rules from the reader. Also rejected: duplicating the rules in the frontend for "instant" feedback – it drifts, and the backend is the only place that matters anyway; the UI still gets instant feedback because it already knows the allowed moves.

### 2. Prisma + a conditional `updateMany` for optimistic locking (instead of a read-compare-write)

The brief's rules need real transactions with a Postgres advisory lock inside them. Prisma's interactive transactions (`prisma.$transaction(async (tx) => …)`) cover that: the lock is a one-line `tx.$executeRaw` and the version check is a conditional update:

```ts
tx.post.updateMany({ where: { id, version }, data: { ...changes, version: { increment: 1 } } })
// UPDATE posts SET ..., version = version + 1 WHERE id = $1 AND version = $2
```

If `count === 0`, someone else got there first and the API answers `409 VERSION_CONFLICT` with the current version. There is no read-then-compare-then-write window, so two people cannot overwrite each other even under concurrent requests.

**Rejected:** loading the row, comparing `version` in code and then calling `update()` – that leaves a window between the read and the write. I wanted the client's `version` from the request body to be the thing compared, and a response that tells the UI what the current version is so it can offer "Load latest" or "Keep mine and retry". Also rejected: pessimistic `SELECT … FOR UPDATE` – it blocks instead of failing fast and doesn't help across two browser tabs, which is the actual scenario.

### 3. Socket.IO rooms scoped by client for notifications (instead of SSE or polling)

Real-time was a bonus, but it shaped the design early: the reviewer-visibility rule ("a reviewer can only see posts for clients assigned to them") has to hold for notifications too, otherwise a reviewer would get toasts about brands they aren't allowed to see. So the gateway authenticates the socket with the same JWT, puts admins/creators in a `staff` room and puts each reviewer only in `client:<id>` rooms for their assignments. The service emits to `[staff, client:<id>]` and the room membership does the filtering.

**Rejected:** SSE – simpler protocol, but I'd still have had to implement the per-user filtering by hand, and Socket.IO's rooms gave me that for free plus reconnection. Rejected: polling every N seconds – wasteful and the "publisher moved your post to PUBLISHED" moment would arrive late.

Smaller decisions worth a line each:

- **Times**: stored as `timestamptz` (UTC), formatted in the browser with `Intl.DateTimeFormat(..., { timeZone: 'Asia/Kolkata' })`, so the display is IST regardless of the viewer's machine. The date-time input is interpreted as IST wall-clock (`+05:30`) and converted to UTC before it's sent.
- **Caption length** is counted by Unicode code point (`Array.from(str).length`) on both ends, so `🚀` is 1 character, not 2. The same function is used by the live counter and the server validator.
- **Publisher job** uses `UPDATE … WHERE status = 'SCHEDULED'`, so running two API replicas can't publish a post twice, and each publish writes its own audit row with `actor = null` ("System").
- **Plain CSS** in the frontend instead of Tailwind/MUI: fewer moving parts to review, and the design system fits in one file.

## A problem I hit and how I solved it

**The scheduling-conflict check passed for both of two simultaneous requests.**

My first version was the obvious one: query the posts for the same client + platform within ±2 hours, and if the list is empty, insert. It worked in every manual test. Then I wrote the e2e test that fires two `POST /posts` with the same `scheduledAt` at the same time with `Promise.all`, and both came back `201`. Both requests ran their SELECT before either INSERT was visible, so both saw an empty list. Under `READ COMMITTED` a plain transaction doesn't protect you from this – it's a classic write skew.

I considered three fixes:

1. A database constraint – there's no simple unique index for "no two rows within 2 hours of each other". A Postgres `EXCLUDE USING gist` on a `tstzrange` could do it, but it needs the `btree_gist` extension for the equality parts (client, platform), and the error message that comes back is unfriendly and doesn't contain the conflicting post's id, which the brief requires.
2. `SERIALIZABLE` isolation – correct, but you have to retry the whole transaction on serialization failures, and you lose the friendly error unless you re-run the check.
3. A **transaction-scoped advisory lock** keyed on `(clientId, platform)`: `SELECT pg_advisory_xact_lock(hashtext('schedule:<client>:<platform>'))` at the start of the check. The second request waits until the first commits, then re-runs the SELECT and sees the new row, so it gets the proper `409` with `conflictingPostId`.

I went with (3). It's two lines, it only serialises writes for the same client + platform (posts for different brands don't wait on each other), and the lock disappears when the transaction ends, so nothing is left behind if the request crashes. The e2e test `serialises concurrent scheduling so only one of two clashing requests wins` now asserts `[201, 409]`.

A smaller one: the generated TypeORM migration failed on first run with `type "post_status" already exists`. Both `posts.status` and `audit_logs.from_status/to_status` share the `post_status` enum, and the generator emitted a `CREATE TYPE` for each table that uses it (and a matching duplicate `DROP TYPE` in `down`). I removed the duplicates by hand and verified the migration both ways with `migration:run` → `migration:revert` → `migration:run` before moving on.

## What I would improve with one more week

1. **Reviewer-side scheduling awareness** – show a "slot taken" hint in the editor as you pick a time (query `/posts?clientId&platform&from&to`) instead of only finding out on save.
2. **Post revisions** – keep a snapshot of the caption on every edit so a reviewer can diff what changed after "changes requested" rather than reading the whole caption again.
3. **Refresh tokens and logout-everywhere** – today the access token lives 8 hours in `localStorage`; I'd move to short-lived access tokens with an httpOnly refresh cookie.
4. **Media attachments** – posts are caption-only. Uploading images/videos to S3 with signed URLs and a per-platform aspect-ratio check would make the preview real.
5. **Frontend tests** – component tests for the editor counter and the transition dialog, and a Playwright suite for the drag-and-drop and error banners (I used a throwaway Playwright script during development to check them, but it isn't part of the repo).
6. **Deployment** – the Docker images are ready; I'd put the API behind Nginx on an EC2 instance in ap-south-1 with RDS Postgres, run the publisher on a single instance (`PUBLISHER_ENABLED=false` on the others) or move it to a small worker, and host the Next.js app on the same box or on Vercel with `NEXT_PUBLIC_*` pointed at the API.
7. **Observability** – request logging with correlation ids, and a `/metrics` endpoint counting transitions and publisher runs.
