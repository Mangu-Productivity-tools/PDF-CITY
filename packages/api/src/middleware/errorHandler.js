import { errorBody, statusForCode } from '@epub2pdf/shared';

export class ApiError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, req, res, next) {
  if (err instanceof ApiError) {
    return res.status(statusForCode(err.code)).json(errorBody(err.code, err.message));
  }
  req.log?.error({ err }, 'unhandled error');
  // Never leak stack traces in the API response (spec: "no stack traces in API").
  return res.status(500).json(errorBody('INTERNAL_ERROR'));
}

export function notFoundHandler(req, res) {
  res.status(404).json(errorBody('NOT_FOUND', 'No such route.'));
}
