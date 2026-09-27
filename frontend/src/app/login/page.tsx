'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { FormEvent, Suspense, useEffect, useState } from 'react';
import { ApiErrorBanner } from '@/components/ui';
import { useAuth } from '@/lib/auth';

const DEMO = [
  { label: 'Admin', email: 'admin@campaignhub.dev', password: 'Admin@123' },
  { label: 'Creator · Priya', email: 'priya.creator@campaignhub.dev', password: 'Creator@123' },
  { label: 'Creator · Arjun', email: 'arjun.creator@campaignhub.dev', password: 'Creator@123' },
  { label: 'Reviewer · Kavya', email: 'kavya.reviewer@campaignhub.dev', password: 'Reviewer@123' },
  { label: 'Reviewer · Rohan', email: 'rohan.reviewer@campaignhub.dev', password: 'Reviewer@123' },
];

function LoginForm() {
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const next = useSearchParams().get('next') || '/board';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) router.replace(next);
  }, [loading, user, next, router]);

  async function submit(e?: FormEvent, creds?: { email: string; password: string }) {
    e?.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(creds?.email ?? email, creds?.password ?? password);
      router.replace(next);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="brand brand-lg">
          <span className="brand-mark">C</span>
          <span className="brand-name">CampaignHub</span>
        </div>
        <p className="muted">Plan, review and schedule social posts for every brand you manage.</p>
        <form onSubmit={submit} className="form">
          <label className="field">
            <span>Email</span>
            <input type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </label>
          <label className="field">
            <span>Password</span>
            <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <ApiErrorBanner error={error} />
          <button className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
        <div className="demo">
          <div className="demo-title">Demo accounts (seed data)</div>
          <div className="demo-grid">
            {DEMO.map((d) => (
              <button
                key={d.email}
                type="button"
                className="chip-btn"
                disabled={busy}
                onClick={() => {
                  setEmail(d.email);
                  setPassword(d.password);
                  submit(undefined, d);
                }}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
