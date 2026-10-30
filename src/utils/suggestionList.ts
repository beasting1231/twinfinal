import { useEffect, useMemo, useState } from "react";
import { arrayUnion, doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "../firebase/config";

// A small saved document of names in display order (e.g. drivers, booking sources),
// used for suggestion boxes instead of scanning every booking ever made.
// Read at most once per app session; new names are appended when saved.

type Lists<F extends string> = Record<F, string[]>;

// Counts each name and returns them most-used first (the order suggestions had before).
// Names are kept exactly as stored on the bookings, so they still match them.
export function namesByUse(values: unknown[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) {
    if (typeof value !== "string" || !value.trim()) continue;
    counts.set(value, (counts.get(value) || 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([name]) => name);
}

export function createSuggestionList<F extends string>(options: {
  path: [string, string];
  fields: readonly F[];
  // One-off: builds the lists from history the first time they're needed.
  buildFromHistory: () => Promise<Lists<F>>;
}) {
  const listRef = doc(db, ...options.path);
  let cached: Lists<F> | null = null;
  let loading: Promise<Lists<F>> | null = null;

  async function build(): Promise<Lists<F>> {
    const lists = await options.buildFromHistory();
    // Saving needs the list's database rule; without it the built list is still shown.
    await setDoc(listRef, lists).catch((error) => console.warn(`Could not save ${options.path[0]}:`, error));
    return lists;
  }

  async function load(): Promise<Lists<F>> {
    // If the list can't be read (e.g. its rule isn't deployed), build it from history instead.
    const snapshot = await getDoc(listRef).catch((error) => {
      console.warn(`Could not read ${options.path[0]}, rebuilding from history:`, error);
      return null;
    });
    if (!snapshot?.exists()) return build();
    const data = snapshot.data();
    return Object.fromEntries(options.fields.map((field) => [field, data[field] || []])) as Lists<F>;
  }

  // Adds new names to the end of their list. Known names keep their place.
  // Never blocks or fails a save.
  function record(names: Partial<Record<F, string | null | undefined>>) {
    const update: Record<string, ReturnType<typeof arrayUnion>> = {};
    for (const field of options.fields) {
      const name = names[field]?.trim();
      if (!name) continue;
      update[field] = arrayUnion(name);
      if (cached && !cached[field].includes(name)) cached = { ...cached, [field]: [...cached[field], name] };
    }
    if (!Object.keys(update).length) return;
    setDoc(listRef, update, { merge: true }).catch((error) =>
      console.warn(`Could not update ${options.path[0]}:`, error)
    );
  }

  // Loads only when `enabled` (e.g. the popup is open), and only once per session.
  function useList(enabled: boolean) {
    const [lists, setLists] = useState<Lists<F> | null>(cached);

    useEffect(() => {
      if (!enabled) return;
      if (cached) {
        setLists(cached);
        return;
      }
      let active = true;
      loading ??= load();
      loading
        .then((result) => {
          cached = result;
          if (active) setLists(result);
        })
        .catch((error) => {
          loading = null;
          console.error(`Error loading ${options.path[0]}:`, error);
          // Stop the loading state; names can still be typed. Retried on next open.
          if (active) setLists(Object.fromEntries(options.fields.map((field) => [field, [] as string[]])) as Lists<F>);
        });
      return () => {
        active = false;
      };
    }, [enabled]);

    // Same arrays between renders, so search boxes using them don't keep resetting.
    const suggestions = useMemo(
      () => Object.fromEntries(options.fields.map((field) => [field, (lists?.[field] || []).map((name) => ({ name }))])) as Record<F, { name: string }[]>,
      [lists]
    );
    return { ...suggestions, loading: enabled && !lists };
  }

  return { useList, record };
}
