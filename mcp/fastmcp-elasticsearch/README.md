# FastMCP Elasticsearch Server (Python)

A standalone MCP server exposing Elasticsearch tools via stdio, fully decoupled from the Node/TypeScript UI/server.

## Tools

This MCP server provides 4 essential tools for observability and user analysis:

### Health Check
- `health()` - Check connectivity and configuration for all services (Elasticsearch + Bugsnag)

### Raw Elasticsearch Access  
- `search_elastic_logs_primitive(index_pattern, query, size=100, from_offset=0, sort=None, fields=None)` - Low-level Elasticsearch Query DSL search

### User Analysis Workflows
- `fetch_elastic_user_logs(user_id, timeframe_minutes=60, slow_request_threshold=2.0, limit=100, environment=None, start_time=None)` - User-specific Elasticsearch analysis (errors, slow requests, activity)
- `fetch_user_errors_bugsnag(user_id, timeframe_minutes=1440, start_time=None, limit_per_project=25)` - User-specific Bugsnag errors from mobile and dashboard projects

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


