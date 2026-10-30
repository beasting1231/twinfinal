const {test, before, after} = require('node:test');
const assert = require('node:assert/strict');
const {createBookingApiApp} = require('../functions/bookingApi');
const {ApiError, SCOPES} = require('../functions/bookingApiDomain');
// Fake service only: no Firestore, no emulator, no data.
const calls = [];
const keys = {'Bearer all': {id: 'k1', name: 'All', scopes: SCOPES}, 'Bearer read': {id: 'k2', name: 'Read',
  scopes: ['bookings:read', 'availability:read']}};
const service = {
  async authenticate(header) {
    if (!keys[header]) throw new ApiError(401, 'unauthenticated', 'A valid Bearer API key is required.');
    return keys[header];
  },
  async getAvailability(query) { calls.push(['availability', query]); return {date: query.date, slots: []}; },
  async listBookings(query) { calls.push(['list', query]); return {bookings: [], nextCursor: null}; },
  async getBooking(id) {
    calls.push(['get', id]);
    if (id === 'missing') throw new ApiError(404, 'not_found', 'Booking not found.');
    return {booking: {id}};
  },
  async mutate(key, kind, id, body, idempotencyKey) {
    calls.push(['mutate', kind, id, body, idempotencyKey]);
    if (!key.scopes.includes({create: 'bookings:create', update: 'bookings:update'}[kind] || kind)) {
      if (kind === 'create') throw new ApiError(403, 'permission_denied', 'Missing bookings:create.');
    }
    return {status: 200, body: {id: id || 'new', bookingStatus: body.bookingStatus || 'unconfirmed'}};
  },
};
let server, base;
before(async () => {
  server = createBookingApiApp(service).listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(() => server.close());
let id = 0;
async function rpc(method, params, auth = 'Bearer all', extra = {}) {
  const response = await fetch(`${base}/mcp`, {method: 'POST', headers: {'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream', ...(auth ? {Authorization: auth} : {})},
  body: JSON.stringify({jsonrpc: '2.0', id: ++id, method, ...(params ? {params} : {}), ...extra})});
  return {status: response.status, body: response.status === 202 ? null : await response.json()};
}
test('handshake and scope-filtered tool list', async () => {
  const init = await rpc('initialize', {protocolVersion: '2025-06-18', capabilities: {},
    clientInfo: {name: 'test', version: '1'}});
  assert.equal(init.status, 200);
  assert.equal(init.body.result.protocolVersion, '2025-06-18');
  assert.ok(init.body.result.capabilities.tools);
  const note = await fetch(`${base}/mcp`, {method: 'POST', headers: {'Content-Type': 'application/json',
    Authorization: 'Bearer all'}, body: JSON.stringify({jsonrpc: '2.0', method: 'notifications/initialized'})});
  assert.equal(note.status, 202);
  const all = (await rpc('tools/list')).body.result.tools.map(tool => tool.name);
  assert.deepEqual(all.sort(), ['check_availability', 'create_booking', 'create_booking_request', 'delete_booking',
    'get_booking', 'search_bookings', 'set_booking_status', 'update_booking']);
  const readOnly = (await rpc('tools/list', undefined, 'Bearer read')).body.result.tools.map(tool => tool.name);
  assert.deepEqual(readOnly.sort(), ['check_availability', 'get_booking', 'search_bookings']);
});
test('authentication is required and other methods are rejected', async () => {
  assert.equal((await rpc('tools/list', undefined, null)).status, 401);
  assert.equal((await rpc('tools/list', undefined, 'Bearer nope')).status, 401);
  const get = await fetch(`${base}/mcp`, {headers: {Authorization: 'Bearer all'}});
  assert.equal(get.status, 405);
  assert.equal((await rpc('resources/list')).body.error.code, -32601);
});
test('read tools call the existing service', async () => {
  calls.length = 0;
  const result = (await rpc('tools/call', {name: 'search_bookings', arguments: {name: 'Peter'}}, 'Bearer read')).body.result;
  assert.deepEqual(result.structuredContent, {bookings: [], nextCursor: null});
  assert.deepEqual(calls, [['list', {name: 'Peter'}]]);
  const missing = (await rpc('tools/call', {name: 'get_booking', arguments: {id: 'missing'}})).body.result;
  assert.equal(missing.isError, true);
  assert.match(missing.content[0].text, /not_found/);
});
test('write tools are refused without scope and never reach the service', async () => {
  calls.length = 0;
  for (const [name, args] of [['create_booking', {customerName: 'X', date: '2099-01-01', time: '09:00',
    numberOfPeople: 1}], ['delete_booking', {id: 'b1'}], ['set_booking_status', {id: 'b1', bookingStatus: 'confirmed'}]]) {
    const result = (await rpc('tools/call', {name, arguments: args}, 'Bearer read')).body.result;
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /permission/);
  }
  assert.deepEqual(calls, []);
});
test('write tools map onto existing mutations with idempotency keys', async () => {
  calls.length = 0;
  await rpc('tools/call', {name: 'set_booking_status', arguments: {id: 'b1', bookingStatus: 'confirmed',
    idempotencyKey: 'retry-key-123'}});
  await rpc('tools/call', {name: 'update_booking', arguments: {id: 'b1', notes: 'hi'}});
  const refused = (await rpc('tools/call', {name: 'update_booking', arguments: {id: 'b1', bookingStatus: 'confirmed'}}))
      .body.result;
  assert.equal(refused.isError, true);
  assert.deepEqual(calls[0], ['mutate', 'update', 'b1', {bookingStatus: 'confirmed'}, 'retry-key-123']);
  assert.equal(calls[1][1], 'update');
  assert.deepEqual(calls[1][3], {notes: 'hi'});
  assert.match(calls[1][4], /^mcp-[0-9a-f-]{36}$/);
  assert.equal(calls.length, 2);
  assert.equal((await rpc('tools/call', {name: 'nope', arguments: {}})).body.error.code, -32602);
});
