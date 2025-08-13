# Bugsnag API Client Documentation

## Overview

This document captures the real-world findings about the Bugsnag (SmartBear Insight Hub) API integration, including discrepancies between documentation and actual API behavior.

## API Endpoints

### Base URL
- **Official API**: `https://api.bugsnag.com`
- **Web Interface**: `https://app.bugsnag.com` (different authentication/format)

### Key Endpoints
- **Projects**: `/organizations/{org_id}/projects`
- **Errors**: `/projects/{project_id}/errors`
- **Events**: `/projects/{project_id}/events`
- **Error Details**: `/errors/{error_id}`
- **Error Events**: `/errors/{error_id}/events`

## Authentication

### API Token Authentication
```http
Authorization: token {api_token}
```

Required environment variables:
- `BUGSNAG_API_TOKEN`: Your API token from Bugsnag settings
- `BUGSNAG_ORG_ID`: Organization ID (found in URL or settings)

## Critical Discovery: Filter Format

### ❌ What the Swagger Documentation Says (DOESN'T WORK)

The official Swagger documentation at `https://virtserver.swaggerhub.com/smartbear-public/insight-hub-data-access-api/2/` shows this format:

```http
GET /projects/{id}/errors?user.id=[{"type":"eq","value":"user_id"}]
```

**This format DOES NOT WORK with the actual API.**

### ✅ What Actually Works

Through reverse-engineering the web interface, we discovered the real format:

```http
GET /projects/{id}/errors?filters[user.id]=user_id&filters[event.since]=timestamp
```

### Required Headers

```http
Authorization: token {api_token}
Content-Type: application/json
x-version: 2
accept: application/json
```

**The `x-version: 2` header is CRITICAL for filtering to work.**

## Working Filter Examples

### User Filtering
```bash
curl -X 'GET' \
  'https://api.bugsnag.com/projects/5d3d37ee9e40380011caf720/errors?per_page=10&sort=last_seen&direction=desc&filters[user.id]=41343' \
  -H 'Authorization: token YOUR_TOKEN' \
  -H 'x-version: 2' \
  -H 'accept: application/json'
```

### Time Range Filtering
```bash
curl -X 'GET' \
  'https://api.bugsnag.com/projects/5d3d37ee9e40380011caf720/errors?filters[event.since]=2025-08-12T00:00:00Z&filters[event.before]=2025-08-13T23:59:59Z' \
  -H 'Authorization: token YOUR_TOKEN' \
  -H 'x-version: 2' \
  -H 'accept: application/json'
```

### Combined Filtering
```bash
curl -X 'GET' \
  'https://api.bugsnag.com/projects/5d3d37ee9e40380011caf720/errors?filters[user.id]=41343&filters[event.since]=2025-08-12T00:00:00Z&filters[event.before]=2025-08-13T23:59:59Z' \
  -H 'Authorization: token YOUR_TOKEN' \
  -H 'x-version: 2' \
  -H 'accept: application/json'
```

## Python Implementation

### Filter Parameter Construction

```python
# Correct approach (GUI format)
params = {}
if user_id:
    params['filters[user.id]'] = user_id
if start_time:
    params['filters[event.since]'] = start_time
if end_time:
    params['filters[event.before]'] = end_time
```

### Headers Configuration

```python
def get_auth_headers() -> dict:
    config = get_bugsnag_config()
    return {
        'Authorization': f'token {config["api_token"]}',
        'Content-Type': 'application/json',
        'x-version': '2',
        'accept': 'application/json'
    }
```

## Testing Filter Effectiveness

### Validation Method
To verify that user filtering is working:

1. **Test with known user**: Should return user-specific errors
2. **Test with non-existent user**: Should return different errors or fewer results
3. **Compare results**: Different users should yield different error sets

### Example Test

```python
# User with events
result1 = await client.search_errors(project_id, '41343', limit=5)
errors1 = result1.get('errors', [])

# Different user  
result2 = await client.search_errors(project_id, '10101001', limit=5)
errors2 = result2.get('errors', [])

# Should be different if filtering works
assert errors1 != errors2
```

## Common Pitfalls

### 1. Wrong Filter Format
❌ `user.id=value` (direct parameter)
❌ `user.id=[{"type":"eq","value":"user_id"}]` (Swagger format)
✅ `filters[user.id]=value` (GUI format)

### 2. Missing Headers
- Without `x-version: 2`, filters are ignored
- Without proper `Authorization`, requests fail

### 3. URL Encoding
- Python's `urlencode()` uses `+` for spaces (works fine)
- Manual encoding with `%20` also works
- Both are acceptable to the API

### 4. Endpoint Confusion
- `/errors` endpoint: For error summaries with filtering
- `/events` endpoint: For individual event instances
- Web interface URL structure is different from API

## Response Formats

### Errors Response
```json
[
  {
    "id": "error_id",
    "project_id": "project_id", 
    "error_class": "ErrorClass",
    "message": "Error message",
    "context": "context_info",
    "severity": "error|warning|info",
    "status": "open|resolved|ignored",
    "first_seen": "2025-08-13T08:22:26.000Z",
    "last_seen": "2025-08-13T08:22:26.000Z",
    "events_count": 0,
    "users_count": 0,
    "url": "https://api.bugsnag.com/projects/.../errors/..."
  }
]
```

### Projects Response
```json
[
  {
    "id": "project_id",
    "name": "Project Name",
    "type": "project_type"
  }
]
```

## Project IDs (Connecteam)

```javascript
const PROJECT_IDS = {
  MOBILE: "5d3d37ee9e40380011caf720",      // Connecteam (React Native)
  DASHBOARD: "607c531330d97a000df4982c",    // Connecteam-Dashboard (Angular)
  DASHBOARD_ANGULAR: "607c548c08f29c00130f0941", // Connecteam-Dashboard-Angular  
  WORDPRESS: "644658fe4268870011be7cad"     // Wordpress
};
```

## Debugging Tips

### 1. Enable URL Debugging
```python
from urllib.parse import urlencode
debug_url = f"{base_url}{endpoint}?{urlencode(params)}"
print(f"DEBUG: Request URL: {debug_url}")
```

### 2. Test with curl
Always validate API calls with curl before implementing in code:

```bash
# Test filter format
curl -v 'https://api.bugsnag.com/projects/PROJECT_ID/errors?filters[user.id]=USER_ID' \
  -H 'Authorization: token TOKEN' \
  -H 'x-version: 2'
```

### 3. Browser DevTools
Check actual requests made by the Bugsnag web interface:
1. Open browser DevTools (Network tab)
2. Apply filters in Bugsnag web interface  
3. Copy the actual curl command from DevTools
4. Adapt for API usage

## Time Format

Use ISO 8601 format for timestamps:
```
2025-08-13T08:22:26.000Z
```

## Rate Limiting

- API has rate limits (exact limits not documented)
- Use reasonable delays between requests
- Batch operations when possible

## Production Status

✅ **FULLY FUNCTIONAL** - User filtering is working correctly as of August 13, 2025.

### Verified Capabilities:
- ✅ User ID filtering works properly (`filters[user.id]=value`)
- ✅ Time range filtering with ISO timestamps (`YYYY-MM-DDTHH:MM:SSZ`)
- ✅ Multi-project search (mobile + dashboard)
- ✅ Proper error differentiation between users
- ✅ MCP server integration operational

### Test Results:
- **Non-existent users**: Return 0 errors (correct filtering)
- **Real users**: Return user-specific error sets
- **Time ranges**: 24h/7d/30d all work correctly
- **Default limits**: 25 errors per project (mobile + dashboard)

## Known Issues (Resolved)

1. ~~**Documentation Discrepancy**: Swagger docs don't match actual API behavior~~ ✅ **RESOLVED**
2. ~~**Filter Support**: Not all documented filters work as expected~~ ✅ **RESOLVED** 
3. ~~**Version Dependency**: Filtering requires `x-version: 2` header~~ ✅ **DOCUMENTED**
4. ~~**Timestamp Format**: API rejected `+00:00` timezone format~~ ✅ **FIXED** (now uses `Z` format)

## References

- **Swagger Documentation**: https://virtserver.swaggerhub.com/smartbear-public/insight-hub-data-access-api/2/ (partially incorrect)
- **Web Interface**: https://app.bugsnag.com (for real format discovery)
- **API Base**: https://api.bugsnag.com (actual API endpoint)

## Success Story

This integration went through several iterations to get working correctly:

1. **Initial Issue**: Swagger documentation format didn't work
2. **Discovery**: Browser DevTools revealed GUI uses different format
3. **Implementation**: `filters[field]=value` + `x-version: 2` header
4. **Final Fix**: Timestamp format change from `+00:00` to `Z`
5. **Validation**: Comprehensive testing with real vs non-existent users

**Result**: Production-ready Bugsnag integration with full user filtering capability.

### Final Working Configuration:
```python
# Headers
{
    'Authorization': f'token {api_token}',
    'Content-Type': 'application/json',
    'x-version': '2',
    'accept': 'application/json'
}

# Filters  
params = {
    'filters[user.id]': user_id,
    'filters[event.since]': start_time_str,  # YYYY-MM-DDTHH:MM:SSZ format
    'filters[event.before]': end_time_str    # YYYY-MM-DDTHH:MM:SSZ format
}
```

---

**Last Updated**: August 13, 2025  
**Status**: ✅ Production Ready  
**Verified Against**: Bugsnag API v2 with Connecteam projects
