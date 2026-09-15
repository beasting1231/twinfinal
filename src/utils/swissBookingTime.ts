const swissClock = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Europe/Zurich',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

/** Swiss civil time, independent of the visitor's timezone, including DST. */
export function getSwissBookingClock(now = new Date()) {
  const parts = Object.fromEntries(swissClock.formatToParts(now).map(({ type, value }) => [type, value]));
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    seconds: Number(parts.hour) * 3600 + Number(parts.minute) * 60 + Number(parts.second),
  };
}

export function isFutureSwissBooking(date: string, time: string, now = new Date()): boolean {
  const match = /^(\d{1,2}):(\d{2})$/.exec(time);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !match) return false;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return false;
  const clock = getSwissBookingClock(now);
  return date > clock.date || (date === clock.date && hour * 3600 + minute * 60 > clock.seconds);
}
