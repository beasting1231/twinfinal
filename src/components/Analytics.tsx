import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  addDays,
  addMonths,
  addWeeks,
  addYears,
  format,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase/config";
import { useBookingSourceColors } from "../hooks/useBookingSourceColors";
import { useBookings } from "../hooks/useBookings";
import type { BookingRequest } from "../types";
import { SWISS_TIME_ZONE } from "../utils/timezone";

type TimeScale = "week" | "month" | "year";

interface ChartPoint {
  key: string;
  label: string;
  fullLabel: string;
  count: number;
}

interface ChartObservation {
  date: Date;
  count: number;
}

interface FormOption {
  id: string;
  name: string;
}

interface PeriodOption {
  value: string;
  label: string;
}

interface PieDatum {
  name: string;
  count: number;
  color: string;
}

interface LineChartCardProps {
  title: string;
  data: ChartPoint[];
  loading: boolean;
  error: boolean;
  accentColor: string;
  gradientId: string;
  singularLabel: string;
  pluralLabel: string;
  timeScale: TimeScale;
  control?: ReactNode;
}

const MAIN_FORM: FormOption = { id: "main", name: "Main Booking Form" };

const PIE_COLORS = [
  "#2563eb",
  "#059669",
  "#d97706",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#4d7c0f",
  "#ea580c",
  "#475569",
];

const TIME_SCALES: Array<{ value: TimeScale; label: string }> = [
  { value: "week", label: "Week" },
  { value: "month", label: "Month" },
  { value: "year", label: "Year" },
];

function TimeScaleControl({
  value,
  onChange,
  ariaLabel,
}: {
  value: TimeScale;
  onChange: (value: TimeScale) => void;
  ariaLabel: string;
}) {
  return (
    <div
      className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-1 dark:border-zinc-700 dark:bg-zinc-950"
      aria-label={ariaLabel}
    >
      {TIME_SCALES.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          aria-pressed={value === option.value}
          className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
            value === option.value
              ? "bg-gray-950 text-white shadow-sm dark:bg-white dark:text-zinc-950"
              : "text-gray-500 hover:bg-white hover:text-gray-950 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-white"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function toDate(value: unknown): Date | null {
  if (!value) return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof value !== "object") return null;

  const timestamp = value as {
    toDate?: () => Date;
    seconds?: number;
    nanoseconds?: number;
  };

  if (typeof timestamp.toDate === "function") {
    const date = timestamp.toDate();
    return Number.isNaN(date.getTime()) ? null : date;
  }

  if (typeof timestamp.seconds === "number") {
    return new Date(timestamp.seconds * 1000 + (timestamp.nanoseconds ?? 0) / 1_000_000);
  }

  return null;
}

function getSwissCalendarDate() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SWISS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const getPart = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);

  return new Date(getPart("year"), getPart("month") - 1, getPart("day"));
}

function getSwissDateKey(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SWISS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function getSwissCalendarDateFor(date: Date) {
  const [year, month, day] = getSwissDateKey(date).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function getScheduledBookingDate(dateString: string) {
  const [year, month, day] = dateString.split("-").map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getPeriodStart(date: Date, timeScale: TimeScale) {
  if (timeScale === "week") return startOfWeek(date, { weekStartsOn: 1 });
  if (timeScale === "month") return startOfMonth(date);
  return startOfYear(date);
}

function getPeriodKey(date: Date, timeScale: TimeScale) {
  const periodStart = getPeriodStart(date, timeScale);
  if (timeScale === "week") return format(periodStart, "yyyy-MM-dd");
  if (timeScale === "month") return format(periodStart, "yyyy-MM");
  return format(periodStart, "yyyy");
}

function buildPeriodOptions(dates: Date[], timeScale: TimeScale): PeriodOption[] {
  const today = getSwissCalendarDate();
  const currentPeriod = getPeriodStart(today, timeScale);
  const earliestDate = dates.reduce<Date | null>(
    (earliest, date) => (!earliest || date.getTime() < earliest.getTime() ? date : earliest),
    null
  );
  const firstPeriod = earliestDate
    ? getPeriodStart(earliestDate, timeScale)
    : currentPeriod;
  const periods: Date[] = [];

  for (
    let period = firstPeriod;
    period.getTime() <= currentPeriod.getTime();
    period = timeScale === "week" ? addWeeks(period, 1) : timeScale === "month" ? addMonths(period, 1) : addYears(period, 1)
  ) {
    periods.push(period);
  }

  return periods.reverse().map((period) => ({
    value: getPeriodKey(period, timeScale),
    label:
      timeScale === "week"
        ? `${format(period, "MMM d")} – ${format(addDays(period, 6), "MMM d, yyyy")}`
        : timeScale === "month"
        ? format(period, "MMMM yyyy")
        : format(period, "yyyy"),
  }));
}

function getRequestForm(request: BookingRequest, forms: FormOption[]): FormOption | null {
  const source = request.bookingSource?.trim();

  if (request.formId) {
    const currentForm = forms.find((form) => form.id === request.formId);
    return {
      id: request.formId,
      name: request.formName || currentForm?.name || (source === "Online" ? MAIN_FORM.name : source) || "Unknown form",
    };
  }

  if (source === "Online") return MAIN_FORM;

  if (source?.toLowerCase().endsWith(" form")) {
    const sourceName = source.slice(0, -5).trim();
    const currentForm = forms.find((form) => form.name.toLowerCase() === sourceName.toLowerCase());
    return currentForm ?? { id: `legacy:${source.toLowerCase()}`, name: sourceName || source };
  }

  return null;
}

function buildChartData(observations: ChartObservation[], timeScale: TimeScale): ChartPoint[] {
  const dates = observations.map((observation) => observation.date);
  const today = getSwissCalendarDate();
  const isYear = timeScale === "year";
  const visiblePeriodCount = timeScale === "week" ? 7 : timeScale === "month" ? 30 : 12;
  const defaultStart = isYear
    ? subMonths(startOfMonth(today), visiblePeriodCount - 1)
    : subDays(today, visiblePeriodCount - 1);
  const earliestDate = dates.reduce<Date | null>(
    (earliest, date) => (!earliest || date.getTime() < earliest.getTime() ? date : earliest),
    null
  );
  const earliestPeriod = earliestDate
    ? isYear
      ? startOfMonth(earliestDate)
      : earliestDate
    : defaultStart;
  const start = earliestPeriod.getTime() < defaultStart.getTime() ? earliestPeriod : defaultStart;
  const end = isYear ? startOfMonth(today) : today;
  const periods: Date[] = [];

  for (let period = start; period.getTime() <= end.getTime(); period = isYear ? addMonths(period, 1) : addDays(period, 1)) {
    periods.push(period);
  }

  const counts = new Map<string, number>();
  observations.forEach((observation) => {
    const key = format(observation.date, isYear ? "yyyy-MM" : "yyyy-MM-dd");
    counts.set(key, (counts.get(key) ?? 0) + observation.count);
  });

  return periods.map((period) => {
    const key = isYear ? format(period, "yyyy-MM") : format(period, "yyyy-MM-dd");
    return {
      key,
      label:
        timeScale === "year"
          ? format(period, "MMM yy")
          : timeScale === "week"
          ? format(period, "MMM d")
          : format(period, "d"),
      fullLabel: format(period, isYear ? "MMMM yyyy" : "EEE, MMM d"),
      count: counts.get(key) ?? 0,
    };
  });
}

function LineChartCard({
  title,
  data,
  loading,
  error,
  accentColor,
  gradientId,
  singularLabel,
  pluralLabel,
  timeScale,
  control,
}: LineChartCardProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const visiblePointCount = timeScale === "week" ? 7 : timeScale === "month" ? 30 : 12;
  const total = data.slice(-visiblePointCount).reduce((sum, point) => sum + point.count, 0);
  const rawMaximum = Math.max(...data.map((point) => point.count), 1);
  const chartMaximum = Math.max(4, Math.ceil(rawMaximum / 4) * 4);
  const yTicks = [chartMaximum, chartMaximum * 0.75, chartMaximum * 0.5, chartMaximum * 0.25, 0];
  const labelInterval = timeScale === "month" ? 5 : 1;

  const minimumPlotWidth = 900;
  const height = 360;
  const padding = { top: 24, right: 24, bottom: 48, left: 12 };
  const minimumPointSpacing = timeScale === "week" ? 138 : timeScale === "month" ? 31 : 80;
  const availableMinimumWidth = minimumPlotWidth - padding.left - padding.right;
  const pointSpacing = Math.max(
    minimumPointSpacing,
    availableMinimumWidth / Math.max(data.length - 1, 1)
  );
  const plotWidth = Math.max(availableMinimumWidth, Math.max(data.length - 1, 1) * pointSpacing);
  const width = padding.left + plotWidth + padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const getX = (index: number) => padding.left + index * pointSpacing;
  const getY = (count: number) => padding.top + plotHeight - (count / chartMaximum) * plotHeight;
  const linePath = data
    .map((point, index) => `${index === 0 ? "M" : "L"} ${getX(index)} ${getY(point.count)}`)
    .join(" ");
  const areaPath = data.length
    ? `${linePath} L ${getX(data.length - 1)} ${padding.top + plotHeight} L ${getX(0)} ${
        padding.top + plotHeight
      } Z`
    : "";

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollLeft = container.scrollWidth;
    }
  }, [data.length]);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-5 dark:border-zinc-800 sm:flex-row sm:items-start sm:justify-between sm:px-7">
        <div>
          <h2 className="text-sm font-semibold text-gray-950 dark:text-white">{title}</h2>
        </div>
        <div className="flex items-center justify-between gap-5 sm:justify-end">
          {control}
          <div className="min-w-16 text-right">
            <div className="text-3xl font-bold tabular-nums text-gray-950 dark:text-white">
              {loading ? "—" : total}
            </div>
            <div className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-zinc-500">Total</div>
          </div>
        </div>
      </div>

      <div className="relative px-2 py-5 sm:px-5">
        {loading ? (
          <div className="flex h-[360px] min-w-[680px] items-center justify-center">
            <div
              className="h-7 w-7 animate-spin rounded-full border-2 border-gray-200 dark:border-zinc-700"
              style={{ borderTopColor: accentColor }}
            />
          </div>
        ) : error ? (
          <div className="flex h-[360px] min-w-[680px] items-center justify-center text-sm text-red-600 dark:text-red-400">
            Unable to load analytics data.
          </div>
        ) : (
          <div className="flex min-w-0">
            <svg viewBox={`0 0 48 ${height}`} className="h-[360px] w-12 shrink-0" aria-hidden="true">
              {yTicks.map((tick) => {
                const y = getY(tick);
                return (
                  <text
                    key={tick}
                    x="40"
                    y={y + 4}
                    textAnchor="end"
                    className="fill-gray-400 text-[11px] dark:fill-zinc-500"
                  >
                    {tick}
                  </text>
                );
              })}
            </svg>
            <div ref={scrollContainerRef} className="min-w-0 flex-1 overflow-x-auto">
              <svg
                viewBox={`0 0 ${width} ${height}`}
                width={width}
                height={height}
                className="min-w-full max-w-none"
                role="img"
                aria-label={`Line chart showing the latest ${total} ${pluralLabel.toLowerCase()}; scroll left for older data`}
                onMouseLeave={() => setHoveredIndex(null)}
              >
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={accentColor} stopOpacity="0.22" />
                    <stop offset="100%" stopColor={accentColor} stopOpacity="0" />
                  </linearGradient>
                </defs>

                {yTicks.map((tick) => {
                  const y = getY(tick);
                  return (
                    <line
                      key={tick}
                      x1="0"
                      y1={y}
                      x2={width - padding.right}
                      y2={y}
                      className="stroke-gray-100 dark:stroke-zinc-800"
                    />
                  );
                })}

                <path d={areaPath} fill={`url(#${gradientId})`} />
                <path
                  d={linePath}
                  fill="none"
                  stroke={accentColor}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />

                {data.map((point, index) => {
              const x = getX(index);
              const y = getY(point.count);
              const showLabel = index % labelInterval === 0 || index === data.length - 1;
              const isHovered = hoveredIndex === index;

                  return (
                    <g key={point.key}>
                  {showLabel && (
                    <text
                      x={x}
                      y={height - 16}
                      textAnchor="middle"
                      className="fill-gray-400 text-[11px] dark:fill-zinc-500"
                    >
                      {point.label}
                    </text>
                  )}
                  <circle
                    cx={x}
                    cy={y}
                    r="12"
                    fill="transparent"
                    className="cursor-pointer"
                    tabIndex={0}
                    aria-label={`${point.fullLabel}: ${point.count} ${point.count === 1 ? singularLabel : pluralLabel}`}
                    onMouseEnter={() => setHoveredIndex(index)}
                    onFocus={() => setHoveredIndex(index)}
                    onBlur={() => setHoveredIndex(null)}
                  />
                  <circle
                    cx={x}
                    cy={y}
                    r={isHovered ? 5 : 3}
                    fill={accentColor}
                    stroke="white"
                    strokeWidth="2"
                    className="pointer-events-none dark:stroke-zinc-900"
                  />
                  {isHovered && (
                    <g className="pointer-events-none">
                      <line
                        x1={x}
                        y1={padding.top}
                        x2={x}
                        y2={padding.top + plotHeight}
                        stroke={accentColor}
                        strokeOpacity="0.2"
                        strokeDasharray="4 4"
                      />
                      <rect
                        x={Math.min(Math.max(x - 60, padding.left), width - padding.right - 120)}
                        y={Math.max(y - 58, 8)}
                        width="120"
                        height="42"
                        rx="8"
                        className="fill-gray-950 dark:fill-white"
                      />
                      <text
                        x={Math.min(Math.max(x, padding.left + 60), width - padding.right - 60)}
                        y={Math.max(y - 40, 26)}
                        textAnchor="middle"
                        className="fill-white text-[10px] dark:fill-zinc-500"
                      >
                        {point.fullLabel}
                      </text>
                      <text
                        x={Math.min(Math.max(x, padding.left + 60), width - padding.right - 60)}
                        y={Math.max(y - 25, 41)}
                        textAnchor="middle"
                        className="fill-white text-xs font-semibold dark:fill-zinc-950"
                      >
                        {point.count} {point.count === 1 ? singularLabel : pluralLabel}
                      </text>
                    </g>
                  )}
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function PieChartCard({
  data,
  loading,
  error,
  control,
}: {
  data: PieDatum[];
  loading: boolean;
  error: boolean;
  control: ReactNode;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [showLegendTopFade, setShowLegendTopFade] = useState(false);
  const [showLegendBottomFade, setShowLegendBottomFade] = useState(false);
  const legendRef = useRef<HTMLDivElement>(null);
  const total = data.reduce((sum, item) => sum + item.count, 0);
  let cumulativePercentage = 0;
  const segments = data.map((item, index) => {
    const percentage = total > 0 ? (item.count / total) * 100 : 0;
    const segment = { ...item, index, percentage, offset: cumulativePercentage };
    cumulativePercentage += percentage;
    return segment;
  });
  const hoveredItem = hoveredIndex === null ? null : segments[hoveredIndex];

  const updateLegendFade = (element: HTMLDivElement | null) => {
    if (!element) return;
    setShowLegendTopFade(element.scrollTop > 2);
    setShowLegendBottomFade(element.scrollTop + element.clientHeight < element.scrollHeight - 2);
  };

  useEffect(() => {
    const legend = legendRef.current;
    if (!legend) return;

    updateLegendFade(legend);
    const resizeObserver = new ResizeObserver(() => updateLegendFade(legend));
    resizeObserver.observe(legend);
    return () => resizeObserver.disconnect();
  }, [data.length]);

  return (
    <section className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex flex-col gap-4 border-b border-gray-100 px-5 py-5 dark:border-zinc-800 sm:flex-row sm:items-start sm:justify-between sm:px-7">
        <h2 className="text-sm font-semibold text-gray-950 dark:text-white">Booking sources</h2>
        {control}
      </div>

      {loading ? (
        <div className="flex h-[420px] items-center justify-center">
          <div className="h-7 w-7 animate-spin rounded-full border-2 border-gray-200 border-t-blue-600 dark:border-zinc-700 dark:border-t-blue-400" />
        </div>
      ) : error ? (
        <div className="flex h-[420px] items-center justify-center text-sm text-red-600 dark:text-red-400">
          Unable to load booking-source analytics.
        </div>
      ) : total === 0 ? (
        <div className="flex h-[420px] items-center justify-center text-sm text-gray-500 dark:text-zinc-400">
          No bookings in this period.
        </div>
      ) : (
        <div className="grid gap-4 px-5 py-7 lg:grid-cols-[minmax(320px,480px)_1fr] lg:items-center lg:px-8">
          <div className="relative mx-auto aspect-square w-full max-w-[420px]">
            <svg
              viewBox="0 0 360 360"
              className="h-full w-full"
              role="img"
              aria-label={`Pie chart showing ${total} bookings split across ${data.length} booking sources`}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <circle
                cx="180"
                cy="180"
                r="112"
                fill="none"
                strokeWidth="76"
                className="stroke-gray-100 dark:stroke-zinc-800"
              />
              {segments.map((segment) => {
                const isHovered = hoveredIndex === segment.index;

                return (
                  <circle
                    key={segment.name}
                    cx="180"
                    cy="180"
                    r="112"
                    fill="none"
                    pathLength="100"
                    stroke={segment.color}
                    strokeWidth="76"
                    strokeDasharray={`${segment.percentage} ${100 - segment.percentage}`}
                    strokeDashoffset={-segment.offset}
                    strokeLinecap="butt"
                    transform="rotate(-90 180 180)"
                    className="transition-[filter] duration-150"
                    style={{ filter: isHovered ? "brightness(0.9)" : "none" }}
                    aria-label={`${segment.name}: ${segment.count} bookings`}
                    onMouseEnter={() => setHoveredIndex(segment.index)}
                  />
                );
              })}
            </svg>

            <div className="pointer-events-none absolute left-1/2 top-1/2 w-36 -translate-x-1/2 -translate-y-1/2 text-center">
              {hoveredItem ? (
                <>
                  <div className="truncate text-xs font-semibold text-gray-500 dark:text-zinc-400" title={hoveredItem.name}>
                    {hoveredItem.name}
                  </div>
                  <div className="mt-1 text-3xl font-bold tabular-nums text-gray-950 dark:text-white">
                    {hoveredItem.count}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-zinc-500">
                    {hoveredItem.count === 1 ? "booking" : "bookings"} · {hoveredItem.percentage.toFixed(1)}%
                  </div>
                </>
              ) : (
                <>
                  <div className="text-3xl font-bold tabular-nums text-gray-950 dark:text-white">{total}</div>
                  <div className="text-xs font-medium uppercase tracking-wider text-gray-400 dark:text-zinc-500">
                    Total bookings
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="relative h-[420px] min-h-0">
            <div
              ref={legendRef}
              onScroll={(event) => updateLegendFade(event.currentTarget)}
              className="grid h-full content-start gap-2 overflow-y-auto pb-12 pr-2 sm:grid-cols-2 lg:grid-cols-1"
            >
              {segments.map((segment) => (
                <div
                  key={segment.name}
                  onMouseEnter={() => setHoveredIndex(segment.index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                    hoveredIndex === segment.index ? "bg-gray-100 dark:bg-zinc-800" : "hover:bg-gray-50 dark:hover:bg-zinc-800/60"
                  }`}
                >
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800 dark:text-zinc-200">
                    {segment.name}
                  </span>
                  <span className="text-sm tabular-nums text-gray-500 dark:text-zinc-400">{segment.count}</span>
                  <span className="w-11 text-right text-xs tabular-nums text-gray-400 dark:text-zinc-500">
                    {segment.percentage.toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
            {showLegendTopFade && (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-white via-white/90 to-transparent dark:from-zinc-900 dark:via-zinc-900/90" />
            )}
            {showLegendBottomFade && (
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-white via-white/90 to-transparent dark:from-zinc-900 dark:via-zinc-900/90" />
            )}
          </div>
        </div>
      )}
    </section>
  );
}

export function Analytics() {
  const [bookingsTimeScale, setBookingsTimeScale] = useState<TimeScale>("month");
  const [requestsTimeScale, setRequestsTimeScale] = useState<TimeScale>("month");
  const [sourcesTimeScale, setSourcesTimeScale] = useState<TimeScale>("month");
  const [selectedSourcePeriod, setSelectedSourcePeriod] = useState(() =>
    getPeriodKey(getSwissCalendarDate(), "month")
  );
  const [selectedFormId, setSelectedFormId] = useState("all");
  const [requests, setRequests] = useState<BookingRequest[]>([]);
  const [forms, setForms] = useState<FormOption[]>([MAIN_FORM]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState(false);
  const { bookings, loading: bookingsLoading, error: bookingsError } = useBookings();
  const { sourceColors } = useBookingSourceColors();

  useEffect(() => {
    const unsubscribeRequests = onSnapshot(
      collection(db, "bookingRequests"),
      (snapshot) => {
        setRequests(
          snapshot.docs.map((requestDoc) => ({
            id: requestDoc.id,
            ...requestDoc.data(),
          })) as BookingRequest[]
        );
        setRequestsError(false);
        setRequestsLoading(false);
      },
      (error) => {
        console.error("Error loading request analytics:", error);
        setRequestsError(true);
        setRequestsLoading(false);
      }
    );

    const unsubscribeForms = onSnapshot(
      collection(db, "bookingForms"),
      (snapshot) => {
        const customForms = snapshot.docs
          .map((formDoc) => ({ id: formDoc.id, name: String(formDoc.data().name || "Unnamed form") }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setForms([MAIN_FORM, ...customForms]);
      },
      (error) => {
        console.error("Error loading analytics form filters:", error);
      }
    );

    return () => {
      unsubscribeRequests();
      unsubscribeForms();
    };
  }, []);

  const bookingEntries = useMemo(
    () =>
      bookings
        .filter(
          (booking) =>
            !booking.isBlocked &&
            booking.bookingSource !== "Blocked" &&
            booking.bookingStatus !== "deleted" &&
            booking.bookingStatus !== "cancelled"
        )
        .flatMap((booking) => {
          const date = getScheduledBookingDate(booking.date);
          const passengerCount = Number(booking.numberOfPeople);
          const count = Number.isFinite(passengerCount) && passengerCount > 0
            ? passengerCount
            : Math.max(Number(booking.span) || 1, 1);

          return date
            ? [{ date, count, source: booking.bookingSource?.trim() || "Unknown" }]
            : [];
        }),
    [bookings]
  );
  const bookingDates = useMemo(() => bookingEntries.map((entry) => entry.date), [bookingEntries]);
  const bookingObservations = useMemo(
    () => bookingEntries.map((entry) => ({ date: entry.date, count: entry.count })),
    [bookingEntries]
  );

  const formRequests = useMemo(
    () =>
      requests.flatMap((request) => {
        const form = getRequestForm(request, forms);
        return form ? [{ request, form }] : [];
      }),
    [forms, requests]
  );

  const formOptions = useMemo(() => {
    const options = new Map(forms.map((form) => [form.id, form]));
    formRequests.forEach(({ form }) => options.set(form.id, form));
    return Array.from(options.values());
  }, [formRequests, forms]);

  const requestObservations = useMemo(
    () =>
      formRequests
        .filter(({ form }) => selectedFormId === "all" || form.id === selectedFormId)
        .map(({ request }) => toDate(request.createdAt))
        .filter((date): date is Date => date !== null)
        .map((date) => ({ date: getSwissCalendarDateFor(date), count: 1 })),
    [formRequests, selectedFormId]
  );

  const bookingsChartData = useMemo(
    () => buildChartData(bookingObservations, bookingsTimeScale),
    [bookingObservations, bookingsTimeScale]
  );
  const requestsChartData = useMemo(
    () => buildChartData(requestObservations, requestsTimeScale),
    [requestObservations, requestsTimeScale]
  );
  const sourcePeriodOptions = useMemo(
    () => buildPeriodOptions(bookingDates, sourcesTimeScale),
    [bookingDates, sourcesTimeScale]
  );
  const sourcePieData = useMemo(() => {
    const counts = new Map<string, number>();

    bookingEntries.forEach((entry) => {
      if (getPeriodKey(entry.date, sourcesTimeScale) !== selectedSourcePeriod) return;
      counts.set(entry.source, (counts.get(entry.source) ?? 0) + entry.count);
    });

    const sourceEntries = Array.from(counts.entries());
    const total = sourceEntries.reduce((sum, [, count]) => sum + count, 0);
    const primarySources: Array<[string, number]> = [];
    let otherCount = 0;

    sourceEntries.forEach(([name, count]) => {
      if (total > 0 && count / total < 0.01) {
        otherCount += count;
      } else {
        primarySources.push([name, count]);
      }
    });

    const pieData = primarySources
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map<PieDatum>(([name, count], index) => ({
        name,
        count,
        color: sourceColors.get(name) || PIE_COLORS[index % PIE_COLORS.length],
      }));

    if (otherCount > 0) {
      pieData.push({
        name: "Other (<1% each)",
        count: otherCount,
        color: "#9ca3af",
      });
    }

    return pieData;
  }, [bookingEntries, selectedSourcePeriod, sourceColors, sourcesTimeScale]);

  return (
    <main className="min-h-full bg-gray-50 px-4 py-6 dark:bg-zinc-950 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em] text-blue-600 dark:text-blue-400">
              Booking activity
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-gray-950 dark:text-white">Analytics</h1>
          </div>
        </div>

        <div className="space-y-6">
          <LineChartCard
            key={`bookings-${bookingsTimeScale}`}
            title="Bookings"
            data={bookingsChartData}
            loading={bookingsLoading && bookings.length === 0}
            error={Boolean(bookingsError) && bookings.length === 0}
            accentColor="#2563eb"
            gradientId="bookings-area"
            singularLabel="booking"
            pluralLabel="bookings"
            timeScale={bookingsTimeScale}
            control={
              <TimeScaleControl
                value={bookingsTimeScale}
                onChange={setBookingsTimeScale}
                ariaLabel="Bookings time scale"
              />
            }
          />

          <LineChartCard
            key={`requests-${requestsTimeScale}-${selectedFormId}`}
            title="Form requests received"
            data={requestsChartData}
            loading={requestsLoading}
            error={requestsError}
            accentColor="#059669"
            gradientId="requests-area"
            singularLabel="request"
            pluralLabel="requests"
            timeScale={requestsTimeScale}
            control={
              <div className="flex flex-wrap items-end justify-end gap-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-500 dark:text-zinc-400">
                  Form
                  <select
                    value={selectedFormId}
                    onChange={(event) => setSelectedFormId(event.target.value)}
                    className="min-w-44 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                  >
                    <option value="all">All forms</option>
                    {formOptions.map((form) => (
                      <option key={form.id} value={form.id}>
                        {form.name}
                      </option>
                    ))}
                  </select>
                </label>
                <TimeScaleControl
                  value={requestsTimeScale}
                  onChange={setRequestsTimeScale}
                  ariaLabel="Form requests time scale"
                />
              </div>
            }
          />

          <PieChartCard
            key={`${sourcesTimeScale}-${selectedSourcePeriod}`}
            data={sourcePieData}
            loading={bookingsLoading && bookings.length === 0}
            error={Boolean(bookingsError) && bookings.length === 0}
            control={
              <div className="flex flex-wrap items-end justify-end gap-2">
                <label className="flex flex-col gap-1 text-xs font-medium text-gray-500 dark:text-zinc-400">
                  Period
                  <select
                    value={selectedSourcePeriod}
                    onChange={(event) => setSelectedSourcePeriod(event.target.value)}
                    className="min-w-52 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-950 dark:text-white"
                  >
                    {sourcePeriodOptions.map((period) => (
                      <option key={period.value} value={period.value}>
                        {period.label}
                      </option>
                    ))}
                  </select>
                </label>
                <TimeScaleControl
                  value={sourcesTimeScale}
                  onChange={(timeScale) => {
                    setSourcesTimeScale(timeScale);
                    setSelectedSourcePeriod(getPeriodKey(getSwissCalendarDate(), timeScale));
                  }}
                  ariaLabel="Booking sources time scale"
                />
              </div>
            }
          />
        </div>
      </div>
    </main>
  );
}
