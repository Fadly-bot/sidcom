import { Request, Response, NextFunction } from 'express';
import { AnyZodObject, ZodError } from 'zod';
import { ValidationError, ErrorDetail } from '../errors/app-error.js';

interface RequestValidationSchemas {
  body?: AnyZodObject;
  query?: AnyZodObject;
  params?: AnyZodObject;
}

export function validateRequest(schemas: RequestValidationSchemas) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (schemas.params) {
        req.params = (await schemas.params.parseAsync(req.params)) as unknown as Request['params'];
      }
      if (schemas.query) {
        req.query = (await schemas.query.parseAsync(req.query)) as unknown as Request['query'];
      }
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const details: ErrorDetail[] = error.errors.map((err) => ({
          field: err.path.join('.'),
          message: err.message,
          code: err.code
        }));
        next(new ValidationError('Request validation failed', details));
      } else {
        next(error);
      }
    }
  };
}
