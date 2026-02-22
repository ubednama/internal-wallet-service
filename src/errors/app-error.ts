export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public context?: Record<string, any>
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(400, message, context);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(404, message, context);
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(409, message, context);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class InternalError extends AppError {
  constructor(message: string, context?: Record<string, any>) {
    super(500, message, context);
    Object.setPrototypeOf(this, InternalError.prototype);
  }
}
