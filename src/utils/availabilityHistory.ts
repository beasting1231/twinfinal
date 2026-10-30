export interface HistoryState {
  status: 'available' | 'unavailable' | 'onRequest';
  timeSlot: string;
  signedInAt: string | null;
  signedOutAt: string | null;
}

interface CommitTime {
  seconds: number;
  nanoseconds: number;
}

export interface AvailabilityHistoryEvent {
  id: string;
  sourceRecordId: string;
  before: HistoryState | null;
  after: HistoryState | null;
  beforeVersion: CommitTime | null;
  afterVersion: CommitTime | null;
  committedAt: CommitTime;
  actorId: string | null;
  actorType: string;
}

export interface CurrentHistoryRecord {
  id: string;
  status?: string;
  timeSlot?: string;
  signedInAt?: string;
  signedOutAt?: string;
}

function normalizeRecord(record: CurrentHistoryRecord): HistoryState {
  return {
    status: record.status === 'unavailable' ? 'unavailable' : record.status === 'onRequest' ? 'onRequest' : 'available',
    timeSlot: record.timeSlot || '',
    signedInAt: record.signedInAt || null,
    signedOutAt: record.signedOutAt || null,
  };
}

function sameState(a: HistoryState | null, b: HistoryState | null) {
  return a === b || Boolean(a && b && a.status === b.status && a.timeSlot === b.timeSlot &&
    a.signedInAt === b.signedInAt && a.signedOutAt === b.signedOutAt);
}

function compareTime(a: CommitTime, b: CommitTime) {
  return a.seconds - b.seconds || a.nanoseconds - b.nanoseconds;
}

// Replay backwards from the unchanged live records, including slots that have
// never changed since recording started. Never assume they were signed out.
export function buildRecordedHistory(records: CurrentHistoryRecord[], events: AvailabilityHistoryEvent[]) {
  const states = new Map(records.map(record => [record.id, normalizeRecord(record)]));
  const ordered = events.filter(event => !sameState(event.before, event.after))
    .sort((a, b) => compareTime(b.committedAt, a.committedAt) || b.id.localeCompare(a.id));
  let consistent = true;
  const active = () => [...states.values()].some(state => state.status !== 'unavailable');
  const items = ordered.map(event => {
    // A no-op Firestore save can advance updateTime without emitting a trigger.
    // Compare state, not version continuity, or ordinary full-day saves produce
    // permanent false gap warnings for slots that were already available.
    if (!sameState(states.get(event.sourceRecordId) || null, event.after)) {
      consistent = false;
    }
    const activeAfter = active();
    if (event.before) states.set(event.sourceRecordId, event.before);
    else states.delete(event.sourceRecordId);
    const activeBefore = active();
    const dayTransition = activeBefore === activeAfter ? null : activeAfter ? 'signed-in' : 'signed-out';
    return {...event, dayTransition};
  });

  return {
    consistent,
    items: items.filter(event => event.before?.status !== event.after?.status ||
      event.before?.timeSlot !== event.after?.timeSlot).map(event => ({
      ...event,
      // Delayed/missing deliveries must not manufacture whole-day transitions.
      dayTransition: consistent ? event.dayTransition : null,
    })),
  };
}

export function formatSwissHistoryTime(value: CommitTime | string) {
  const date = typeof value === 'string' ? new Date(value) : new Date(value.seconds * 1000 + value.nanoseconds / 1e6);
  if (Number.isNaN(date.getTime())) return 'Time unavailable';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Zurich', day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(date);
}
