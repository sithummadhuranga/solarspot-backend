import { Request, Response, NextFunction } from 'express';

/**
 * Wraps an async route handler and forwards any thrown errors to Express's next().
 * Eliminates the need for try/catch in every controller.
 *
 * @example
 * router.get('/', asyncHandler(async (req, res) => { ... }))
 */
const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

export default asyncHandler;
