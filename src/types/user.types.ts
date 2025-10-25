// src/types/user.types.ts

/** Possible user tiers */
export type UserTier = 'bronze' | 'silver' | 'gold' | 'platinum';

/** Possible user account statuses */
export type UserStatus = 'active' | 'inactive';

/** Full user model stored in DynamoDB */
export interface User {
  PK: string;
  SK: string;
  GSI1PK: string;
  GSI1SK: string;
  GSI2PK?: string;
  GSI2SK?: string;
  entityType: 'USER';
  userId: string;
  email: string;
  name: string;
  phone?: string | null;
  points: number;
  lifetimePoints: number;
  tier: UserTier;
  status: UserStatus;
  metadata?: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

/** Input for creating a user */
export interface CreateUserInput {
  email: string;
  name: string;
  phone?: string;
  metadata?: Record<string, any>;
}

/** Input for updating a user */
export interface UpdateUserInput {
  name?: string;
  phone?: string;
  metadata?: Record<string, any>;
  status?: UserStatus;
  tier?: UserTier;
}

/** Computed user statistics */
export interface UserStats {
  userId: string;
  points: number;
  lifetimePoints: number;
  tier: UserTier;
  totalOrders: number;
  totalTransactions: number;
  memberSince: string;
}

/** Authenticated user from JWT token */
export interface AuthenticatedUser {
    userId: string;
    email: string;
    role: 'user' | 'admin';
    name?: string;
  }
  