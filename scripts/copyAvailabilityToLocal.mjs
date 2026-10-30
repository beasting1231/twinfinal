import { createRequire } from 'node:module';

// Production is accessed only through public read queries. Every write uses
// the explicitly guarded localhost emulator and the fixed demo project.
if (process.env.FIRESTORE_EMULATOR_HOST !== '127.0.0.1:8180' ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== '127.0.0.1:9199') {
  throw new Error('This copy requires the local availability emulators.');
}
const month = process.argv[2];
if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month || '')) throw new Error('Specify a month as YYYY-MM.');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'demo-twin-history' });
const local = admin.firestore();
const firstDay = `${month}-01`;
const lastDay = `${month}-${new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5)), 0)).getUTCDate()}`;

function filter(field, op, value) {
  return { fieldFilter: { field: { fieldPath: field }, op, value: { stringValue: value } } };
}

function decode(value) {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('nullValue' in value) return null;
  throw new Error('Unexpected field type in availability copy.');
}

async function readProduction(collectionId, fields, filters) {
  // runQuery is read-only, despite using the POST transport.
  const response = await fetch('https://firestore.googleapis.com/v1/projects/twinscheduler/databases/(default)/documents:runQuery', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId }], select: { fields: fields.map(fieldPath => ({ fieldPath })) },
      where: { compositeFilter: { op: 'AND', filters } },
    } }),
  });
  if (!response.ok) throw new Error(`Production read failed (${response.status}); local data has not been changed.`);
  const rows = await response.json();
  const failed = rows.find(row => row.error);
  if (failed) throw new Error(`Production read failed: ${failed.error.status}`);
  return rows.filter(row => row.document).map(({ document }) => ({
    id: document.name.split('/').at(-1),
    data: Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decode(value)])),
  }));
}

async function triggers(action) {
  const response = await fetch(`http://127.0.0.1:4501/functions/${action}BackgroundTriggers`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Could not ${action} local triggers (${response.status}).`);
}

try {
  const [pilots, availability] = await Promise.all([
    readProduction('userProfiles', ['uid', 'displayName', 'role', 'priority', 'femalePilot'], [filter('role', 'EQUAL', 'pilot')]),
    readProduction('availability', ['userId', 'date', 'timeSlot', 'status', 'signedInAt', 'signedOutAt'],
      [filter('date', 'GREATER_THAN_OR_EQUAL', firstDay), filter('date', 'LESS_THAN_OR_EQUAL', lastDay)]),
  ]);
  if (!pilots.length || !availability.length) throw new Error('Empty source snapshot; refusing to replace the local demo.');

  // Do not pretend importing old records is a new pilot sign-in event.
  await triggers('disable');
  try {
    const syntheticIds = ['history-pilot', 'history-other', 'preview-pilot', 'history-admin', 'history-driver'];
    for (const uid of syntheticIds) {
      const records = await local.collection('availability').where('userId', '==', uid).get();
      for (const record of records.docs) await record.ref.delete();
      await local.doc(`userProfiles/${uid}`).delete();
      // Only remove synthetic history produced by this feature's local tests.
      for (const date of new Set([...records.docs.map(record => record.data().date), '2026-09-14'])) {
        await local.recursiveDelete(local.doc(`availabilityHistory/${date}/pilots/${uid}`));
      }
    }
    await local.doc('bookings/history-booking').delete();

    let copied = 0;
    for (const [name, rows] of [['userProfiles', pilots], ['availability', availability]]) {
      for (let offset = 0; offset < rows.length; offset += 300) {
        const chunk = rows.slice(offset, offset + 300);
        const refs = chunk.map(row => local.collection(name).doc(row.id));
        const existing = await local.getAll(...refs);
        const batch = local.batch();
        chunk.forEach((row, index) => {
          if (existing[index].exists) return;
          batch.create(refs[index], name === 'userProfiles' ? { ...row.data, uid: row.data.uid || row.id } : row.data);
          copied++;
        });
        await batch.commit();
      }
    }
    console.log(`Local ${month} snapshot: ${pilots.length} real pilot profiles, ${availability.length} availability records; ${copied} new local documents.`);
    console.log('Source data was only read; no production writes or deployments. Existing local real records were not overwritten.');
  } finally {
    await triggers('enable');
  }
} finally {
  await admin.app().delete();
}
