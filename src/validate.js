import { resources } from './schema.js';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const isRealDate = (value) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value);
};

function checkValue(field, value, logins) {
  if (field.type === 'number') {
    const number = typeof value === 'string' ? Number(value.replace(/\s/g, '').replace(',', '.')) : value;
    return Number.isFinite(number) ? [number] : [null, 'must be a number'];
  }
  if (typeof value !== 'string') return [null, 'must be a string'];
  const clean = value.trim();
  const max = field.type === 'long' ? 5000 : 500;
  if (clean.length > max) return [null, `must be at most ${max} characters`];
  if (field.type === 'enum' && !field.options.includes(clean)) return [null, `must be one of: ${field.options.join(', ')}`];
  if (field.type === 'user' && !logins.includes(clean)) return [null, `unknown user, expected one of: ${logins.join(', ')}`];
  if (field.type === 'date' && !isRealDate(clean)) return [null, 'must be a date YYYY-MM-DD'];
  if (field.type === 'time' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(clean)) return [null, 'must be a time HH:MM'];
  if (field.type === 'url' && !/^https?:\/\/\S+$/i.test(clean)) return [null, 'must start with http:// or https://'];
  return [clean];
}

// Returns a clean copy of the input or throws a 400 with every problem found.
export function validate(name, input, { partial = false, logins = [] } = {}) {
  const { fields } = resources[name];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'Body must be a JSON object');
  }
  const errors = [];
  const data = {};
  for (const key of Object.keys(input)) {
    if (!Object.hasOwn(fields, key)) errors.push(`${key}: unknown field`);
  }
  for (const [key, field] of Object.entries(fields)) {
    const value = input[key];
    if (value === undefined) {
      if (!partial && field.required) errors.push(`${key}: is required`);
      continue;
    }
    if (value === null || (typeof value === 'string' && value.trim() === '')) {
      if (field.required) errors.push(`${key}: is required`);
      else data[key] = null;
      continue;
    }
    const [clean, problem] = checkValue(field, value, logins);
    if (problem) errors.push(`${key}: ${problem}`);
    else data[key] = clean;
  }
  if (errors.length) throw new HttpError(400, errors.join('; '), errors);
  return data;
}
