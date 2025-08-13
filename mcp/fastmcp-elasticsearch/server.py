"""
FastMCP Elasticsearch Server - Simplified Architecture.

This server provides essential tools for Elasticsearch and Bugsnag operations:
- health: Check all services connectivity 
- search_elastic_logs_primitive: Raw Elasticsearch search
- fetch_elastic_user_logs: User-specific Elasticsearch analysis
- fetch_user_errors_bugsnag: User-specific Bugsnag errors
"""

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastmcp import FastMCP
from dotenv import load_dotenv

# Import our architecture components
from config import get_current_environment
from tools.primitives import search_elastic_logs
from tools.primitives.bugsnag import bugsnag_health_check
from tools.flows.bugsnag_user_analysis import fetch_bugsnag_user_logs
from utils import test_connection

# Load environment variables
load_dotenv()

# Initialize MCP server
mcp = FastMCP("connecteam-es-mcp")


# ========== HEALTH TOOL ==========
# Consolidated health check for all services

@mcp.tool()
def health() -> Dict[str, Any]:
    """
    Check connectivity and configuration for all services.
    
    Returns status information about:
    - Elasticsearch connectivity and configuration
    - Bugsnag API connectivity and available projects
    - Environment configuration
    """
    env = get_current_environment()
    
    # Check Elasticsearch
    elasticsearch_connected = test_connection()
    elasticsearch_status = {
        "service": "elasticsearch",
        "connected": elasticsearch_connected,
        "environment": env,
        "version": "2.0.0"
    }
    
    # Check Bugsnag
    try:
        bugsnag_result = bugsnag_health_check()
        bugsnag_connected = bugsnag_result.get("status") == "success"
        bugsnag_status = {
            "service": "bugsnag", 
            "connected": bugsnag_connected,
            "projects_count": len(bugsnag_result.get("projects", [])),
            "projects": bugsnag_result.get("projects", [])
        }
        if not bugsnag_connected:
            bugsnag_status["error"] = bugsnag_result.get("message", "Unknown error")
    except Exception as e:
        bugsnag_status = {
            "service": "bugsnag",
            "connected": False,
            "error": str(e)
        }
    
    # Overall status
    overall_status = elasticsearch_connected and bugsnag_status["connected"]
    
    return {
        "overall_status": "healthy" if overall_status else "degraded",
        "environment": env,
        "services": {
            "elasticsearch": elasticsearch_status,
            "bugsnag": bugsnag_status
        },
        "timestamp": datetime.now(timezone.utc).isoformat()
    }


# ========== PRIMITIVE TOOL ==========
# Raw Elasticsearch access

@mcp.tool()
def search_elastic_logs_primitive(
    index_pattern: str,
    query: Dict[str, Any],
    size: int = 100,
    from_offset: int = 0,
    sort: Optional[List[Dict[str, Any]]] = None,
    fields: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Low-level Elasticsearch log search.
    
    Provides direct access to Elasticsearch Query DSL without any
    domain logic or field mapping. Use this for complex queries
    that need full control.
    
    Args:
        index_pattern: Index pattern (e.g., "logs-*", "app-logs-prod-*")
        query: Elasticsearch Query DSL query
        size: Number of results (1-10000)
        from_offset: Pagination offset
        sort: Sort criteria
        fields: Specific fields to return
        
    Returns:
        Raw Elasticsearch response
    """
    response = search_elastic_logs(
        index_pattern=index_pattern,
        query=query,
        size=size,
        from_=from_offset,
        sort=sort,
        fields=fields,
    )
    
    # Convert to dict for JSON serialization
    return {
        "took": response.took,
        "timed_out": response.timed_out,
        "total": response.total,
        "hits": response.hits,
    }


# ========== FLOW TOOLS ==========
# High-level user analysis workflows

@mcp.tool()
def fetch_elastic_user_logs(
    user_id: int,
    timeframe_minutes: int = 60,
    slow_request_threshold: float = 2.0,
    limit: int = 100,
    environment: Optional[str] = None,
    start_time: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Fetch user-specific logs from Elasticsearch including errors and slow requests.
    
    This flow tool searches for:
    - Error logs (json.levelname = ERROR)  
    - Slow requests (json.extra.request_time > threshold)
    
    The user_id is matched against both:
    - json.mobile_user_id (for mobile users)
    - json.user_id.keyword (for web users)
    
    Args:
        user_id: User ID to search for (int)
        timeframe_minutes: Time window to search (1-1440, default 60)
        slow_request_threshold: Request time threshold in seconds (default 2.0)
        limit: Max results per search type (1-1000, default 100)
        environment: Target environment (defaults to current)
        start_time: Optional start time in ISO format (e.g., '2025-06-23T00:00:00Z'). If not provided, uses current time minus timeframe_minutes.
        
    Returns:
        Dictionary with error_logs, slow_requests, and summary
    """
    
    if environment is None:
        environment = get_current_environment()
    
    # Validate inputs
    timeframe_minutes = max(1, min(timeframe_minutes, 1440))
    limit = max(1, min(limit, 1000))
    slow_request_threshold = max(0.1, slow_request_threshold)
    
    # Calculate time range
    if start_time:
        try:
            # Parse the provided start time
            start_time_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
            end_time = start_time_dt + timedelta(minutes=timeframe_minutes)
        except (ValueError, TypeError):
            # Fall back to current time if parsing fails
            end_time = datetime.now(timezone.utc)
            start_time_dt = end_time - timedelta(minutes=timeframe_minutes)
    else:
        end_time = datetime.now(timezone.utc)
        start_time_dt = end_time - timedelta(minutes=timeframe_minutes)
    
    # Build base query for user identification
    user_query = {
        "bool": {
            "should": [
                {"term": {"json.mobile_user_id": user_id}},
                {"term": {"json.user_id.keyword": str(user_id)}}
            ],
            "minimum_should_match": 1
        }
    }
    
    # Build time range filter
    time_filter = {
        "range": {
            "@timestamp": {
                "gte": start_time_dt.isoformat(),
                "lte": end_time.isoformat()
            }
        }
    }
    
    # Search for error logs
    error_query = {
        "bool": {
            "must": [
                user_query,
                time_filter,
                {"term": {"json.levelname": "ERROR"}}
            ]
        }
    }
    
    error_response = search_elastic_logs(
        index_pattern="app-logs-*",
        query=error_query,
        size=limit,
        sort=[{"@timestamp": {"order": "desc"}}]
    )
    
    # Search for slow requests
    slow_query = {
        "bool": {
            "must": [
                user_query,
                time_filter,
                {"range": {"json.extra.request_time": {"gt": slow_request_threshold}}}
            ]
        }
    }
    
    slow_response = search_elastic_logs(
        index_pattern="app-logs-*",
        query=slow_query,
        size=limit,
        sort=[{"json.extra.request_time": {"order": "desc"}}]
    )
    
    # Search for most recent log (no time filter to get absolute latest activity)
    recent_query = {
        "bool": {
            "must": [user_query]
        }
    }
    
    recent_response = search_elastic_logs(
        index_pattern="app-logs-*",
        query=recent_query,
        size=1,
        sort=[{"@timestamp": {"order": "desc"}}]
    )
    
    # Process results
    error_logs = []
    for hit in error_response.hits:
        source = hit.get("_source", {})
        error_logs.append({
            "timestamp": source.get("@timestamp"),
            "index": hit.get("_index"),
            "message": source.get("json", {}).get("message", source.get("message", "")),
            "level": source.get("json", {}).get("levelname", source.get("level", "")),
            "service": source.get("json", {}).get("logger_name", source.get("service", "")),
            "hostname": source.get("json", {}).get("hostname", source.get("hostname", "")),
            "user_id": user_id
        })
    
    slow_requests = []
    for hit in slow_response.hits:
        source = hit.get("_source", {})
        extra = source.get("json", {}).get("extra", {})
        slow_requests.append({
            "timestamp": source.get("@timestamp"),
            "index": hit.get("_index"),
            "message": source.get("json", {}).get("message", source.get("message", "")),
            "level": source.get("json", {}).get("levelname", source.get("level", "")),
            "service": source.get("json", {}).get("logger_name", source.get("service", "")),
            "hostname": source.get("json", {}).get("hostname", source.get("hostname", "")),
            "user_id": user_id,
            "request_time": extra.get("request_time"),
            "method": extra.get("method", ""),
            "url": extra.get("url", ""),
            "status_code": extra.get("status_code")
        })
    
    most_recent_log = None
    if recent_response.hits:
        hit = recent_response.hits[0]
        source = hit.get("_source", {})
        most_recent_log = {
            "timestamp": source.get("@timestamp"),
            "index": hit.get("_index"),
            "message": source.get("json", {}).get("message", source.get("message", "")),
            "level": source.get("json", {}).get("levelname", source.get("level", "")),
            "service": source.get("json", {}).get("logger_name", source.get("service", "")),
            "hostname": source.get("json", {}).get("hostname", source.get("hostname", "")),
            "user_id": user_id
        }
    
    # Generate insights
    insights = []
    total_errors = len(error_logs)
    total_slow_requests = len(slow_requests)
    has_recent_activity = most_recent_log is not None
    
    if has_recent_activity and most_recent_log:
        insights.append(f"✅ User found - last activity: {most_recent_log['timestamp']}")
    else:
        insights.append("⚠️ No recent activity found for this user")
    
    if total_errors > 0:
        insights.append(f"🚨 {total_errors} error(s) found - needs investigation")
    
    if total_slow_requests > 0:
        insights.append(f"⚠️ Multiple slow requests ({total_slow_requests}) - performance issues detected")
    
    if total_errors == 0 and total_slow_requests == 0 and has_recent_activity:
        insights.append("✅ No errors or performance issues detected")
    
    return {
        "summary": {
            "user_id": user_id,
            "timeframe_minutes": timeframe_minutes,
            "search_period": {
                "start": start_time_dt.isoformat(),
                "end": end_time.isoformat()
            },
            "total_errors": total_errors,
            "total_slow_requests": total_slow_requests,
            "has_recent_activity": has_recent_activity,
            "slow_request_threshold": slow_request_threshold,
            "max_results_per_type": limit,
            "insights": insights
        },
        "error_logs": error_logs,
        "slow_requests": slow_requests,
        "most_recent_log": most_recent_log
    }


@mcp.tool()
def fetch_user_errors_bugsnag(
    user_id: int,
    timeframe_minutes: int = 1440,
    start_time: Optional[str] = None,
    limit_per_project: int = 25
) -> Dict[str, Any]:
    """
    Fetch Bugsnag errors for a user across mobile and dashboard projects.
    
    This flow tool searches for user-specific errors in:
    - Mobile app (Connecteam project)
    - Dashboard (Connecteam-Dashboard project)
    
    Args:
        user_id: User ID to search for
        timeframe_minutes: Time window in minutes (default: 1440 = 24 hours)
        start_time: Optional start time in ISO format (e.g., '2025-06-23T00:00:00Z')
        limit_per_project: Max errors per project (default: 25)
        
    Returns:
        Dictionary containing errors from both mobile and dashboard projects
    """
    return fetch_bugsnag_user_logs(
        user_id=user_id,
        timeframe_minutes=timeframe_minutes,
        start_time=start_time,
        limit_per_project=limit_per_project
    )


@mcp.tool()
def get_connecteam_context_info() -> Dict[str, Any]:
    """
    Get Connecteam JIRA custom field reference information.
    
    Returns a mapping of JIRA custom fields to their meanings for 
    Connecteam bug investigation context.
    
    Returns:
        Dictionary mapping custom field IDs to their descriptions
    """
    return {
        "jira_context": {
            "customfield_10129": "User ID (CRITICAL - use this for Bugsnag/Elasticsearch searches)",
            "customfield_10130": "Company/Account ID (do NOT use as user ID)",
            "customfield_10147": "Company Identifier (bbdtotfipysfbeot format)",
            "customfield_10131": "Company Name",
            "customfield_10137": "Customer Email",
            "customfield_10126": "App Version (e.g., '9.1.1.34')",
            "customfield_10125": "OS Version (e.g., 'Android 13')",
            "customfield_10340": "Device Model (e.g., 'Samsung Note 20')",
            "customfield_10254": "Platform Array (e.g., ['Android'])",
            "customfield_10115": "Platform Category ('📱Mobile / Kiosk', '💻Web', etc.)",
            "customfield_10180": "Expected vs Actual behavior description",
            "customfield_10120": "Steps to reproduce",
            "customfield_10123": "Bug category (e.g., 'Performance')",
            "customfield_10206": "Feature area (e.g., 'Chat')",
            "customfield_10138": "Intercom conversation link",
            "customfield_10139": "HubSpot company link",
            "customfield_10140": "Matrix company link",
            "customfield_10298": "Service desk portal link"
        },
        "investigation_tips": [
            "Always use customfield_10129 (User ID) for searches, never customfield_10130",
            "Check platform to determine mobile vs web investigation focus",
            "Look for feature area to target specific error contexts in Bugsnag",
            "Use app version for filtering if investigating version-specific issues"
        ]
    }


if __name__ == "__main__":
    mcp.run()
