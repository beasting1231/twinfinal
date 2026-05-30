export const SWISS_TIME_ZONE = "Europe/Zurich";

export function formatSwissDateTime(value: string | Date): string | null {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SWISS_TIME_ZONE,
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const month = getPart("month");
  const day = getPart("day");
  const hour = getPart("hour");
  const minute = getPart("minute");

  if (!month || !day || !hour || !minute) {
    return null;
  }

  return `${month}/${day} ${hour}:${minute}`;
}

export function getSwissDateTime(date: Date, minuteOfDay: number): Date {
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const hours = Math.floor(minuteOfDay / 60);
  const minutes = minuteOfDay % 60;
  const utcGuess = new Date(Date.UTC(year, month, day, hours, minutes));

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SWISS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(utcGuess);

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  const swissAsUtc = Date.UTC(
    Number(getPart("year")),
    Number(getPart("month")) - 1,
    Number(getPart("day")),
    Number(getPart("hour")),
    Number(getPart("minute"))
  );

  return new Date(utcGuess.getTime() - (swissAsUtc - utcGuess.getTime()));
}
