const {test} = require('node:test');
const assert = require('node:assert/strict');
const {buildMessage, createHandler} = require('../functions/websiteForms');
const contact = {name: 'Test User', email: 'visitor@example.com', message: 'Question <script> & details'};
const voucher = {email: 'visitor@example.com', firstName: 'Test', lastName: 'User', phone: '+41790000000',
  street: 'Test street', postCode: '3800', city: 'Interlaken', deliveryMethod: 'pdf',
  flight: 'romantic', photoVideo: 'yes', transport: 'yes', comments: 'Test request'};
function setup(sendMail = async () => ({accepted: ['bookings@twinparagliding.com']})) {
  const records = new Map();
  const sent = [];
  const db = {collection: (collection) => ({doc: (id) => ({key: `${collection}/${id}`,
    update: async function(value) { records.set(this.key, {...records.get(this.key), ...value}); },
  })}), runTransaction: async (callback) => callback({
    get: async (ref) => ({exists: records.has(ref.key), data: () => records.get(ref.key)}),
    set: (ref, value) => records.set(ref.key, value),
  })};
  return {records, sent, handler: createHandler('contact', {db, transporter: {sendMail: async (mail) => {
    sent.push(mail); return sendMail(mail);
  }}})};
}
const request = (data) => ({data, rawRequest: {ip: '192.0.2.1'}});
test('voucher totals are calculated on server and all fields included', () => {
  const result = buildMessage('voucher', {...voucher, total: '1'});
  assert.match(result.text, /Total: CHF 280/);
  assert.match(result.text, /Street: Test street/);
  assert.match(result.text, /Comments: Test request/);
});
test('validation rejects missing, oversized, invalid email and invalid option input', () => {
  for (const data of [{}, {...contact, email: 'a@b.com\r\nBcc: x@y.com'},
    {...contact, message: 'x'.repeat(5001)}, {...contact, website: 'spam'}]) {
    assert.throws(() => buildMessage('contact', data), {code: 'invalid-argument'});
  }
  assert.throws(() => buildMessage('voucher', {...voucher, flight: 'classic'}), {code: 'invalid-argument'});
});
test('uses fixed destination and sender, visitor reply-to, and deduplicates retries', async () => {
  const {handler, sent, records} = setup();
  assert.deepEqual(await handler(request({...contact, to: 'attacker@example.com'})), {sent: true});
  await handler(request(contact));
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, 'bookings@twinparagliding.com');
  assert.equal(sent[0].from.address, 'bookings@twinparagliding.com');
  assert.equal(sent[0].replyTo, contact.email);
  assert.equal([...records.values()].find((v) => v.kind)?.status, 'sent');
});
test('SMTP failure is recorded and never reported as success or automatically resent', async () => {
  const {handler, sent, records} = setup(async () => { throw Object.assign(new Error('SMTP failed'), {code: 'ESOCKET'}); });
  await assert.rejects(handler(request(contact)), {code: 'unavailable'});
  await assert.rejects(handler(request(contact)), {code: 'failed-precondition'});
  assert.equal(sent.length, 1);
  assert.equal([...records.values()].find((v) => v.kind)?.status, 'failed');
});
test('sixth distinct request in an hour is blocked', async () => {
  const {handler, sent} = setup();
  for (let i=0; i<5; i++) await handler(request({...contact, message: `Question ${i}`}));
  await assert.rejects(handler(request({...contact, message: 'Question 6'})), {code: 'resource-exhausted'});
  assert.equal(sent.length, 5);
});
test('voucher recipient is configurable independently of contact destination', async () => {
  let sent;
  const record = {update: async () => {}};
  const db = {collection: () => ({doc: () => record}), runTransaction: async (callback) => callback({
    get: async () => ({exists: false}), set: () => {},
  })};
  const handler = createHandler('voucher', {db, getVoucherRecipient: () => 'coworker@example.com',
    transporter: {sendMail: async (mail) => {sent = mail; return {accepted: [mail.to]};}},
  });
  await handler(request(voucher));
  assert.equal(sent.to, 'coworker@example.com');
  assert.equal(sent.replyTo, voucher.email);
  assert.match(sent.subject, /Gift voucher/);
});
test('HTML escapes customer content and retains line breaks and plain-text fallback', () => {
  const message = buildMessage('contact', {...contact, message: '<img src=x onerror=alert(1)>\nSecond line & more'});
  assert.match(message.html, /&lt;img src=x onerror=alert\(1\)&gt;<br>Second line &amp; more/);
  assert.doesNotMatch(message.html, /<img/);
  assert.match(message.text, /Second line & more/);
  assert.match(message.html, /Contact request/);
});
test('voucher HTML groups details, displays calculated total, and omits empty optional sections', () => {
  const message = buildMessage('voucher', {...voucher, comments: '', recipientName: 'A < B'});
  assert.match(message.html, /Customer &amp; billing/);
  assert.match(message.html, /CHF 280/);
  assert.match(message.html, /A &lt; B/);
  assert.match(message.html, /PDF by email/);
  assert.doesNotMatch(message.html, /Additional comments/);
});
