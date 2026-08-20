import { errorBody } from '@epub2pdf/shared';
import { findApiKeyByRawValue } from '../lib/apiKeys.js';

export async function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json(errorBody('UNAUTHORIZED'));
  }
  try {
    const apiKey = await findApiKeyByRawValue(token);
    if (!apiKey) {
      return res.status(401).json(errorBody('UNAUTHORIZED'));
    }
    req.apiKey = apiKey;
    next();
  } catch (err) {
    next(err);
  }
}

export function requireScope(scope) {
  return (req, res, next) => {
    if (scope === 'convert' && req.apiKey.scope !== 'convert') {
      return res.status(403).json(errorBody('FORBIDDEN'));
    }
    next();
  };
}
