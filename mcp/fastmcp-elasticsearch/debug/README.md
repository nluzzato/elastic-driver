# Debug & Testing Infrastructure

This directory contains standalone debug scripts for testing MCP tools independently of the full MCP server.

## Scripts

### Individual Test Scripts
- **`test_health.py`** - Test consolidated health check functionality
- **`test_elasticsearch.py`** - Test Elasticsearch connectivity and queries  
- **`test_bugsnag_filters.py`** - Debug Bugsnag API filter issues (our current 400 error problem)

### Master Test Runner
- **`run_all_tests.py`** - Run all test scripts and generate comprehensive report

## Usage

```bash
# Run individual tests
python debug/test_health.py
python debug/test_elasticsearch.py  
python debug/test_bugsnag_filters.py

# Run all tests
python debug/run_all_tests.py
```

## Environment Variables

⚠️ **Important**: These debug scripts run outside the MCP server context, so they won't have access to the environment variables configured in your MCP settings (`.cursor/mcp.json`).

When run standalone, tests will show connection failures - this is expected and helps validate that the scripts correctly identify missing configuration.

To test with real credentials, you would need to:
1. Export the environment variables in your shell, OR
2. Create a `.env` file in the MCP directory, OR  
3. Run the tests through the actual MCP server tools

## Purpose

This infrastructure helps with:
- 🐛 **Rapid debugging** - Test individual components without full MCP server
- 🔧 **API exploration** - Experiment with different query/filter formats
- ✅ **Validation** - Verify functionality after code changes
- 📖 **Documentation** - Examples of how each tool should work
- 🚀 **Development** - Faster iteration cycles

## Example: Debugging Bugsnag Filters

The `test_bugsnag_filters.py` script systematically tests different filter combinations to debug our current 400 Bad Request issue:

1. Basic connectivity (no filters)
2. User filter only  
3. Time filter only
4. Combined user + time filters (our failing case)
5. Alternative filter formats

This helps isolate exactly which filter combination is causing the problem.
