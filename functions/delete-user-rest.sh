#!/bin/bash

USER_UID="Q8cMukfAMNOWTJ0gE7TViFWZGXs1"
PROJECT_ID="twinscheduler"
ACCESS_TOKEN=$(gcloud auth print-access-token)

echo "=== Deleting data for user: $USER_UID ==="

# 1. Query availability documents for this user
echo ""
echo "1. Querying availability documents..."

QUERY_RESULT=$(curl -s -X POST \
  "https://firestore.googleapis.com/v1/projects/$PROJECT_ID/databases/(default)/documents:runQuery" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "structuredQuery": {
      "from": [{"collectionId": "availability"}],
      "where": {
        "fieldFilter": {
          "field": {"fieldPath": "userId"},
          "op": "EQUAL",
          "value": {"stringValue": "'"$USER_UID"'"}
        }
      }
    }
  }')

echo "Query result:"
echo "$QUERY_RESULT" | jq '.'

# Extract document names and delete each one
echo ""
echo "2. Deleting availability documents..."

DOCS=$(echo "$QUERY_RESULT" | jq -r '.[].document.name // empty')

if [ -z "$DOCS" ]; then
  echo "   No availability documents found for this user."
else
  for doc in $DOCS; do
    echo "   Deleting: $doc"
    curl -s -X DELETE \
      "https://firestore.googleapis.com/v1/$doc" \
      -H "Authorization: Bearer $ACCESS_TOKEN"
    echo "   ✓ Deleted"
  done
fi

# 3. Delete user document from users collection
echo ""
echo "3. Deleting user document from users collection..."
curl -s -X DELETE \
  "https://firestore.googleapis.com/v1/projects/$PROJECT_ID/databases/(default)/documents/users/$USER_UID" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
echo "   ✓ User document deleted"

# 4. Delete user profile from userProfiles collection
echo ""
echo "4. Deleting user profile from userProfiles collection..."
curl -s -X DELETE \
  "https://firestore.googleapis.com/v1/projects/$PROJECT_ID/databases/(default)/documents/userProfiles/$USER_UID" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
echo "   ✓ User profile deleted"

echo ""
echo "=== Firestore data deletion complete ==="
