#!/bin/bash

echo "Testing webhook server..."

# Test health check
echo "1. Health check:"
curl -s http://localhost:3000/health | jq .

echo -e "\n2. Test GitHub webhook (push event):"
curl -X POST http://localhost:3000/webhook/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -d '{
    "repository": {
      "full_name": "test/repo"
    },
    "ref": "refs/heads/feature-branch",
    "pusher": {
      "name": "testuser"
    }
  }' | jq .

echo -e "\n3. Test main branch push (should be ignored):"
curl -X POST http://localhost:3000/webhook/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: push" \
  -d '{
    "repository": {
      "full_name": "test/repo"
    },
    "ref": "refs/heads/main",
    "pusher": {
      "name": "testuser"
    }
  }' | jq .

echo -e "\nWebhook tests completed!"