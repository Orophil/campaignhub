'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useLive } from '@/lib/socket';
import type { Role } from '@/lib/types';
import { Avatar } from './ui';

const NAV: { href: string; label: string; roles?: Role[] }[] = [
  { href: '/board', label: 'Board' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/admin', label: 'Admin', roles: ['ADMIN'] },
];

const ROLE_LABEL: Record<Role, string> = { ADMIN: 'Admin', CREATOR: 'Creator', REVIEWER: 'Reviewer' };

export function AppShell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const { user, logout } = useAuth();
  const { connected } = useLive();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  if (!user) return null;

  return (
    <div className="shell">
      <header className="topbar">
        <Link href="/board" className="brand">
          <span className="brand-mark">C</span>
          <span className="brand-name">CampaignHub</span>
        </Link>
        <button className="icon-btn nav-toggle" aria-label="Menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          ☰
        </button>
        <nav className={`nav ${open ? 'nav-open' : ''}`}>
          {NAV.filter((n) => !n.roles || n.roles.includes(user.role)).map((n) => (
            <Link key={n.href} href={n.href} className={pathname.startsWith(n.href) ? 'active' : ''} onClick={() => setOpen(false)}>
              {n.label}
            </Link>
          ))}
          {user.role === 'CREATOR' && (
            <Link href="/posts/new" className="btn btn-primary btn-sm nav-cta" onClick={() => setOpen(false)}>
              + New post
            </Link>
          )}
          <div className="userbox">
            <span className={`live-dot ${connected ? 'on' : ''}`} title={connected ? 'Live updates on' : 'Live updates offline'} />
            <Avatar name={user.name} />
            <div className="userbox-text">
              <span className="userbox-name">{user.name}</span>
              <span className={`role-pill role-${user.role}`}>{ROLE_LABEL[user.role]}</span>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={logout}>
              Log out
            </button>
          </div>
        </nav>
      </header>
      {actions}
      <main className="main">{children}</main>
    </div>
  );
}
