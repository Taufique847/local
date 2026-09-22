import bcrypt from 'bcryptjs';
import { User } from '../models/user.model';
import { RefreshToken } from '../models/refresh-token.model';
import { EmailVerification } from '../models/email-verification.model';
import { PasswordReset } from '../models/password-reset.model';
import { EmailService } from './email.service';
import { SignupInput, LoginInput, UserDTO, JwtPayload, IUser } from '../types/auth.types';
import { AppError } from '../types';
import {
  generateToken,
  generateRefreshToken,
  hashRefreshToken,
} from '../utils/token';
import { config } from '../config/env';
import { logger } from '../utils/logger';

const log = logger.child({ module: 'auth' });

export interface IssuedSession {
  user: UserDTO;
  token: string;
  refreshToken: string;
}

export class AuthService {
  /** How long an emailed verification link stays usable. */
  private static readonly VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

  /**
   * Much shorter than verification: this link grants a password change, so its
   * exposure window in an inbox or a proxy log should be small.
   */
  private static readonly PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

  private static toDto(user: IUser): UserDTO {
    return {
      id: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      businessId: user.businessId ? user.businessId.toString() : null,
      businessRole: user.businessRole ?? null,
      technicianId: user.technicianId ? user.technicianId.toString() : null,
      emailVerified: Boolean(user.emailVerifiedAt),
      createdAt: user.createdAt,
    };
  }

  /**
   * Issues a verification link and emails it.
   *
   * Any previously issued, unconsumed link is invalidated first, so only the most
   * recent email works — otherwise an old message forwarded to someone else
   * would still verify the address.
   */
  public static async sendVerificationEmail(userId: string): Promise<void> {
    const user = await User.findById(userId);
    if (!user || !user.isActive) {
      throw new AppError('Account not found or has been deactivated.', 404);
    }

    if (user.emailVerifiedAt) {
      throw new AppError('This email address is already verified.', 409);
    }

    await EmailVerification.updateMany(
      { userId: user._id, consumedAt: { $exists: false } },
      { $set: { consumedAt: new Date() } }
    );

    const rawToken = generateRefreshToken();

    await EmailVerification.create({
      userId: user._id,
      tokenHash: hashRefreshToken(rawToken),
      email: user.email,
      expiresAt: new Date(Date.now() + this.VERIFICATION_TTL_MS),
    });

    const link = `${config.frontendUrl}/verify-email?token=${encodeURIComponent(rawToken)}`;

    await EmailService.send({
      to: user.email,
      subject: 'Confirm your email address',
      text: [
        `Hi ${user.name},`,
        '',
        'Confirm your email address to finish setting up your BlueCollar AI account:',
        link,
        '',
        'This link expires in 24 hours. If you did not create an account, you can ignore this message.',
      ].join('\n'),
    });
  }

  /**
   * Consumes a verification token.
   *
   * The address recorded on the token must still match the account's current
   * email: if the user changed it after requesting the link, proving the old
   * address says nothing about the new one.
   */
  public static async confirmEmail(rawToken: string): Promise<UserDTO> {
    if (!rawToken) {
      throw new AppError('Verification token is missing.', 400);
    }

    const record = await EmailVerification.findOne({ tokenHash: hashRefreshToken(rawToken) });

    if (!record || record.consumedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new AppError('This verification link is invalid or has expired.', 400);
    }

    const user = await User.findById(record.userId);
    if (!user || !user.isActive) {
      throw new AppError('Account not found or has been deactivated.', 404);
    }

    if (user.email !== record.email) {
      throw new AppError(
        'This link was issued for a different email address. Request a new one.',
        400
      );
    }

    record.consumedAt = new Date();
    await record.save();

    if (!user.emailVerifiedAt) {
      user.emailVerifiedAt = new Date();
      await user.save();
      log.info('email_verified', { userId: user._id.toString() });
    }

    return this.toDto(user);
  }

  /**
   * Issues an access token plus a fresh refresh token.
   *
   * The access token carries the user's current `tokenVersion`, which is what
   * makes revocation possible for an otherwise stateless token.
   */
  private static async issueSession(
    user: IUser,
    context: { ip?: string; userAgent?: string } = {}
  ): Promise<IssuedSession> {
    const userDto = this.toDto(user);

    const payload: JwtPayload = {
      userId: userDto.id,
      email: userDto.email,
      role: userDto.role,
      tv: user.tokenVersion ?? 0,
    };

    const refreshToken = generateRefreshToken();

    await RefreshToken.create({
      userId: user._id,
      tokenHash: hashRefreshToken(refreshToken),
      expiresAt: new Date(Date.now() + config.refreshTokenDays * 24 * 60 * 60 * 1000),
      createdByIp: context.ip,
      userAgent: context.userAgent?.slice(0, 400),
    });

    return { user: userDto, token: generateToken(payload), refreshToken };
  }

  /**
   * Signs in a user document the caller has already authenticated by other
   * means — currently only accepting a staff invitation, where possession of the
   * emailed token is the proof.
   *
   * Exposed instead of making `issueSession` public so the set of ways a session
   * can be created stays small and greppable.
   */
  public static async startSessionForUser(
    user: IUser,
    context: { ip?: string; userAgent?: string } = {}
  ): Promise<IssuedSession> {
    return this.issueSession(user, context);
  }

  /**
   * Exchanges a refresh token for a new pair, invalidating the presented one.
   *
   * Rotation means a refresh token is single use. If a token that was already
   * rotated or revoked is presented, that is treated as theft — the whole
   * session family is dropped and `tokenVersion` is bumped so every outstanding
   * access token for the user stops working too.
   */
  public static async refreshSession(
    presentedToken: string,
    context: { ip?: string; userAgent?: string } = {}
  ): Promise<IssuedSession> {
    if (!presentedToken) {
      throw new AppError('No refresh token provided', 401);
    }

    const tokenHash = hashRefreshToken(presentedToken);
    const stored = await RefreshToken.findOne({ tokenHash });

    if (!stored) {
      throw new AppError('Session expired. Please log in again.', 401);
    }

    if (stored.revokedAt) {
      log.warn('refresh_token_reuse_detected', { userId: stored.userId.toString() });
      await this.revokeAllSessions(stored.userId.toString());
      throw new AppError('Session is no longer valid. Please log in again.', 401);
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new AppError('Session expired. Please log in again.', 401);
    }

    const user = await User.findById(stored.userId);
    if (!user || !user.isActive) {
      throw new AppError('Account not found or has been deactivated.', 401);
    }

    const issued = await this.issueSession(user, context);

    stored.revokedAt = new Date();
    stored.replacedByHash = hashRefreshToken(issued.refreshToken);
    await stored.save();

    return issued;
  }

  /** Revokes a single session. Used by logout on this device. */
  public static async revokeSession(presentedToken?: string): Promise<void> {
    if (!presentedToken) return;

    await RefreshToken.updateOne(
      { tokenHash: hashRefreshToken(presentedToken), revokedAt: { $exists: false } },
      { $set: { revokedAt: new Date() } }
    );
  }

  /**
   * Revokes every session for a user and invalidates outstanding access tokens.
   *
   * The `tokenVersion` bump is the part that matters: without it, already-issued
   * access tokens would keep working until they expired.
   */
  public static async revokeAllSessions(userId: string): Promise<void> {
    await Promise.all([
      RefreshToken.updateMany(
        { userId, revokedAt: { $exists: false } },
        { $set: { revokedAt: new Date() } }
      ),
      User.updateOne({ _id: userId }, { $inc: { tokenVersion: 1 } }),
    ]);

    log.info('all_sessions_revoked', { userId });
  }
  // Register a new user
  public static async signup(
    input: SignupInput,
    context: { ip?: string; userAgent?: string } = {}
  ): Promise<IssuedSession> {
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

    /**
     * Verification email is best effort at signup.
     *
     * A missing or broken email provider must not block account creation — the
     * user can request the link again later. The failure is logged rather than
     * swallowed silently so an operator can see that email is not working.
     */
    try {
      await this.sendVerificationEmail(newUser._id.toString());
    } catch (err: any) {
      log.error('signup_verification_email_failed', {
        userId: newUser._id.toString(),
        reason: err?.message,
      });
    }

    return this.issueSession(newUser, context);
  }

  // Authenticate an existing user
  public static async login(
    input: LoginInput,
    context: { ip?: string; userAgent?: string } = {}
  ): Promise<IssuedSession> {
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

    // Checked after the password so an attacker cannot use the response to learn
    // which addresses are registered.
    if (config.requireEmailVerification && !user.emailVerifiedAt) {
      throw new AppError(
        'Please confirm your email address before signing in. Check your inbox for the verification link.',
        403
      );
    }

    return this.issueSession(user, context);
  }

  /**
   * Starts a password reset.
   *
   * Always resolves, whether or not the address is registered. An endpoint that
   * reported "no such account" would be a free membership oracle for anyone
   * holding a list of email addresses — and it is a public, unauthenticated
   * endpoint, so that list can be tried at leisure.
   *
   * The consequence is that a genuine typo looks identical to success. That is
   * the right trade: the cost is one confused user checking their spelling, and
   * the alternative leaks who banks with which contractor.
   */
  public static async requestPasswordReset(
    email: string,
    context: { ip?: string } = {}
  ): Promise<void> {
    const normalizedEmail = (email || '').toLowerCase().trim();
    if (!normalizedEmail) {
      throw new AppError('Email is required', 400);
    }

    const user = await User.findOne({ email: normalizedEmail });

    if (!user || !user.isActive) {
      log.info('password_reset_requested_unknown_email', { ip: context.ip });
      return;
    }

    // Only the newest link may work. Without this, every link ever requested
    // stays live for its full hour, so one intercepted older email is enough.
    await PasswordReset.updateMany(
      { userId: user._id, consumedAt: { $exists: false } },
      { $set: { consumedAt: new Date() } }
    );

    const rawToken = generateRefreshToken();

    await PasswordReset.create({
      userId: user._id,
      tokenHash: hashRefreshToken(rawToken),
      email: user.email,
      expiresAt: new Date(Date.now() + this.PASSWORD_RESET_TTL_MS),
      requestedByIp: context.ip,
    });

    const link = `${config.frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

    try {
      await EmailService.send({
        to: user.email,
        subject: 'Reset your BlueCollar AI password',
        text: [
          `Hi ${user.name},`,
          '',
          'Use this link to choose a new password:',
          link,
          '',
          'The link expires in 1 hour and can only be used once.',
          '',
          'If you did not ask for this, you can ignore this message — your password has not changed.',
        ].join('\n'),
      });
    } catch (err: any) {
      /**
       * Logged, not surfaced.
       *
       * Propagating the provider's error would turn this endpoint back into the
       * enumeration oracle the silent-success behaviour above exists to prevent:
       * a registered address would fail loudly while an unregistered one returned
       * 200, which is exactly the signal being withheld.
       */
      log.error('password_reset_email_failed', {
        userId: user._id.toString(),
        reason: err?.message,
      });
      return;
    }

    log.info('password_reset_email_sent', { userId: user._id.toString() });
  }

  /**
   * Completes a password reset and drops every existing session.
   *
   * The revocation is the point, not a nicety. Someone resetting a password has
   * usually either forgotten it or suspects the account is compromised; leaving
   * the attacker's refresh token alive would make the reset cosmetic.
   */
  public static async resetPassword(
    rawToken: string,
    newPassword: string
  ): Promise<void> {
    if (!rawToken) {
      throw new AppError('Reset token is missing.', 400);
    }
    if (!newPassword || newPassword.length < 8) {
      throw new AppError('Password must be at least 8 characters long', 400);
    }

    const record = await PasswordReset.findOne({ tokenHash: hashRefreshToken(rawToken) });

    // One message for every failure, so a caller cannot tell an unknown token
    // from a spent or expired one.
    if (!record || record.consumedAt || record.expiresAt.getTime() <= Date.now()) {
      throw new AppError('This password reset link is invalid or has expired.', 400);
    }

    const user = await User.findById(record.userId);
    if (!user || !user.isActive) {
      throw new AppError('Account not found or has been deactivated.', 404);
    }

    if (user.email !== record.email) {
      throw new AppError(
        'This link was issued for a different email address. Request a new one.',
        400
      );
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);

    /**
     * Resetting the password also proves control of the address, so an account
     * still waiting on verification is verified here rather than being left
     * unable to log in with its new password when REQUIRE_EMAIL_VERIFICATION
     * is on.
     */
    if (!user.emailVerifiedAt) {
      user.emailVerifiedAt = new Date();
    }

    await user.save();

    // Consume before revoking, so a crash between the two cannot leave a usable
    // token behind.
    record.consumedAt = new Date();
    await record.save();

    await this.revokeAllSessions(user._id.toString());

    log.info('password_reset_completed', { userId: user._id.toString() });
  }

  // Get current authenticated user profile
  public static async getCurrentUser(userId: string): Promise<UserDTO> {
    const user = await User.findById(userId);
    if (!user || !user.isActive) {
      throw new AppError('User not found or account deactivated', 404);
    }

    return this.toDto(user);
  }
}
