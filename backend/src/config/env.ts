import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

export interface AppConfig {
  port: number;
  nodeEnv: string;
  frontendUrl: string;
  isProduction: boolean;
  mongoUri: string;
  jwtSecret: string;
  jwtExpiresIn: string;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioPhoneNumber?: string;
  twilioWebhookBaseUrl?: string;
}

const parsePort = (val: string | undefined, defaultPort: number): number => {
  if (!val) return defaultPort;
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultPort : parsed;
};

export const config: AppConfig = {
  port: parsePort(process.env.PORT, 5000),
  nodeEnv: process.env.NODE_ENV || 'development',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  isProduction: process.env.NODE_ENV === 'production',
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/bluecollar_ai',
  jwtSecret: process.env.JWT_SECRET || 'super_secret_jwt_key_dev_mode_bluecollar_ai_2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  twilioAccountSid: process.env.TWILIO_ACCOUNT_SID,
  twilioAuthToken: process.env.TWILIO_AUTH_TOKEN,
  twilioPhoneNumber: process.env.TWILIO_PHONE_NUMBER,
  twilioWebhookBaseUrl: process.env.TWILIO_WEBHOOK_BASE_URL || 'http://localhost:5000',
};
