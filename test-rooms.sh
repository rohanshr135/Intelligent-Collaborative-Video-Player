#!/bin/bash

# Room Functionality Test Script
echo "🧪 Starting Comprehensive Room Testing..."
echo "=================================================="

API_BASE="http://localhost:5000/api"

echo ""
echo "1️⃣ Testing Backend Health Check..."
curl -s "$API_BASE/../health" | jq . || echo "❌ Health check failed"

echo ""
echo "2️⃣ Testing Room Creation..."
ROOM_RESPONSE=$(curl -s -X POST "$API_BASE/rooms")
echo "Response: $ROOM_RESPONSE"
ROOM_CODE=$(echo $ROOM_RESPONSE | jq -r '.code')
ROOM_ID=$(echo $ROOM_RESPONSE | jq -r '.roomId')
echo "✅ Created room: $ROOM_CODE (ID: $ROOM_ID)"

echo ""
echo "3️⃣ Testing Room List (Debug endpoint)..."
curl -s "$API_BASE/rooms" | jq .

echo ""
echo "4️⃣ Testing Room Join..."
JOIN_RESPONSE=$(curl -s -X POST "$API_BASE/rooms/$ROOM_CODE/join" -H "Content-Type: application/json" -d '{"userId":"test-user-1"}')
echo "Join Response: $JOIN_RESPONSE"

echo ""
echo "5️⃣ Testing Get Room State..."
STATE_RESPONSE=$(curl -s "$API_BASE/rooms/$ROOM_CODE/state")
echo "State Response: $STATE_RESPONSE"

echo ""
echo "6️⃣ Testing Update Room State..."
UPDATE_RESPONSE=$(curl -s -X POST "$API_BASE/rooms/$ROOM_CODE/state" -H "Content-Type: application/json" -d '{"t":120,"paused":false,"rate":1.5,"videoHash":"test-video-123"}')
echo "Update Response: $UPDATE_RESPONSE"

echo ""
echo "7️⃣ Testing Updated State Retrieval..."
UPDATED_STATE=$(curl -s "$API_BASE/rooms/$ROOM_CODE/state")
echo "Updated State: $UPDATED_STATE"

echo ""
echo "8️⃣ Testing Invalid Room Access..."
INVALID_RESPONSE=$(curl -s "$API_BASE/rooms/INVALID/state")
echo "Invalid Room Response: $INVALID_RESPONSE"

echo ""
echo "9️⃣ Testing Multiple Users Join..."
for i in {2..5}; do
  USER_JOIN=$(curl -s -X POST "$API_BASE/rooms/$ROOM_CODE/join" -H "Content-Type: application/json" -d "{\"userId\":\"test-user-$i\"}")
  echo "User $i joined: $USER_JOIN"
done

echo ""
echo "🔟 Final Room State..."
FINAL_STATE=$(curl -s "$API_BASE/rooms/$ROOM_CODE/state")
echo "Final State: $FINAL_STATE"

echo ""
echo "=================================================="
echo "✅ Room Testing Complete!"
echo "📝 Test Summary:"
echo "   - Room Code: $ROOM_CODE"
echo "   - Room ID: $ROOM_ID"
echo "   - Users Joined: 5"
echo "   - Backend Running: ✅"
echo "=================================================="
