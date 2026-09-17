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
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

export interface UserDTO {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  createdAt?: string | Date;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
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
