import type { Client, Comment, Platform, Post, PostStatus, Role, User } from './types';

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000/api';
const TOKEN_KEY = 'campaignhub.token';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
    public body: Record<string, any> = {},
  ) {
    super(message);
  }
  get isConflict() {
    return this.status === 409;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable (private mode) - token only lives for this tab */
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new ApiError(0, 'Cannot reach the CampaignHub API. Check that the backend is running.', 'NETWORK');
  }

  const text = await res.text();
  const data = text ? safeJson(text) : null;
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') onUnauthorized?.();
    const raw = data?.message;
    const message = Array.isArray(raw) ? raw.join(' · ') : raw || res.statusText || 'Request failed';
    throw new ApiError(res.status, message, data?.code, data ?? {});
  }
  return data as T;
}

function safeJson(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function qs(params: Record<string, string | undefined>) {
  const s = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString();
  return s ? `?${s}` : '';
}

export interface PostFilters {
  clientId?: string;
  platform?: Platform;
  status?: PostStatus;
  from?: string;
  to?: string;
}

export const api = {
  login: (email: string, password: string) => request<{ accessToken: string; user: User }>('POST', '/auth/login', { email, password }),
  me: () => request<User>('GET', '/auth/me'),

  listPosts: (f: PostFilters = {}) => request<Post[]>('GET', `/posts${qs(f as Record<string, string | undefined>)}`),
  getPost: (id: string) => request<Post>('GET', `/posts/${id}`),
  createPost: (body: { clientId: string; platform: Platform; caption: string; scheduledAt?: string | null }) =>
    request<Post>('POST', '/posts', body),
  updatePost: (id: string, body: { version: number; clientId?: string; platform?: Platform; caption?: string; scheduledAt?: string | null }) =>
    request<Post>('PATCH', `/posts/${id}`, body),
  transition: (id: string, body: { toStatus: PostStatus; version: number; comment?: string; scheduledAt?: string }) =>
    request<Post>('POST', `/posts/${id}/transition`, body),
  addComment: (id: string, message: string) => request<Comment>('POST', `/posts/${id}/comments`, { message }),

  listClients: () => request<Client[]>('GET', '/clients'),
  createClient: (body: { brandName: string; reviewerIds: string[] }) => request<Client>('POST', '/clients', body),
  updateClient: (id: string, body: { brandName?: string; reviewerIds?: string[] }) => request<Client>('PATCH', `/clients/${id}`, body),

  listUsers: (role?: Role) => request<User[]>('GET', `/users${qs({ role })}`),
  createUser: (body: { name: string; email: string; password: string; role: Role }) => request<User>('POST', '/users', body),
};
