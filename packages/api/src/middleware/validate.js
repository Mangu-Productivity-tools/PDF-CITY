import { errorBody } from '@epub2pdf/shared';

/**
 * Wrap a zod schema as express middleware. Validates `source` ('body' |
 * 'query' | 'params') and replaces it with the parsed (defaulted/coerced) value.
 */
export function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const detail = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
      return res.status(400).json(errorBody('VALIDATION_ERROR', detail));
    }
    req[source] = result.data;
    next();
  };
}
