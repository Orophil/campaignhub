'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AppShell } from '@/components/AppShell';
import { useToast } from '@/components/Toasts';
import { ApiErrorBanner, Avatar, EmptyState, ErrorState, Spinner } from '@/components/ui';
import { api } from '@/lib/api';
import { useRequireAuth } from '@/lib/auth';
import type { Client, Role, User } from '@/lib/types';

export default function AdminPage() {
  const { ready } = useRequireAuth(['ADMIN']);
  const [users, setUsers] = useState<User[] | null>(null);
  const [clients, setClients] = useState<Client[] | null>(null);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(() => {
    setError(null);
    return Promise.all([api.listUsers(), api.listClients()])
      .then(([u, c]) => {
        setUsers(u);
        setClients(c);
      })
      .catch(setError);
  }, []);
  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  if (!ready) return <Spinner />;
  return (
    <AppShell>
      <div className="page-head">
        <div>
          <h1>Admin</h1>
          <p className="muted">Manage team members, clients, and who reviews each client.</p>
        </div>
      </div>
      {error ? (
        <ErrorState error={error} onRetry={load} />
      ) : !users || !clients ? (
        <Spinner />
      ) : (
        <div className="admin-grid">
          <ClientsPanel clients={clients} reviewers={users.filter((u) => u.role === 'REVIEWER')} onChange={load} />
          <UsersPanel users={users} onChange={load} />
        </div>
      )}
    </AppShell>
  );
}

function ClientsPanel({ clients, reviewers, onChange }: { clients: Client[]; reviewers: User[]; onChange: () => void }) {
  const toast = useToast();
  const [brandName, setBrandName] = useState('');
  const [newReviewers, setNewReviewers] = useState<string[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<string[]>([]);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createClient({ brandName, reviewerIds: newReviewers });
      toast({ tone: 'success', title: `Client “${brandName}” created` });
      setBrandName('');
      setNewReviewers([]);
      onChange();
    } catch (err) {
      setError(err);
    }
  }

  async function saveReviewers(client: Client) {
    setError(null);
    try {
      await api.updateClient(client.id, { reviewerIds: draft });
      toast({ tone: 'success', title: `Reviewers updated for ${client.brandName}` });
      setEditing(null);
      onChange();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">
        Clients <span className="count">{clients.length}</span>
      </h2>
      {clients.length === 0 ? (
        <EmptyState title="No clients yet" />
      ) : (
        <ul className="client-list">
          {clients.map((c) => (
            <li key={c.id} className="client-row">
              <div className="client-row-head">
                <strong>{c.brandName}</strong>
                {editing === c.id ? (
                  <div className="inline">
                    <button className="btn btn-sm btn-ghost" onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                    <button className="btn btn-sm btn-primary" onClick={() => saveReviewers(c)}>
                      Save
                    </button>
                  </div>
                ) : (
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      setEditing(c.id);
                      setDraft(c.reviewers.map((r) => r.id));
                    }}
                  >
                    Assign reviewers
                  </button>
                )}
              </div>
              {editing === c.id ? (
                <ReviewerPicker reviewers={reviewers} value={draft} onChange={setDraft} />
              ) : (
                <div className="chips">
                  {c.reviewers.length === 0 ? (
                    <span className="muted small">No reviewers assigned</span>
                  ) : (
                    c.reviewers.map((r) => (
                      <span key={r.id} className="chip">
                        <Avatar name={r.name} size={18} /> {r.name}
                      </span>
                    ))
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <form className="form subform" onSubmit={create}>
        <h3>Add client</h3>
        <label className="field">
          <span>Brand name</span>
          <input required minLength={2} value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="e.g. Kaveri Textiles" />
        </label>
        <div className="field">
          <span>Reviewers</span>
          <ReviewerPicker reviewers={reviewers} value={newReviewers} onChange={setNewReviewers} />
        </div>
        <ApiErrorBanner error={error} onDismiss={() => setError(null)} />
        <button className="btn btn-primary">Create client</button>
      </form>
    </section>
  );
}

function ReviewerPicker({ reviewers, value, onChange }: { reviewers: User[]; value: string[]; onChange: (v: string[]) => void }) {
  if (reviewers.length === 0) return <span className="muted small">Create a reviewer first.</span>;
  return (
    <div className="chips">
      {reviewers.map((r) => {
        const on = value.includes(r.id);
        return (
          <button
            type="button"
            key={r.id}
            className={`chip chip-toggle ${on ? 'on' : ''}`}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((id) => id !== r.id) : [...value, r.id])}
          >
            {on ? '✓ ' : '+ '}
            {r.name}
          </button>
        );
      })}
    </div>
  );
}

function UsersPanel({ users, onChange }: { users: User[]; onChange: () => void }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'CREATOR' as Role });
  const [error, setError] = useState<unknown>(null);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await api.createUser(form);
      toast({ tone: 'success', title: `${form.name} added as ${form.role.toLowerCase()}` });
      setForm({ name: '', email: '', password: '', role: form.role });
      onChange();
    } catch (err) {
      setError(err);
    }
  }

  return (
    <section className="card">
      <h2 className="card-title">
        Users <span className="count">{users.length}</span>
      </h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>
                  <span className="inline">
                    <Avatar name={u.name} size={22} /> {u.name}
                  </span>
                </td>
                <td className="muted">{u.email}</td>
                <td>
                  <span className={`role-pill role-${u.role}`}>{u.role.toLowerCase()}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <form className="form subform" onSubmit={create}>
        <h3>Add user</h3>
        <div className="form-grid">
          <label className="field">
            <span>Name</span>
            <input required minLength={2} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label className="field">
            <span>Email</span>
            <input required type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </label>
          <label className="field">
            <span>Password</span>
            <input required minLength={8} type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </label>
          <label className="field">
            <span>Role</span>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
              <option value="CREATOR">Creator</option>
              <option value="REVIEWER">Reviewer</option>
              <option value="ADMIN">Admin</option>
            </select>
          </label>
        </div>
        <ApiErrorBanner error={error} onDismiss={() => setError(null)} />
        <button className="btn btn-primary">Create user</button>
      </form>
    </section>
  );
}
