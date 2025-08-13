# Bugsnag API Curl Examples

These are manual curl commands to test different filter formats with the Bugsnag API.

## Prerequisites

You need:
- `BUGSNAG_API_TOKEN`: Your Bugsnag API token
- `PROJECT_ID`: The project ID (we're using `5d3d37ee9e40380011caf720` for mobile)
- `USER_ID`: The user ID to filter by (we're using `41343`)

## Test Commands

### 1. Test without filters (baseline - should work)
```bash
curl -H "Authorization: token YOUR_API_TOKEN" \
  "https://api.bugsnag.com/projects/5d3d37ee9e40380011caf720/errors?per_page=5&sort=last_seen"
```

### 2. Test with user.id as direct parameter
```bash
curl -H "Authorization: token YOUR_API_TOKEN" \
  "https://api.bugsnag.com/projects/5d3d37ee9e40380011caf720/errors?per_page=5&sort=last_seen&user.id=41343"
```

### 3. Test with filters as JSON (array format)
```bash
# The filter JSON: {"user.id":[{"eq":"41343"}]}
# URL encoded: %7B%22user.id%22%3A%5B%7B%22eq%22%3A%2241343%22%7D%5D%7D

curl -H "Authorization: token YOUR_API_TOKEN" \
  "https://api.bugsnag.com/projects/5d3d37ee9e40380011caf720/errors?per_page=5&sort=last_seen&filters=%7B%22user.id%22%3A%5B%7B%22eq%22%3A%2241343%22%7D%5D%7D"
```

### 4. Test with simpler filter format
```bash
# The filter JSON: {"user.id":"41343"}
# URL encoded: %7B%22user.id%22%3A%2241343%22%7D

curl -H "Authorization: token YOUR_API_TOKEN" \
  "https://api.bugsnag.com/projects/5d3d37ee9e40380011caf720/errors?per_page=5&sort=last_seen&filters=%7B%22user.id%22%3A%2241343%22%7D"
```

### 5. Test with time filters
```bash
# Calculate times (adjust as needed)
START_TIME="2024-01-01T00:00:00Z"
END_TIME="2024-01-02T00:00:00Z"

# The filter JSON: {"since":[{"eq":"2024-01-01T00:00:00Z"}],"before":[{"eq":"2024-01-02T00:00:00Z"}]}
# URL encoded: %7B%22since%22%3A%5B%7B%22eq%22%3A%222024-01-01T00%3A00%3A00Z%22%7D%5D%2C%22before%22%3A%5B%7B%22eq%22%3A%222024-01-02T00%3A00%3A00Z%22%7D%5D%7D

curl -H "Authorization: token YOUR_API_TOKEN" \
  "https://api.bugsnag.com/projects/5d3d37ee9e40380011caf720/errors?per_page=5&sort=last_seen&filters=%7B%22since%22%3A%5B%7B%22eq%22%3A%222024-01-01T00%3A00%3A00Z%22%7D%5D%2C%22before%22%3A%5B%7B%22eq%22%3A%222024-01-02T00%3A00%3A00Z%22%7D%5D%7D"
```

## Expected Results

- **200 OK**: The filter format is correct
- **400 Bad Request**: The filter format is incorrect
- **401 Unauthorized**: Token is invalid or missing
- **404 Not Found**: Project ID doesn't exist or you don't have access

## Python URL Encoding Helper

To encode your filter JSON:
```python
import urllib.parse
import json

# Your filter
filter_dict = {"user.id": [{"eq": "41343"}]}

# Convert to JSON and URL encode
filter_json = json.dumps(filter_dict)
encoded = urllib.parse.quote(filter_json)
print(f"Encoded filter: {encoded}")
```

## Notes from API Documentation

According to the Bugsnag Data Access API documentation:
- Filters should be passed as a URL parameter called `filters`
- The value should be a JSON-encoded object
- Filter operators include: `eq`, `neq`, `lt`, `lte`, `gt`, `gte`, `in`, `nin`
- Time filters use `since` and `before` fields
