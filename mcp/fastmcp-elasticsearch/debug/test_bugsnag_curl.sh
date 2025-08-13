#!/bin/bash

# Test Bugsnag API filters using curl
# This script tests different filter formats to find the correct one

# Load environment variables
source ../.env 2>/dev/null || source .env 2>/dev/null

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test configuration
PROJECT_ID="5d3d37ee9e40380011caf720"  # Mobile project
USER_ID="41343"
API_TOKEN="${BUGSNAG_API_TOKEN}"
BASE_URL="https://api.bugsnag.com"

echo -e "${BLUE}=== Bugsnag API Filter Testing with Curl ===${NC}\n"

# Check if API token is set
if [ -z "$API_TOKEN" ]; then
    echo -e "${RED}ERROR: BUGSNAG_API_TOKEN not set${NC}"
    echo ""
    echo "To run this test, you need to set your Bugsnag API token."
    echo "You can do this in one of the following ways:"
    echo ""
    echo "1. Export it in your shell:"
    echo "   export BUGSNAG_API_TOKEN='your-token-here'"
    echo "   export BUGSNAG_ORG_ID='your-org-id-here'"
    echo ""
    echo "2. Create a .env file in the parent directory with:"
    echo "   BUGSNAG_API_TOKEN=your-token-here"
    echo "   BUGSNAG_ORG_ID=your-org-id-here"
    echo ""
    echo "3. Pass it as an argument:"
    echo "   BUGSNAG_API_TOKEN='your-token' ./test_bugsnag_curl.sh"
    echo ""
    exit 1
fi

echo -e "${YELLOW}Configuration:${NC}"
echo "Project ID: $PROJECT_ID"
echo "User ID: $USER_ID"
echo "Base URL: $BASE_URL"
echo ""

# Function to make a curl request and show results
test_request() {
    local description="$1"
    local url="$2"
    
    echo -e "\n${YELLOW}Test: $description${NC}"
    echo -e "${BLUE}URL:${NC} $url"
    
    response=$(curl -s -w "\n%{http_code}" -H "Authorization: token $API_TOKEN" "$url")
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')
    
    if [ "$http_code" = "200" ]; then
        echo -e "${GREEN}✓ Success (HTTP $http_code)${NC}"
        # Show first 200 chars of response
        echo -e "${BLUE}Response preview:${NC}"
        echo "$body" | jq -c '.' 2>/dev/null | head -c 200 || echo "$body" | head -c 200
        echo "..."
    else
        echo -e "${RED}✗ Failed (HTTP $http_code)${NC}"
        echo -e "${RED}Error response:${NC}"
        echo "$body" | jq '.' 2>/dev/null || echo "$body"
    fi
}

# Test 1: No filters (baseline)
test_request "No filters" \
    "$BASE_URL/projects/$PROJECT_ID/errors?per_page=5&sort=last_seen"

# Test 2: User filter as direct parameter (what we tried before)
test_request "User filter as direct parameter" \
    "$BASE_URL/projects/$PROJECT_ID/errors?per_page=5&sort=last_seen&user.id=$USER_ID"

# Test 3: User filter in filters parameter (JSON encoded)
FILTER_JSON='{"user.id":[{"eq":"'$USER_ID'"}]}'
FILTER_ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$FILTER_JSON'))")
test_request "User filter in JSON filters parameter" \
    "$BASE_URL/projects/$PROJECT_ID/errors?per_page=5&sort=last_seen&filters=$FILTER_ENCODED"

# Test 4: Time filters only
START_TIME=$(date -u -v-24H '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || date -u -d '24 hours ago' '+%Y-%m-%dT%H:%M:%SZ')
END_TIME=$(date -u '+%Y-%m-%dT%H:%M:%SZ')
TIME_FILTER_JSON='{"since":[{"eq":"'$START_TIME'"}],"before":[{"eq":"'$END_TIME'"}]}'
TIME_FILTER_ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$TIME_FILTER_JSON'))")
test_request "Time filters in JSON" \
    "$BASE_URL/projects/$PROJECT_ID/errors?per_page=5&sort=last_seen&filters=$TIME_FILTER_ENCODED"

# Test 5: Combined user and time filters
COMBINED_FILTER_JSON='{"user.id":[{"eq":"'$USER_ID'"}],"since":[{"eq":"'$START_TIME'"}],"before":[{"eq":"'$END_TIME'"}]}'
COMBINED_FILTER_ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$COMBINED_FILTER_JSON'))")
test_request "Combined user and time filters" \
    "$BASE_URL/projects/$PROJECT_ID/errors?per_page=5&sort=last_seen&filters=$COMBINED_FILTER_ENCODED"

# Test 6: Alternative filter format (simpler structure)
ALT_FILTER_JSON='{"user.id":"'$USER_ID'"}'
ALT_FILTER_ENCODED=$(python3 -c "import urllib.parse; print(urllib.parse.quote('$ALT_FILTER_JSON'))")
test_request "Alternative simpler filter format" \
    "$BASE_URL/projects/$PROJECT_ID/errors?per_page=5&sort=last_seen&filters=$ALT_FILTER_ENCODED"

echo -e "\n${BLUE}=== Test Complete ===${NC}"
