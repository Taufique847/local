import { Request } from 'express';
import { Document, Types } from 'mongoose';

export type UserRole = 'user' | 'admin';

export interface IUser extends Document {
  _id: Types.ObjectId;
  name: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  isActive: boolean;
  /** Null until the user proves control of their email address. */
  emailVerifiedAt?: Date | null;
  /** Incremented to revoke all outstanding access tokens for this user. */
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  /** Lets the UI prompt for verification without a second request. */
  emailVerified: boolean;
  createdAt?: string | Date;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
  /**
   * Token version at issue time. Compared against the user's current value on
   * every request, so bumping it revokes tokens that have not yet expired.
   */
  tv?: number;
}

export interface SignupInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResponse {
  success: boolean;
  message?: string;
  user?: UserDTO;
}

export interface AuthenticatedRequest extends Request {
  user?: UserDTO;
}
