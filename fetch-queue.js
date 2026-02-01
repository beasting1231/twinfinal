const https = require('https');

const projectId = 'twinscheduler';
const apiKey = 'AIzaSyAWK-LIdsOVV4Kpnxr_pHdaeOO6pU5cFg8';

// This needs to be run with the user's auth token
// We'll use a simple approach with curl instead

console.log('Please run the following command to fetch the email queue:');
console.log('');
console.log(`curl -X POST \\
  'https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:runQuery' \\
  -H 'Authorization: Bearer $(gcloud auth print-access-token)' \\
  -H 'Content-Type: application/json' \\
  -d '{
    "structuredQuery": {
      "from": [{"collectionId": "emailQueue"}],
      "orderBy": [{"field": {"fieldPath": "createdAt"}, "direction": "DESCENDING"}],
      "limit": 20
    }
  }' | jq '.[] | select(.document) | {
    id: .document.name,
    to: .document.fields.to.stringValue,
    customer: .document.fields.customerName.stringValue,
    status: .document.fields.status.stringValue,
    created: .document.fields.createdAt.timestampValue
  }'`);
