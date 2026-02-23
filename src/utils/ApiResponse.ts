import { Response } from 'express';

interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

/**
 * ApiResponse — standardised JSON response helpers.
 */
class ApiResponse {
  static success<T>(
    res: Response,
    data: T,
    message = 'Success',
    statusCode = 200
  ): Response {
    return res.status(statusCode).json({
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  static created<T>(res: Response, data: T, message = 'Created successfully'): Response {
    return ApiResponse.success(res, data, message, 201);
  }

  static noContent(res: Response): Response {
    return res.status(204).send();
  }

  static paginated<T>(
    res: Response,
    data: T[],
    pagination: PaginationMeta,
    message = 'Success'
  ): Response {
    return res.status(200).json({
      success: true,
      message,
      data,
      pagination,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * error — returns a plain error envelope object (does NOT send the response).
   * Usage: res.status(4xx).json(ApiResponse.error('CODE', 'message'))
   */
  static error(
    code: string,
    message: string
  ): { success: false; code: string; message: string; timestamp: string } {
    return {
      success: false,
      code,
      message,
      timestamp: new Date().toISOString(),
    };
  }
}

export default ApiResponse;
