import bcrypt from 'bcryptjs';
import { User } from '../models/user.model';
import { SignupInput, LoginInput, UserDTO, JwtPayload } from '../types/auth.types';
import { AppError } from '../types';
import { generateToken } from '../utils/token';

export class AuthService {
  // Register a new user
  public static async signup(input: SignupInput): Promise<{ user: UserDTO; token: string }> {
    const { name, email, password } = input;

    // Basic input validations
    if (!name || !name.trim()) {
      throw new AppError('Name is required', 400);
    }
    if (!email || !email.trim()) {
      throw new AppError('Email is required', 400);
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
      throw new AppError('Please provide a valid email address', 400);
    }
    if (!password || password.length < 8) {
      throw new AppError('Password must be at least 8 characters long', 400);
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Check for existing user with this email
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      throw new AppError('An account with this email already exists', 400);
    }

    // Hash the password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create and save new user
    const newUser = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: 'user',
      isActive: true,
    });

    const userDto: UserDTO = {
      id: newUser._id.toString(),
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      createdAt: newUser.createdAt,
    };

    const payload: JwtPayload = {
      userId: userDto.id,
      email: userDto.email,
      role: userDto.role,
    };

    const token = generateToken(payload);

    return { user: userDto, token };
  }

  // Authenticate an existing user
  public static async login(input: LoginInput): Promise<{ user: UserDTO; token: string }> {
    const { email, password } = input;

    if (!email || !password) {
      throw new AppError('Email and password are required', 400);
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Find user and explicitly select passwordHash
    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
    if (!user || !user.isActive) {
      // Use generic message to prevent account enumeration
      throw new AppError('Invalid email or password', 401);
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      throw new AppError('Invalid email or password', 401);
    }

    const userDto: UserDTO = {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };

    const payload: JwtPayload = {
      userId: userDto.id,
      email: userDto.email,
      role: userDto.role,
    };

    const token = generateToken(payload);

    return { user: userDto, token };
  }

  // Get current authenticated user profile
  public static async getCurrentUser(userId: string): Promise<UserDTO> {
    const user = await User.findById(userId);
    if (!user || !user.isActive) {
      throw new AppError('User not found or account deactivated', 404);
    }

    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
    };
  }
}
