import { renderWithChrome } from './chrome.js';
import { renderWithCalibre, isCalibreAvailable } from './calibre.js';
import { WorkerError } from '../lib/errors.js';

const ENGINES = {
  chrome: renderWithChrome,
  calibre: renderWithCalibre,
};

export async function render(engineName, args) {
  const engine = ENGINES[engineName];
  if (!engine) {
    throw new WorkerError('VALIDATION_ERROR', `Unknown engine "${engineName}".`);
  }
  return engine(args);
}

export { isCalibreAvailable };
