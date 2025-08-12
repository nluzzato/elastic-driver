# FastMCP Elasticsearch Server (Python)

A standalone MCP server exposing Elasticsearch tools via stdio, fully decoupled from the Node/TypeScript UI/server.

## Tools

### Primitive Tools (Low-level Elasticsearch access)
- `search_logs_primitive(index_pattern, query, size=100, from_offset=0, sort=None, fields=None)`
- `aggregate_data_primitive(index_pattern, query, aggregations)`
- `get_index_stats_primitive(index_pattern)`

### Wrapper Tools (Domain-specific convenience)
- `search_app_logs(pod_name=None, service_name=None, level=None, message_filter=None, timeframe_minutes=60, limit=100, environment=None)`
- `list_active_pods(timeframe_minutes=60, environment=None)`

### Flow Tools (Multi-step workflows)
- `investigate_issues(service_name=None, timeframe_minutes=60, environment=None)`
- `fetch_user_logs(user_id, timeframe_minutes=60, slow_request_threshold=2.0, limit=100, environment=None, start_time=None)`

### Utility Tools
- `health()`

## Setup
```bash
cd mcp/fastmcp-elasticsearch
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Run
```bash
export ELASTIC_URL="https://your-es:9200"
# either API key or basic auth
export ELASTIC_API_KEY="<base64_or_id:api_key>"  # or: ELASTIC_USERNAME / ELASTIC_PASSWORD
export ELASTIC_INDEX_PATTERN="*"
export ELASTIC_TIMEOUT="30000"

# Dev inspector
fastmcp dev server.py

# Install for compatible MCP clients (e.g., Claude Desktop)
fastmcp install server.py
```

## Notes
- This package is intentionally independent of the Node/TS codebase.
- All configuration is via environment variables.
- Responses return simplified log entries compatible with your UI types.


