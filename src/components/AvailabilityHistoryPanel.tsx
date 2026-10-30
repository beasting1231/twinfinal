import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, limit, onSnapshot, orderBy, query } from 'firebase/firestore';
import { db } from '../firebase/config';
import { buildRecordedHistory, formatSwissHistoryTime } from '../utils/availabilityHistory';
import type { AvailabilityHistoryEvent, CurrentHistoryRecord } from '../utils/availabilityHistory';

interface Props {
  date: string;
  pilotId: string;
  pilotName: string;
  records: CurrentHistoryRecord[];
}

export function AvailabilityHistoryPanel({ date, pilotId, pilotName, records }: Props) {
  const [events, setEvents] = useState<AvailabilityHistoryEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [eventLimit, setEventLimit] = useState(200);
  const [hasMore, setHasMore] = useState(false);
  const [actors, setActors] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    setFailed(false);
    return onSnapshot(query(
      collection(db, 'availabilityHistory', date, 'pilots', pilotId, 'events'),
      orderBy('committedAt', 'desc'), limit(eventLimit + 1),
    ), snapshot => {
      setEvents(snapshot.docs.slice(0, eventLimit).map(item => ({ ...item.data(), id: item.id }) as AvailabilityHistoryEvent));
      setHasMore(snapshot.size > eventLimit);
      setLoading(false);
    }, () => {
      setEvents([]);
      setFailed(true);
      setLoading(false);
    });
  }, [date, pilotId, eventLimit]);

  useEffect(() => {
    let cancelled = false;
    const ids = [...new Set(events.map(event => event.actorId).filter((id): id is string => Boolean(id)))];
    void Promise.all(ids.map(async id => {
      try {
        const profile = await getDoc(doc(db, 'userProfiles', id));
        return [id, profile.data()?.displayName || id] as const;
      } catch {
        return [id, id] as const;
      }
    })).then(entries => { if (!cancelled) setActors(Object.fromEntries(entries)); });
    return () => { cancelled = true; };
  }, [events]);

  const history = useMemo(() => buildRecordedHistory(records, events), [records, events]);
  const lastSavedIn = records.map(record => record.signedInAt).filter((value): value is string => Boolean(value)).sort().at(-1);
  const lastSavedOut = records.map(record => record.signedOutAt).filter((value): value is string => Boolean(value)).sort().at(-1);

  return <div className="text-xs">
    {loading ? <p role="status">Loading history…</p> : failed ? (
      <p role="alert" className="text-amber-700 dark:text-amber-300">Could not load history.</p>
    ) : <>
      {!history.consistent && <p role="status" className="mb-2 text-amber-700 dark:text-amber-300">
        Some changes may be missing.
      </p>}
      <div className="max-h-64 space-y-1 overflow-y-auto">
        {history.items.map(event => {
          const slot = event.after?.timeSlot || event.before?.timeSlot || 'unknown slot';
          const signedOut = !event.after || event.after.status === 'unavailable';
          const onRequest = event.after?.status === 'onRequest';
          const label = event.dayTransition === 'signed-out' ? 'Signed out for day'
            : event.dayTransition === 'signed-in' ? onRequest ? 'Signed in (on request)' : 'Signed in'
            : !event.after ? `Removed · ${slot}`
            : !event.before && signedOut ? `Marked unavailable · ${slot}`
            : onRequest ? `On request · ${slot}` : `${signedOut ? 'Signed out' : 'Signed in'} · ${slot}`;
          const actor = event.actorId === pilotId ? pilotName : event.actorId ? actors[event.actorId] || event.actorId
            : event.actorType === 'system' ? 'System' : 'Actor unavailable';
          return <div key={event.id} className={`rounded-md px-2 py-1.5 font-semibold text-white ${
            signedOut ? 'bg-red-600' : 'bg-green-600'
          }`}>
            <div>{label}</div>
            <div className="font-mono text-white/90">{formatSwissHistoryTime(event.committedAt)}</div>
            <div className="mt-0.5 break-words font-normal text-white/90">{actor === 'Actor unavailable' ? actor : `Changed by ${actor}`}</div>
          </div>;
        })}
        {!history.items.length && !(events.length === 0 && (lastSavedIn || lastSavedOut)) && <p className="text-gray-500 dark:text-zinc-400">No history yet.</p>}
      </div>
      {hasMore && <button type="button" onClick={() => setEventLimit(value => value + 200)}
        className="mt-2 underline">Load older changes</button>}
      {events.length === 0 && (lastSavedIn || lastSavedOut) && <div className="space-y-1">
        <p className="mb-2 text-gray-500 dark:text-zinc-400">Saved times · partial history</p>
        {lastSavedIn && <div className="rounded-md bg-green-600 px-2 py-1.5 font-semibold text-white">
          <div>Signed in</div>
          <div className="font-mono text-white/90">{formatSwissHistoryTime(lastSavedIn)}</div>
        </div>}
        {lastSavedOut && <div className="rounded-md bg-red-600 px-2 py-1.5 font-semibold text-white">
          <div>Signed out</div>
          <div className="font-mono text-white/90">{formatSwissHistoryTime(lastSavedOut)}</div>
        </div>}
      </div>}
    </>}
  </div>;
}
