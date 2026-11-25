// The team lives in one time zone. UTC_OFFSET is in hours (Astana is +5).
export function localNow(env, now = new Date()) {
  const offset = Number(env.UTC_OFFSET ?? 5);
  return new Date(now.getTime() + offset * 3600_000);
}

export const today = (env, now) => localNow(env, now).toISOString().slice(0, 10);

export function addDays(isoDate, days) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
