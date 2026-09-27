'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { ErrorState, PlatformIcon, Spinner, StatusBadge } from '@/components/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import { PLATFORM_LABELS } from '@/lib/constants';
import { usePostsChanged } from '@/lib/socket';
import { formatDayIST, formatTimeIST, istDayKey, startOfWeekIST } from '@/lib/time';
import type { Client, Post } from '@/lib/types';

const DAY = 86_400_000;
const CLIENT_COLORS = ['#6d5efc', '#f0883e', '#1f9d74', '#d6336c', '#1c7ed6', '#a07b00'];

export default function CalendarPage() {
  const { ready } = useRequireAuth();
  const [weekStart, setWeekStart] = useState(() => startOfWeekIST(new Date()));
  const [clientId, setClientId] = useState('');
  const [includeAll, setIncludeAll] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const weekEnd = useMemo(() => new Date(weekStart.getTime() + 7 * DAY), [weekStart]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY)), [weekStart]);

  const load = useCallback(() => {
    setError(null);
    setPosts(null);
    return api
      .listPosts({ clientId: clientId || undefined, from: weekStart.toISOString(), to: weekEnd.toISOString() })
      .then(setPosts)
      .catch(setError);
  }, [clientId, weekStart, weekEnd]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);
  useEffect(() => {
    if (ready) api.listClients().then(setClients).catch(() => {});
  }, [ready]);
  usePostsChanged(() => {
    if (ready) api.listPosts({ clientId: clientId || undefined, from: weekStart.toISOString(), to: weekEnd.toISOString() }).then(setPosts).catch(() => {});
  });

  const colorOf = useCallback((id: string) => CLIENT_COLORS[Math.max(0, clients.findIndex((c) => c.id === id)) % CLIENT_COLORS.length], [clients]);

  const grouped = useMemo(() => {
    const map = new Map<string, Post[]>();
    for (const p of posts ?? []) {
      if (!p.scheduledAt) continue;
      if (!includeAll && p.status !== 'SCHEDULED' && p.status !== 'PUBLISHED') continue;
      const key = istDayKey(p.scheduledAt);
      map.set(key, [...(map.get(key) ?? []), p]);
    }
    return map;
  }, [posts, includeAll]);

  const todayKey = istDayKey(new Date());
  const total = [...grouped.values()].reduce((n, l) => n + l.length, 0);
  const rangeLabel = `${formatDayIST(weekStart)} – ${formatDayIST(new Date(weekEnd.getTime() - DAY))}`;

  if (!ready) return <Spinner />;
  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1>Weekly calendar</h1>
          <p className="muted">
            {rangeLabel} · times in IST · {total} post{total === 1 ? '' : 's'}
          </p>
        </div>
        <div className="filters">
          <div className="btn-group">
            <button className="btn btn-sm" onClick={() => setWeekStart((w) => new Date(w.getTime() - 7 * DAY))} aria-label="Previous week">
              ←
            </button>
            <button className="btn btn-sm" onClick={() => setWeekStart(startOfWeekIST(new Date()))}>
              This week
            </button>
            <button className="btn btn-sm" onClick={() => setWeekStart((w) => new Date(w.getTime() + 7 * DAY))} aria-label="Next week">
              →
            </button>
          </div>
          <select aria-label="Client" value={clientId} onChange={(e) => setClientId(e.target.value)}>
            <option value="">All clients</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.brandName}
              </option>
            ))}
          </select>
          <label className="toggle">
            <input type="checkbox" checked={includeAll} onChange={(e) => setIncludeAll(e.target.checked)} />
            <span>Include unscheduled stages</span>
          </label>
        </div>
      </div>

      {clients.length > 0 && (
        <div className="legend">
          {clients
            .filter((c) => !clientId || c.id === clientId)
            .map((c) => (
              <span key={c.id} className="legend-item">
                <span className="legend-swatch" style={{ background: colorOf(c.id) }} />
                {c.brandName}
              </span>
            ))}
        </div>
      )}

      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !posts ? (
        <Spinner label="Loading week…" />
      ) : (
        <div className="calendar">
          {days.map((d) => {
            const key = istDayKey(d);
            const items = (grouped.get(key) ?? []).sort((a, b) => a.scheduledAt!.localeCompare(b.scheduledAt!));
            return (
              <div key={key} className={`cal-day ${key === todayKey ? 'today' : ''}`}>
                <div className="cal-day-head">{formatDayIST(d)}</div>
                <div className="cal-day-body">
                  {items.length === 0 ? (
                    <span className="cal-empty">—</span>
                  ) : (
                    items.map((p) => (
                      <Link key={p.id} href={`/posts/${p.id}`} className="cal-item" style={{ borderLeftColor: colorOf(p.clientId) }}>
                        <div className="cal-item-top">
                          <span className="cal-time">{formatTimeIST(p.scheduledAt!)}</span>
                          <span title={PLATFORM_LABELS[p.platform]}>
                            <PlatformIcon platform={p.platform} size={13} />
                          </span>
                        </div>
                        <div className="cal-client">{p.client.brandName}</div>
                        <div className="cal-caption">{p.caption}</div>
                        <StatusBadge status={p.status} />
                      </Link>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
