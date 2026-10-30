// This fixture deliberately exports no existing email, Telegram, push, or index triggers.
const admin = require('firebase-admin');
if (process.env.GCLOUD_PROJECT !== 'demo-twin-history') throw new Error('Local demo project required.');
admin.initializeApp();
Object.assign(exports, require('../../../functions/bookingApi').createBookingApiFunctions(admin.firestore()));
