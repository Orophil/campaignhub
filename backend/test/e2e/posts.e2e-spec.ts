/**
 * End-to-end tests against a real PostgreSQL database.
 *   DATABASE_URL=postgres://postgres:postgres@localhost:5432/campaignhub_test npm run test:e2e
 * `test:e2e` applies migrations first; the database is wiped and re-seeded before the run.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PostStatus } from '../../src/common/enums';
import { runSeed } from '../../src/database/seed';
import { PublisherService } from '../../src/modules/posts/publisher.service';

process.env.JWT_SECRET ??= 'e2e-secret';
process.env.PUBLISHER_ENABLED = 'false';

describe('CampaignHub API (e2e)', () => {
  let app: INestApplication;
  const tokens: Record<string, string> = {};
  let clients: Record<string, string> = {};

  const api = () => request(app.getHttpServer());
  const as = (who: string) => ({ Authorization: `Bearer ${tokens[who]}` });
  const inHours = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

  async function createDraft(who = 'priya', body: Record<string, unknown> = {}) {
    const res = await api()
      .post('/api/posts')
      .set(as(who))
      .send({ clientId: clients['Masala Brew Co.'], platform: 'X', caption: 'An e2e test caption', ...body });
    expect(res.status).toBe(201);
    return res.body;
  }

  beforeAll(async () => {
    if (!/test/.test(process.env.DATABASE_URL ?? '')) {
      throw new Error('Refusing to run e2e tests: DATABASE_URL must point at a *_test database.');
    }
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    const seedClient = new PrismaClient();
    await runSeed(seedClient);
    await seedClient.$disconnect();

    const logins: Record<string, string> = {
      admin: 'admin@campaignhub.dev:Admin@123',
      priya: 'priya.creator@campaignhub.dev:Creator@123',
      arjun: 'arjun.creator@campaignhub.dev:Creator@123',
      kavya: 'kavya.reviewer@campaignhub.dev:Reviewer@123',
      rohan: 'rohan.reviewer@campaignhub.dev:Reviewer@123',
    };
    for (const [who, cred] of Object.entries(logins)) {
      const [email, password] = cred.split(':');
      const res = await api().post('/api/auth/login').send({ email, password });
      expect(res.status).toBe(200);
      tokens[who] = res.body.accessToken;
    }
    const list = await api().get('/api/clients').set(as('admin'));
    clients = Object.fromEntries(list.body.map((c: any) => [c.brandName, c.id]));
  });

  afterAll(async () => {
    await app?.close();
  });

  it('rejects bad credentials and missing tokens', async () => {
    expect((await api().post('/api/auth/login').send({ email: 'admin@campaignhub.dev', password: 'nope' })).status).toBe(401);
    expect((await api().get('/api/posts')).status).toBe(401);
  });

  it('enforces role guards', async () => {
    expect((await api().get('/api/users').set(as('priya'))).status).toBe(403);
    expect((await api().post('/api/posts').set(as('kavya')).send({})).status).toBe(403);
    expect((await api().get('/api/users').set(as('admin'))).status).toBe(200);
  });

  it('only shows reviewers the posts of their assigned clients', async () => {
    const res = await api().get('/api/posts').set(as('rohan'));
    expect(res.status).toBe(200);
    const brands = new Set(res.body.map((p: any) => p.client.brandName));
    expect(brands).toEqual(new Set(['UrbanPulse Fitness', 'GreenLeaf Organics']));

    const masalaPost = (await api().get('/api/posts').set(as('admin'))).body.find((p: any) => p.client.brandName === 'Masala Brew Co.');
    expect((await api().get(`/api/posts/${masalaPost.id}`).set(as('rohan'))).status).toBe(403);
  });

  it('runs the full happy path and writes an audit entry for every status change', async () => {
    const draft = await createDraft('priya', { scheduledAt: inHours(100) });
    expect(draft.status).toBe('DRAFT');
    expect(draft.version).toBe(1);

    let res = await api().post(`/api/posts/${draft.id}/transition`).set(as('priya')).send({ toStatus: 'IN_REVIEW', version: 1 });
    expect(res.status).toBe(201);
    res = await api().post(`/api/posts/${draft.id}/transition`).set(as('kavya')).send({ toStatus: 'APPROVED', version: 2 });
    expect(res.status).toBe(201);
    res = await api().post(`/api/posts/${draft.id}/transition`).set(as('priya')).send({ toStatus: 'SCHEDULED', version: 3 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('SCHEDULED');

    const logs = res.body.auditLogs.map((a: any) => `${a.fromStatus ?? '∅'}>${a.toStatus}`);
    expect(logs).toEqual(['∅>DRAFT', 'DRAFT>IN_REVIEW', 'IN_REVIEW>APPROVED', 'APPROVED>SCHEDULED']);
  });

  it('rejects transitions outside the workflow with 400', async () => {
    const draft = await createDraft();
    const res = await api().post(`/api/posts/${draft.id}/transition`).set(as('priya')).send({ toStatus: 'SCHEDULED', version: 1 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_TRANSITION');
    expect(res.body.message).toMatch(/DRAFT → SCHEDULED/);
  });

  it('never lets reviewers approve their own post and requires a 10+ char comment for changes', async () => {
    const draft = await createDraft();
    await api().post(`/api/posts/${draft.id}/transition`).set(as('priya')).send({ toStatus: 'IN_REVIEW', version: 1 });

    const own = await api().post(`/api/posts/${draft.id}/transition`).set(as('priya')).send({ toStatus: 'APPROVED', version: 2 });
    expect(own.status).toBe(403);
    expect(own.body.message).toBe('You cannot approve your own post.');

    const short = await api().post(`/api/posts/${draft.id}/transition`).set(as('kavya')).send({ toStatus: 'CHANGES_REQUESTED', version: 2, comment: 'meh' });
    expect(short.status).toBe(400);

    const ok = await api()
      .post(`/api/posts/${draft.id}/transition`)
      .set(as('kavya'))
      .send({ toStatus: 'CHANGES_REQUESTED', version: 2, comment: 'Please shorten the hook.' });
    expect(ok.status).toBe(201);
    expect(ok.body.comments.at(-1).message).toBe('Please shorten the hook.');
  });

  it('only lets the creator edit, and only while DRAFT / CHANGES_REQUESTED', async () => {
    const draft = await createDraft('priya');
    expect((await api().patch(`/api/posts/${draft.id}`).set(as('arjun')).send({ version: 1, caption: 'hijack' })).status).toBe(403);
    expect((await api().patch(`/api/posts/${draft.id}`).set(as('priya')).send({ version: 1, caption: 'Edited' })).status).toBe(200);
    await api().post(`/api/posts/${draft.id}/transition`).set(as('priya')).send({ toStatus: 'IN_REVIEW', version: 2 });
    const locked = await api().patch(`/api/posts/${draft.id}`).set(as('priya')).send({ version: 3, caption: 'Too late' });
    expect(locked.status).toBe(400);
    expect(locked.body.code).toBe('NOT_EDITABLE');
  });

  it('validates caption length per platform', async () => {
    const res = await api()
      .post('/api/posts')
      .set(as('priya'))
      .send({ clientId: clients['Masala Brew Co.'], platform: 'X', caption: 'x'.repeat(281) });
    expect(res.status).toBe(400);
    expect(res.body.message).toContain('X allows at most 280');

    const ig = await api()
      .post('/api/posts')
      .set(as('priya'))
      .send({ clientId: clients['Masala Brew Co.'], platform: 'INSTAGRAM', caption: 'x'.repeat(281) });
    expect(ig.status).toBe(201);
  });

  it('rejects past schedule times', async () => {
    const res = await api()
      .post('/api/posts')
      .set(as('priya'))
      .send({ clientId: clients['Masala Brew Co.'], platform: 'X', caption: 'late', scheduledAt: inHours(-1) });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SCHEDULE_IN_PAST');
  });

  it('returns 409 with the conflicting post id when posts are < 2h apart', async () => {
    const first = await createDraft('priya', { clientId: clients['GreenLeaf Organics'], platform: 'FACEBOOK', scheduledAt: inHours(200) });
    const clash = await api()
      .post('/api/posts')
      .set(as('arjun'))
      .send({ clientId: clients['GreenLeaf Organics'], platform: 'FACEBOOK', caption: 'clash', scheduledAt: inHours(201.5) });
    expect(clash.status).toBe(409);
    expect(clash.body.code).toBe('SCHEDULE_CONFLICT');
    expect(clash.body.conflictingPostId).toBe(first.id);

    // Different platform or a 2h gap is fine.
    expect((await api().post('/api/posts').set(as('arjun')).send({ clientId: clients['GreenLeaf Organics'], platform: 'X', caption: 'ok', scheduledAt: inHours(200) })).status).toBe(201);
    expect((await api().post('/api/posts').set(as('arjun')).send({ clientId: clients['GreenLeaf Organics'], platform: 'FACEBOOK', caption: 'ok', scheduledAt: inHours(202) })).status).toBe(201);
  });

  it('serialises concurrent scheduling so only one of two clashing requests wins', async () => {
    const t = inHours(300);
    const body = { clientId: clients['UrbanPulse Fitness'], platform: 'LINKEDIN', caption: 'race', scheduledAt: t };
    const [a, b] = await Promise.all([
      api().post('/api/posts').set(as('priya')).send(body),
      api().post('/api/posts').set(as('arjun')).send(body),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  it('uses optimistic locking: a stale version gets 409', async () => {
    const draft = await createDraft();
    const first = await api().patch(`/api/posts/${draft.id}`).set(as('priya')).send({ version: 1, caption: 'Tab A' });
    expect(first.status).toBe(200);
    expect(first.body.version).toBe(2);

    const stale = await api().patch(`/api/posts/${draft.id}`).set(as('priya')).send({ version: 1, caption: 'Tab B' });
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('VERSION_CONFLICT');
    expect(stale.body.currentVersion).toBe(2);

    const staleTransition = await api().post(`/api/posts/${draft.id}/transition`).set(as('priya')).send({ toStatus: 'IN_REVIEW', version: 1 });
    expect(staleTransition.status).toBe(409);
  });

  it('publishes due SCHEDULED posts from the background job with a system audit entry', async () => {
    const draft = await createDraft('priya', { clientId: clients['GreenLeaf Organics'], platform: 'LINKEDIN', scheduledAt: inHours(500) });
    await api().post(`/api/posts/${draft.id}/transition`).set(as('priya')).send({ toStatus: 'IN_REVIEW', version: 1 });
    await api().post(`/api/posts/${draft.id}/transition`).set(as('rohan')).send({ toStatus: 'APPROVED', version: 2 });
    await api().post(`/api/posts/${draft.id}/transition`).set(as('priya')).send({ toStatus: 'SCHEDULED', version: 3 });

    const publisher = app.get(PublisherService);
    await publisher.publishDue(new Date(Date.now() + 501 * 3600_000));
    const res = await api().get(`/api/posts/${draft.id}`).set(as('priya'));
    expect(res.body.status).toBe(PostStatus.PUBLISHED);
    const last = res.body.auditLogs.at(-1);
    expect(last).toMatchObject({ fromStatus: 'SCHEDULED', toStatus: 'PUBLISHED', actor: null });
    // Running again is a no-op.
    expect(await publisher.publishDue(new Date(Date.now() + 501 * 3600_000))).toBe(0);
  });
});
