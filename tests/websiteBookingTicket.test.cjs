const test = require("node:test");
const assert = require("node:assert/strict");
const {createTicketService} = require("../functions/websiteBookingTicket");

const reference = "529dd4dd-c943-4952-bd46-0100a6339f7a";
const checkoutId = "575e3b40-d6aa-4718-ab60-021f30657af5";

function fakeDb(bookings) {
  const docs = new Map(Object.entries(bookings).map(([id, data]) => [id, {...data}]));
  const docFor = (id) => {
    const ref = {id, update: async (update) => Object.assign(docs.get(id), update)};
    return {id, ref, data: () => ({...docs.get(id)})};
  };
  return {
    docs,
    collection: () => ({
      where: (field, _op, value) => ({
        limit: () => ({
          get: async () => {
            const match = [...docs.entries()].find(([, data]) => data[field] === value);
            return match ? {empty: false, docs: [docFor(match[0])]} : {empty: true, docs: []};
          },
        }),
      }),
    }),
    runTransaction: async (fn) => fn({
      get: async (ref) => docFor(ref.id),
      update: (ref, update) => ref.update(update),
    }),
  };
}

function setup({status = "PAID", amount = 340} = {}) {
  const db = fakeDb({
    booking1: {
      formId: "website", email: "alex@example.com", customerName: "Alex Morgan",
      flightType: "classic", date: "2026-10-02", time: "9:15", numberOfPeople: 2,
      amount: 340, paymentReference: reference, sumupCheckoutId: checkoutId, paymentStatus: "awaiting payment",
    },
  });
  const sent = [];
  const transporter = {sendMail: async (mail) => {
    sent.push(mail);
    return {accepted: [mail.to]};
  }};
  const fetchImpl = async () => ({ok: true, json: async () => ({status, amount, checkout_reference: reference})});
  const service = createTicketService({db, transporter, getSumupKey: () => "test", fetchImpl});
  return {db, sent, service};
}

test("paid checkout marks booking paid and emails the ticket once", async () => {
  const {db, sent, service} = setup();
  const first = await service.handleConfirmCall({data: {paymentReference: reference}});
  const second = await service.handleConfirmCall({data: {paymentReference: reference}});
  assert.equal(first.paid, true);
  assert.equal(first.ticket.bookingId, "booking1");
  assert.equal(second.paid, true);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].to, "alex@example.com");
  assert.match(sent[0].html, /booking1/);
  assert.equal(sent[0].attachments[0].cid, "ticket-qr");
  assert.equal(db.docs.get("booking1").paymentStatus, "paid");
  assert.equal(db.docs.get("booking1").ticketEmailStatus, "sent");
});

test("unpaid or mismatched checkout sends nothing", async () => {
  for (const options of [{status: "PENDING"}, {amount: 1}]) {
    const {db, sent, service} = setup(options);
    const result = await service.handleConfirmCall({data: {paymentReference: reference}});
    assert.deepEqual(result, {paid: false});
    assert.equal(sent.length, 0);
    assert.equal(db.docs.get("booking1").paymentStatus, "awaiting payment");
  }
});

test("webhook confirms by checkout id and ignores bad payloads", async () => {
  const {sent, service} = setup();
  const response = () => {
    const res = {code: 0, status(code) {
      res.code = code; return res;
    }, send() {}};
    return res;
  };
  const bad = response();
  await service.handleWebhook({method: "POST", body: {id: "nope"}}, bad);
  assert.equal(bad.code, 400);
  const ok = response();
  await service.handleWebhook({method: "POST", body: {id: checkoutId}}, ok);
  assert.equal(ok.code, 200);
  assert.equal(sent.length, 1);
});
