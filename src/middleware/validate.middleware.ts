import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import ApiError from '@utils/ApiError';

type ValidatePart = 'body' | 'params' | 'query';

/**
 * validate — Joi validation middleware factory.
 * @param schema  — Joi object schema
 * @param part    — which part of the request to validate (default: 'body')
 *
 * Usage: router.post('/', validate(createStationSchema), controller)
 */
export const validate =
  (schema: Joi.ObjectSchema, part: ValidatePart = 'body') =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const { error, value } = schema.validate(req[part], { abortEarly: false });

    if (error) {
      const errors = error.details.map((d) => d.message);
      next(ApiError.unprocessable(errors));
      return;
    }

    // Write validated + stripped + defaulted value back so downstream sees clean data.
    // req.query is a read-only getter in Express 5, so we mutate its contents in-place.
    if (part === 'query') {
      const qObj = req.query as Record<string, unknown>;
      // Remove keys that were stripped by the schema
      for (const k of Object.keys(qObj)) { if (!(k in value)) delete qObj[k]; }
      // Add/overwrite with validated+coerced values
      Object.assign(qObj, value);
    } else {
      (req as unknown as Record<string, unknown>)[part] = value;
    }
    next();
  };
