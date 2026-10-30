// Only the history observer runs locally: no email, push, or booking triggers.
const admin = require('firebase-admin');
if (process.env.GCLOUD_PROJECT !== 'demo-twin-history') {
  throw new Error('This fixture can only run against demo-twin-history.');
}
admin.initializeApp();
exports.recordAvailabilityHistory = require('../../../functions/availabilityHistory')
  .createAvailabilityHistoryFunction(admin.firestore());
