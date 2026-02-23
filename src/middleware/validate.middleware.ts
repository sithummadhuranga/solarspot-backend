import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import ApiError from '@utils/ApiError';

type ValidatePart = 'body' | 'params' | 'query';

export const validate =
  (schema: Joi.ObjectSchema, part: ValidatePart = 'body') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const { error } = schema.validate(req[part], { abortEarly: false });

    if (error) {
      const errors = error.details.map((d) => d.message);
      next(ApiError.unprocessable(errors));
      return;
    }

    next();
  };
