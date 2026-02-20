/**
 * ApiError — standardised operational error class.
 * All thrown errors in controllers/services should use this.
 */
class ApiError extends Error {
  public statusCode: number;
  public errors: string[];
  public isOperational: boolean;

  constructor(statusCode: number, message: string, errors: string[] = []) {
    super(message);
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(msg: string): ApiError {
    return new ApiError(400, msg);
  }

  static unauthorized(msg = 'Unauthorized'): ApiError {
    return new ApiError(401, msg);
  }

  static forbidden(msg = 'Forbidden'): ApiError {
    return new ApiError(403, msg);
  }

  static notFound(msg = 'Resource not found'): ApiError {
    return new ApiError(404, msg);
  }

  static conflict(msg: string): ApiError {
    return new ApiError(409, msg);
  }

  static unprocessable(errors: string[]): ApiError {
    return new ApiError(422, 'Validation failed', errors);
  }

  static internal(msg = 'Internal server error'): ApiError {
    return new ApiError(500, msg);
  }
}

export default ApiError;
