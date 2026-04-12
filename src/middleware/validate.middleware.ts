import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import ApiError from '@utils/ApiError';

type ValidatePart = 'body' | 'params' | 'query';


export const validate =
  (schema: Joi.ObjectSchema, part: ValidatePart = 'body') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req[part], { abortEarly: false });

    if (error) {
      const errors = error.details.map((d) => d.message);
      next(ApiError.unprocessable(errors));
      return;
    }

    if (part === 'query') {
      const qObj = req.query as Record<string, unknown>;
      for (const k of Object.keys(qObj)) { if (!(k in value)) delete qObj[k]; }
      Object.assign(qObj, value);
    } else {
      (req as unknown as Record<string, unknown>)[part] = value;
    }
    next();
  };
