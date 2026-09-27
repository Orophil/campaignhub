/**
 * All times are stored in UTC by the API and shown in IST (Asia/Kolkata, UTC+05:30,
 * no daylight saving) regardless of the viewer's browser time zone.
 */
export const IST_TZ = 'Asia/Kolkata';
const IST_OFFSET_MS = 330 * 60 * 1000;

const dateTimeFmt = new Intl.DateTimeFormat('en-IN', {
  timeZone: IST_TZ,
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});
const timeFmt = new Intl.DateTimeFormat('en-IN', { timeZone: IST_TZ, hour: 'numeric', minute: '2-digit', hour12: true });
const dayFmt = new Intl.DateTimeFormat('en-IN', { timeZone: IST_TZ, weekday: 'short', day: 'numeric', month: 'short' });

export function formatIST(iso: string | Date | null | undefined): string {
  if (!iso) return '—';
  return `${dateTimeFmt.format(new Date(iso))} IST`;
}

export function formatTimeIST(iso: string | Date): string {
  return timeFmt.format(new Date(iso));
}

export function formatDayIST(d: Date): string {
  return dayFmt.format(d);
}

/** "2026-10-01T15:30" (IST wall clock) for an <input type="datetime-local">. */
export function toISTInputValue(iso: string | Date | null | undefined): string {
  if (!iso) return '';
  const shifted = new Date(new Date(iso).getTime() + IST_OFFSET_MS);
  return shifted.toISOString().slice(0, 16);
}

/** Interprets an <input type="datetime-local"> value as IST and returns a UTC ISO string. */
export function fromISTInputValue(value: string): string | null {
  if (!value) return null;
  const d = new Date(`${value}:00+05:30`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Monday 00:00 IST of the week containing `d`, as a UTC Date. */
export function startOfWeekIST(d: Date): Date {
  const ist = new Date(d.getTime() + IST_OFFSET_MS);
  const dow = (ist.getUTCDay() + 6) % 7; // 0 = Monday
  const mondayIst = Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - dow);
  return new Date(mondayIst - IST_OFFSET_MS);
}

/** IST calendar-day key (YYYY-MM-DD) for grouping. */
export function istDayKey(d: string | Date): string {
  return new Date(new Date(d).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

export function relativeFromNow(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(diff);
  const units: [number, string][] = [
    [86400000, 'day'],
    [3600000, 'hour'],
    [60000, 'minute'],
  ];
  for (const [ms, name] of units) {
    if (abs >= ms) {
      const n = Math.round(abs / ms);
      return diff > 0 ? `in ${n} ${name}${n > 1 ? 's' : ''}` : `${n} ${name}${n > 1 ? 's' : ''} ago`;
    }
  }
  return diff > 0 ? 'in under a minute' : 'just now';
}
