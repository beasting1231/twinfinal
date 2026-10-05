// MCP (Streamable HTTP, stateless) adapter for the booking API. It exposes the existing service
// operations as tools; every read and write goes through the same validated code paths, scopes and limits.
const crypto = require("node:crypto");
const {ApiError, check, requireScope} = require("./bookingApiDomain");
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const text = (description, extra = {}) => ({type: "string", description, ...extra});
const idempotencyKey = text("Optional 8–128 visible ASCII characters. Reuse the same value only when retrying " +
  "this exact operation, so a retry is not applied twice.", {minLength: 8, maxLength: 128});
const bookingId = text("Booking ID.", {minLength: 1, maxLength: 1500});
const details = {
  customerName: text("Customer name.", {maxLength: 300}),
  date: text("Departure date in Switzerland, YYYY-MM-DD.", {pattern: "^\\d{4}-\\d{2}-\\d{2}$"}),
  time: text("Scheduled departure time in Switzerland, HH:MM (see check_availability)."),
  numberOfPeople: {type: "integer", minimum: 1, maximum: 100, description: "Passenger count."},
  email: text("Customer email.", {maxLength: 300}),
  phoneNumber: text("Customer phone number.", {maxLength: 300}),
  pickupLocation: text("Pickup location.", {maxLength: 300}),
  flightType: {type: "string", enum: ["sensational", "classic", "early bird"]},
  preferredContact: {type: ["string", "null"], enum: ["phone", "email", null]},
  notes: text("Customer notes.", {maxLength: 4000}),
  bookingSource: text("Where the booking came from.", {maxLength: 300}),
};
const officeNotes = text("Internal office notes.", {maxLength: 4000});
const statuses = {type: "string", enum: ["unconfirmed", "confirmed", "pending", "cancelled", "no show"]};
const schema = (properties, required = []) => ({type: "object", properties, required, additionalProperties: false});
const read = {readOnlyHint: true, openWorldHint: false};
const write = {readOnlyHint: false, destructiveHint: false, openWorldHint: false};
const TOOLS = [
  {name: "check_availability", scope: "availability:read", title: "Check availability", annotations: read,
    description: "Scheduled departures and remaining spaces for a day in Switzerland (Europe/Zurich). " +
      "availableSpots are directly bookable; onRequestSpots require pilot consent and are excluded from " +
      "availableSpots. totalAvailableSpots includes both. Optionally limit to one departure time.",
    inputSchema: schema({date: details.date, time: details.time}, ["date"]),
    run: (service, key, args) => service.getAvailability(args)},
  {name: "search_bookings", scope: "bookings:read", title: "Search bookings", annotations: read,
    description: "Find bookings by date, by customer name (prefix match on first/last names, accent " +
      "insensitive), or both. Deleted bookings are excluded. An empty page can still have nextCursor; keep " +
      "paging with the same filters until nextCursor is null.",
    inputSchema: schema({date: details.date, name: text("Customer name, at least two letters.", {maxLength: 100}),
      limit: {type: "integer", minimum: 1, maximum: 100}, cursor: text("nextCursor from the previous page.")}),
    run: (service, key, args) => service.listBookings(args)},
  {name: "get_booking", scope: "bookings:read", title: "Get booking", annotations: read,
    description: "One booking by ID.", inputSchema: schema({id: bookingId}, ["id"]),
    run: (service, key, args) => service.getBooking(args.id)},
  {name: "create_booking", scope: "bookings:create", title: "Create booking", annotations: write,
    description: "Create a booking directly in the daily plan for a future scheduled departure with enough " +
      "space. Defaults to unconfirmed. Does not send a customer confirmation email.",
    inputSchema: schema({...details, officeNotes, bookingStatus: statuses, idempotencyKey},
        ["customerName", "date", "time", "numberOfPeople"]),
    run: (service, key, args) => mutation(service, key, "create", null, args)},
  {name: "update_booking", scope: "bookings:update", title: "Update booking", annotations: write,
    description: "Change booking details. Moving date/time or changing passengers rechecks capacity. " +
      "Use set_booking_status to change the status.",
    inputSchema: schema({id: bookingId, ...details, officeNotes, idempotencyKey}, ["id"]),
    run: (service, key, {id, ...args}) => {
      check(!Object.hasOwn(args, "bookingStatus"), "Use set_booking_status to change the status.");
      return mutation(service, key, "update", id, args);
    }},
  {name: "set_booking_status", scope: "bookings:status", title: "Set booking status", annotations: write,
    description: "Change only a booking's status.",
    inputSchema: schema({id: bookingId, bookingStatus: statuses, idempotencyKey}, ["id", "bookingStatus"]),
    run: (service, key, {id, bookingStatus, ...rest}) =>
      mutation(service, key, "update", id, {bookingStatus, ...rest})},
  {name: "delete_booking", scope: "bookings:delete", title: "Delete booking",
    annotations: {...write, destructiveHint: true},
    description: "Recoverable deletion (restore in the app); clears pilot assignments and payments like the app.",
    inputSchema: schema({id: bookingId, idempotencyKey}, ["id"]),
    run: (service, key, {id, ...rest}) => mutation(service, key, "delete", id, rest)},
  {name: "create_booking_request", scope: "booking-requests:create", title: "Create booking request",
    annotations: write,
    description: "Submit a pending booking request for review. Does not reserve capacity. Email is required.",
    inputSchema: schema({...details, idempotencyKey}, ["customerName", "date", "time", "numberOfPeople", "email"]),
    run: (service, key, args) => mutation(service, key, "request", null, args)},
];
async function mutation(service, key, kind, id, {idempotencyKey: retryKey, ...body}) {
  const result = await service.mutate(key, kind, id, body, retryKey === undefined ?
    `mcp-${crypto.randomUUID()}` : retryKey);
  return result.body;
}
const visibleTools = key => TOOLS.filter(tool => (key.scopes || []).includes(tool.scope))
    .map(({name, title, description, inputSchema, annotations}) =>
      ({name, title, description, inputSchema, annotations}));
async function callTool(service, key, params) {
  const tool = TOOLS.find(item => item.name === (params && params.name));
  if (!tool) return {rpcError: {code: -32602, message: "Unknown tool."}};
  const args = params.arguments === undefined ? {} : params.arguments;
  try {
    check(args && typeof args === "object" && !Array.isArray(args), "Tool arguments must be an object.");
    requireScope(key, tool.scope);
    const result = await tool.run(service, key, args);
    return {content: [{type: "text", text: JSON.stringify(result)}], structuredContent: result};
  } catch (error) {
    if (!(error instanceof ApiError)) throw error;
    return {content: [{type: "text", text: `${error.code}: ${error.message}`}], isError: true};
  }
}
function createMcpHandler(service) {
  return async (req, res) => {
    const message = req.body;
    const reply = body => res.status(200).json({jsonrpc: "2.0", id: message.id, ...body});
    if (!message || typeof message !== "object" || Array.isArray(message) || message.jsonrpc !== "2.0" ||
      typeof message.method !== "string") {
      return res.status(400).json({jsonrpc: "2.0", id: null, error: {code: -32600, message: "Invalid request."}});
    }
    // Notifications and client responses need no reply.
    if (message.id === undefined) return res.status(202).end();
    switch (message.method) {
      case "initialize": {
        const requested = message.params && message.params.protocolVersion;
        return reply({result: {
          protocolVersion: PROTOCOL_VERSIONS.includes(requested) ? requested : PROTOCOL_VERSIONS[0],
          capabilities: {tools: {listChanged: false}},
          serverInfo: {name: "twin-bookings", title: "Twin Paragliding bookings", version: "1.0.0"},
          instructions: "Twin Paragliding bookings. Dates and times are in Switzerland (Europe/Zurich). " +
            "Check availability before creating or moving bookings. Only availableSpots are directly bookable; " +
            "onRequestSpots require pilot consent and must be marked available in Twin first."}});
      }
      case "ping": return reply({result: {}});
      case "tools/list": return reply({result: {tools: visibleTools(req.apiKey)}});
      case "tools/call": {
        let result;
        try { result = await callTool(service, req.apiKey, message.params); } catch (error) {
          console.error("Booking MCP tool failed", {code: error.code || "internal"});
          return reply({error: {code: -32603, message: "Tool call failed. Retry with the same idempotencyKey."}});
        }
        return reply(result.rpcError ? {error: result.rpcError} : {result});
      }
      default: return reply({error: {code: -32601, message: "Method not found."}});
    }
  };
}
module.exports = {createMcpHandler, TOOLS};
