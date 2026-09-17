export interface HealthResponse {
  success: boolean;
  message: string;
  environment: string;
}

export interface ErrorResponse {
  success: boolean;
  message: string;
}

export class AppError extends Error {
  public statusCode: number;

  constructor(message: string, statusCode: number = 500) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
