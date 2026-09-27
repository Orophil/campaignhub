/**
 * Seed script: wipes the database and creates
 *   1 admin, 2 creators, 2 reviewers, 3 clients and 18 posts (3 per status),
 * each post with a realistic audit trail and comments.
 *
 * The schema must already be migrated (`npx prisma migrate deploy`).
 *
 *   npm run seed            (TypeScript, dev)
 *   npm run seed:prod       (compiled, used in Docker)
 */
import { Client, PrismaClient, User } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import { Platform, PostStatus, Role } from '../common/enums';

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

export const SEED_USERS = [
  { key: 'admin', name: 'Anita Rao', email: 'admin@campaignhub.dev', password: 'Admin@123', role: Role.ADMIN },
  { key: 'priya', name: 'Priya Sharma', email: 'priya.creator@campaignhub.dev', password: 'Creator@123', role: Role.CREATOR },
  { key: 'arjun', name: 'Arjun Mehta', email: 'arjun.creator@campaignhub.dev', password: 'Creator@123', role: Role.CREATOR },
  { key: 'kavya', name: 'Kavya Iyer', email: 'kavya.reviewer@campaignhub.dev', password: 'Reviewer@123', role: Role.REVIEWER },
  { key: 'rohan', name: 'Rohan Das', email: 'rohan.reviewer@campaignhub.dev', password: 'Reviewer@123', role: Role.REVIEWER },
] as const;

type UserKey = (typeof SEED_USERS)[number]['key'];

const CLIENTS: { key: string; brandName: string; reviewers: UserKey[] }[] = [
  { key: 'masala', brandName: 'Masala Brew Co.', reviewers: ['kavya'] },
  { key: 'urban', brandName: 'UrbanPulse Fitness', reviewers: ['kavya', 'rohan'] },
  { key: 'green', brandName: 'GreenLeaf Organics', reviewers: ['rohan'] },
];

interface SeedPost {
  client: string;
  platform: Platform;
  creator: UserKey;
  status: PostStatus;
  caption: string;
  /** 'future' = a free future slot, 'past' = a past slot, 'soon' = ~3 min from now, null = unscheduled */
  when: 'future' | 'past' | 'soon' | null;
  changeRequest?: string;
  /** Went through a changes-requested round before being approved. */
  reworked?: boolean;
  extraComments?: { by: UserKey; message: string }[];
}

const POSTS: SeedPost[] = [
  // ---------------- DRAFT
  { client: 'masala', platform: Platform.INSTAGRAM, creator: 'priya', status: PostStatus.DRAFT, when: 'future',
    caption: 'Monsoon + masala chai = the only forecast we trust ☔️🍵 Tag the friend you share your first cup with. #MasalaBrew #ChaiTime' },
  { client: 'green', platform: Platform.FACEBOOK, creator: 'arjun', status: PostStatus.DRAFT, when: null,
    caption: 'From our farms in Ooty to your kitchen in 48 hours. Meet the growers behind this week\'s organic veggie box – full story on our blog.' },
  { client: 'urban', platform: Platform.X, creator: 'priya', status: PostStatus.DRAFT, when: 'future',
    caption: 'New week, new PR. Our 6 AM HIIT batch is back at all Chennai studios. Who\'s in? 💪 #UrbanPulse' },

  // ---------------- IN_REVIEW
  { client: 'masala', platform: Platform.LINKEDIN, creator: 'arjun', status: PostStatus.IN_REVIEW, when: 'future',
    caption: 'We\'re proud to share that Masala Brew Co. now sources 100% of its tea from Fairtrade-certified estates in Assam and the Nilgiris. Here\'s what that journey taught us about building a supply chain that works for growers first.' },
  { client: 'urban', platform: Platform.INSTAGRAM, creator: 'priya', status: PostStatus.IN_REVIEW, when: 'future',
    caption: 'Transformation Tuesday 🔥 12 weeks, 3 sessions a week, one very determined Meena. Swipe to see her journey →  #UrbanPulse #FitnessJourney' },
  { client: 'green', platform: Platform.X, creator: 'arjun', status: PostStatus.IN_REVIEW, when: 'future',
    caption: 'Cold-pressed groundnut oil is back in stock 🥜 Small batches, no chemicals, same taste your paati remembers. Order before Friday for weekend delivery.' },

  // ---------------- CHANGES_REQUESTED
  { client: 'masala', platform: Platform.X, creator: 'priya', status: PostStatus.CHANGES_REQUESTED, when: 'future',
    caption: 'Our new Cardamom Cold Brew is here!! Best drink in India, guaranteed!!! 🚀🚀🚀',
    changeRequest: 'Please drop "best drink in India, guaranteed" – we cannot make that claim. Also tone down the exclamation marks.' },
  { client: 'urban', platform: Platform.FACEBOOK, creator: 'arjun', status: PostStatus.CHANGES_REQUESTED, when: 'future',
    caption: 'Flat 50% off annual memberships this weekend only. Offer valid at all branches.',
    changeRequest: 'The offer excludes the Koramangala branch – please add that and mention the T&C link.' },
  { client: 'green', platform: Platform.INSTAGRAM, creator: 'priya', status: PostStatus.CHANGES_REQUESTED, when: null,
    caption: 'Organic mangoes are HERE 🥭 Alphonso, Banganapalli and Imam Pasand – pick your favourite!',
    changeRequest: 'Imam Pasand is not in stock until next month. Please remove it and add the delivery cities.' },

  // ---------------- APPROVED
  { client: 'masala', platform: Platform.FACEBOOK, creator: 'arjun', status: PostStatus.APPROVED, when: 'future', reworked: true,
    caption: 'Weekend special at all Masala Brew outlets: buy any two filter coffees and get a fresh medu vada on us. Valid Sat–Sun, 7 AM to 11 AM.',
    changeRequest: 'Add the time window for the offer so stores are not flooded all day.' },
  { client: 'urban', platform: Platform.LINKEDIN, creator: 'priya', status: PostStatus.APPROVED, when: 'future',
    caption: 'UrbanPulse is hiring certified trainers in Bengaluru and Hyderabad. If you believe fitness should be inclusive, science-backed and fun, we want to hear from you.' },
  { client: 'green', platform: Platform.FACEBOOK, creator: 'arjun', status: PostStatus.APPROVED, when: 'future',
    caption: 'Join our free composting workshop this Sunday at the Anna Nagar store. Bring your kitchen scraps, leave with a starter kit! 🌱' },

  // ---------------- SCHEDULED
  { client: 'masala', platform: Platform.INSTAGRAM, creator: 'priya', status: PostStatus.SCHEDULED, when: 'soon',
    caption: 'Flash sale ⚡️ The next 100 orders of our Ginger Masala blend ship free. Link in bio. #MasalaBrew' },
  { client: 'urban', platform: Platform.X, creator: 'arjun', status: PostStatus.SCHEDULED, when: 'future',
    caption: 'Rest days are training days too. Our physio team shares 5 mobility drills you can do at your desk 🧘 Thread 👇' },
  { client: 'green', platform: Platform.LINKEDIN, creator: 'priya', status: PostStatus.SCHEDULED, when: 'future',
    caption: 'This quarter GreenLeaf crossed 2,000 partner farmers across Tamil Nadu and Karnataka. A thank-you to every farmer, driver and customer who made it possible.' },

  // ---------------- PUBLISHED
  { client: 'masala', platform: Platform.X, creator: 'arjun', status: PostStatus.PUBLISHED, when: 'past',
    caption: 'Filter coffee > everything. That\'s the tweet. ☕️' },
  { client: 'urban', platform: Platform.INSTAGRAM, creator: 'priya', status: PostStatus.PUBLISHED, when: 'past', reworked: true,
    caption: 'Our Indiranagar studio is now open 24/7 🌙 Night owls, this one\'s for you.',
    changeRequest: 'Please confirm the 24/7 timing with the ops team and use the new studio photo.' },
  { client: 'green', platform: Platform.INSTAGRAM, creator: 'arjun', status: PostStatus.PUBLISHED, when: 'past',
    caption: 'Millets are the original superfood 🌾 Ragi, bajra, foxtail – which one is in your kitchen today?',
    extraComments: [{ by: 'rohan', message: 'Great engagement on this one – let\'s do a follow-up recipe series.' }] },
];

/** Wipes and re-creates all demo data. Used by `npm run seed` and the e2e tests. */
export async function runSeed(prisma: PrismaClient, now: number = Date.now()) {
  // Hash outside the transaction so bcrypt doesn't eat into its timeout.
  const hashes = await Promise.all(SEED_USERS.map((u) => bcrypt.hash(u.password, 10)));

  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`TRUNCATE audit_logs, comments, posts, client_reviewers, clients, users RESTART IDENTITY CASCADE`;

    // Users
    const users = {} as Record<UserKey, User>;
    for (const [i, u] of SEED_USERS.entries()) {
      users[u.key] = await tx.user.create({ data: { name: u.name, email: u.email, role: u.role, passwordHash: hashes[i] } });
    }

    // Clients + reviewer assignments
    const clients: Record<string, Client> = {};
    for (const c of CLIENTS) {
      clients[c.key] = await tx.client.create({
        data: { brandName: c.brandName, reviewers: { create: c.reviewers.map((k) => ({ reviewerId: users[k].id })) } },
      });
    }

    // Distinct 3-hour-apart slots guarantee the seed itself never breaks the 2-hour rule.
    const firstFuture = Math.ceil((now + 24 * HOUR) / HOUR) * HOUR;
    let futureSlot = 0;
    let pastSlot = 1;

    for (const [index, sp] of POSTS.entries()) {
      const client = CLIENTS.find((c) => c.key === sp.client)!;
      const reviewer = users[client.reviewers[0]];
      const creator = users[sp.creator];

      let scheduledAt: Date | null = null;
      if (sp.when === 'future') scheduledAt = new Date(firstFuture + futureSlot++ * 3 * HOUR);
      if (sp.when === 'past') scheduledAt = new Date(Math.floor(now / HOUR) * HOUR - pastSlot++ * 3 * HOUR);
      if (sp.when === 'soon') scheduledAt = new Date(Math.ceil((now + 3 * MINUTE) / MINUTE) * MINUTE);

      // Build the audit trail that leads to the target status.
      type Step = { from: PostStatus | null; to: PostStatus; actor: User | null; comment?: string };
      const steps: Step[] = [{ from: null, to: PostStatus.DRAFT, actor: creator }];
      const reach = (s: PostStatus) => ORDER.indexOf(sp.status) >= ORDER.indexOf(s);

      if (sp.status === PostStatus.CHANGES_REQUESTED) {
        steps.push({ from: PostStatus.DRAFT, to: PostStatus.IN_REVIEW, actor: creator });
        steps.push({ from: PostStatus.IN_REVIEW, to: PostStatus.CHANGES_REQUESTED, actor: reviewer, comment: sp.changeRequest });
      } else if (reach(PostStatus.IN_REVIEW)) {
        steps.push({ from: PostStatus.DRAFT, to: PostStatus.IN_REVIEW, actor: creator });
        if (sp.reworked) {
          steps.push({ from: PostStatus.IN_REVIEW, to: PostStatus.CHANGES_REQUESTED, actor: reviewer, comment: sp.changeRequest });
          steps.push({ from: PostStatus.CHANGES_REQUESTED, to: PostStatus.IN_REVIEW, actor: creator });
        }
        if (reach(PostStatus.APPROVED)) steps.push({ from: PostStatus.IN_REVIEW, to: PostStatus.APPROVED, actor: reviewer, comment: index % 2 ? 'Looks good – approved.' : undefined });
        if (reach(PostStatus.SCHEDULED)) steps.push({ from: PostStatus.APPROVED, to: PostStatus.SCHEDULED, actor: creator });
        if (reach(PostStatus.PUBLISHED)) steps.push({ from: PostStatus.SCHEDULED, to: PostStatus.PUBLISHED, actor: null });
      }

      // Space the history out over the last few days, ending shortly before now
      // (or right at the publish time for published posts).
      const end = sp.status === PostStatus.PUBLISHED ? scheduledAt!.getTime() : now - (index + 1) * 7 * MINUTE;
      const start = end - (steps.length + 1) * 5 * HOUR;
      const at = (i: number) => new Date(start + i * 5 * HOUR);

      const post = await tx.post.create({
        data: {
          clientId: clients[sp.client].id,
          platform: sp.platform,
          caption: sp.caption,
          scheduledAt,
          status: sp.status,
          createdById: creator.id,
          version: steps.length, // one version per write: creation + each transition
          createdAt: at(0),
          updatedAt: at(steps.length - 1),
        },
      });

      for (const [i, step] of steps.entries()) {
        await tx.auditLog.create({ data: { postId: post.id, actorId: step.actor?.id ?? null, fromStatus: step.from, toStatus: step.to, timestamp: at(i) } });
        if (step.comment) {
          await tx.comment.create({ data: { postId: post.id, authorId: step.actor!.id, message: step.comment, createdAt: at(i) } });
          if (step.to === PostStatus.CHANGES_REQUESTED && sp.status === PostStatus.CHANGES_REQUESTED) {
            await tx.comment.create({ data: { postId: post.id, authorId: creator.id, message: 'Thanks, on it – will update today.', createdAt: new Date(at(i).getTime() + 30 * MINUTE) } });
          }
        }
      }
      for (const c of sp.extraComments ?? []) {
        await tx.comment.create({ data: { postId: post.id, authorId: users[c.by].id, message: c.message, createdAt: new Date(end + HOUR) } });
      }
    }
  }, { timeout: 60_000 });
}

async function main(prisma: PrismaClient) {
  await runSeed(prisma);
  const counts = await prisma.post.groupBy({ by: ['status'], _count: true, orderBy: { status: 'asc' } });
  console.log('Seeded posts by status:', Object.fromEntries(counts.map((r) => [r.status, r._count])));
  console.log('\nLogin credentials:');
  for (const u of SEED_USERS) console.log(`  ${u.role.padEnd(8)} ${u.email.padEnd(34)} ${u.password}`);
}

const ORDER: PostStatus[] = [PostStatus.DRAFT, PostStatus.IN_REVIEW, PostStatus.APPROVED, PostStatus.SCHEDULED, PostStatus.PUBLISHED];

if (require.main === module) {
  const prisma = new PrismaClient();
  main(prisma)
    .catch((err) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
