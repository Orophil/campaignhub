export type Role = 'ADMIN' | 'CREATOR' | 'REVIEWER';
export type Platform = 'INSTAGRAM' | 'FACEBOOK' | 'LINKEDIN' | 'X';
export type PostStatus = 'DRAFT' | 'IN_REVIEW' | 'CHANGES_REQUESTED' | 'APPROVED' | 'SCHEDULED' | 'PUBLISHED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt?: string;
}

export interface Client {
  id: string;
  brandName: string;
  reviewers: User[];
  createdAt: string;
}

export interface Comment {
  id: string;
  postId: string;
  authorId: string;
  author: User;
  message: string;
  createdAt: string;
}

export interface AuditLog {
  id: string;
  postId: string;
  actorId: string | null;
  actor: User | null;
  fromStatus: PostStatus | null;
  toStatus: PostStatus;
  timestamp: string;
}

export interface PostPermissions {
  canEdit: boolean;
  canComment: boolean;
  transitions: PostStatus[];
}

export interface Post {
  id: string;
  clientId: string;
  client: Client;
  platform: Platform;
  caption: string;
  scheduledAt: string | null;
  status: PostStatus;
  createdById: string;
  createdBy: User;
  version: number;
  createdAt: string;
  updatedAt: string;
  permissions: PostPermissions;
  comments?: Comment[];
  auditLogs?: AuditLog[];
}

export interface PostStatusEvent {
  postId: string;
  clientId: string;
  brandName: string;
  platform: Platform;
  captionPreview: string;
  fromStatus: PostStatus | null;
  toStatus: PostStatus;
  actorName: string;
  at: string;
}
