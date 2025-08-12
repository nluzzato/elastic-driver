"""
FastMCP Elasticsearch Server - New Architecture.

This server implements a layered architecture with primitive, wrapper,
and flow tools for Elasticsearch operations.
"""

import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from fastmcp import FastMCP
from dotenv import load_dotenv

# Import our new architecture components
from config import (
    get_current_environment,
    get_environment_config,
    get_index_config,
    get_field_mapping,
)
from config.indices import get_level_mapping
from tools.primitives import (
    search_elastic_logs,
    aggregate_elastic_data,
    get_elastic_stats,
    check_index_exists,
)
from mcp_types import ElasticResponse, AggregationResponse
from mcp_types.domain import AppLog
from utils import (
    build_time_range_query,
    build_bool_query,
    build_match_query,
    validate_timeframe,
    validate_size,
    extract_bucket_values,
    test_connection,
)

# Load environment variables
load_dotenv()

# Initialize MCP server
mcp = FastMCP("connecteam-es-mcp")


# ========== PRIMITIVE TOOLS ==========
# These are exposed as MCP tools for direct low-level access

@mcp.tool()
def search_logs_primitive(
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


@mcp.tool()
def aggregate_data_primitive(
    index_pattern: str,
    query: Dict[str, Any],
    aggregations: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Low-level Elasticsearch aggregation.
    
    Execute aggregations using raw Elasticsearch Aggregation DSL.
    Use this for complex analytics that need full control.
    
    Args:
        index_pattern: Index pattern
        query: Filter query
        aggregations: Aggregation DSL definition
        
    Returns:
        Aggregation results
    """
    response = aggregate_elastic_data(
        index_pattern=index_pattern,
        query=query,
        aggregations=aggregations,
    )
    
    return {
        "took": response.took,
        "timed_out": response.timed_out,
        "aggregations": response.aggregations,
    }


@mcp.tool()
def get_index_stats_primitive(
    index_pattern: str,
) -> Dict[str, Any]:
    """
    Get statistics for Elasticsearch indices.
    
    Args:
        index_pattern: Index pattern
        
    Returns:
        Index statistics
    """
    stats = get_elastic_stats(index_pattern)
    
    # Convert to serializable format
    return {
        index_name: {
            "docs_count": stat.docs_count,
            "docs_deleted": stat.docs_deleted,
            "store_size_bytes": stat.store_size_bytes,
            "indexing_total": stat.indexing_index_total,
            "search_total": stat.search_query_total,
        }
        for index_name, stat in stats.items()
    }


# ========== WRAPPER TOOLS ==========
# Domain-aware tools that use primitives internally

@mcp.tool()
def search_app_logs(
    pod_name: Optional[str] = None,
    service_name: Optional[str] = None,
    level: Optional[str] = None,
    message_filter: Optional[str] = None,
    timeframe_minutes: int = 60,
    limit: int = 100,
    environment: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Search application logs with domain knowledge.
    
    This wrapper understands application log structure and provides
    a simplified interface compared to the raw primitive.
    
    Args:
        pod_name: Pod/hostname to filter by
        service_name: Service name to filter by  
        level: Log level (ERROR, WARNING, INFO, DEBUG)
        message_filter: Text to search in messages
        timeframe_minutes: Time window (1-1440)
        limit: Max results (1-1000)
        environment: Target environment (defaults to current)
        
    Returns:
        List of normalized log entries
    """
    
    
    # Use current environment if not specified
    if environment is None:
        environment = get_current_environment()
    
    # Validate inputs
    timeframe_minutes = validate_timeframe(timeframe_minutes, max_minutes=1440)
    limit = validate_size(limit, max_size=1000)
    
    # Get index configuration
    index_config = get_index_config(environment, "app_logs")
    index_pattern = index_config["pattern"]
    
    # Build query using field mappings
    must_filters = []
    
    # Time range
    timestamp_field = get_field_mapping(environment, "app_logs", "timestamp")
    must_filters.append(build_time_range_query(
        field=timestamp_field,
        minutes_ago=timeframe_minutes
    ))
    
    # Pod filter
    if pod_name:
        pod_field = get_field_mapping(environment, "app_logs", "pod")
        must_filters.append({
            "bool": {
                "should": [
                    {"term": {f"{pod_field}.keyword": pod_name}},
                    {"term": {pod_field: pod_name}},
                ],
                "minimum_should_match": 1,
            }
        })
    
    # Service filter
    if service_name:
        service_field = get_field_mapping(environment, "app_logs", "service")
        must_filters.append({"term": {f"{service_field}.keyword": service_name}})
    
    # Level filter
    if level:
        level_field = get_field_mapping(environment, "app_logs", "level")
        level_values = get_level_mapping(environment, "app_logs", level.upper())
        
        if len(level_values) == 1:
            must_filters.append({"term": {f"{level_field}.keyword": level_values[0]}})
        else:
            must_filters.append({
                "terms": {f"{level_field}.keyword": level_values}
            })
    
    # Message filter
    if message_filter:
        message_field = get_field_mapping(environment, "app_logs", "message")
        must_filters.append(build_match_query(message_field, message_filter))
    
    # Build final query
    query = build_bool_query(must=must_filters)
    
    # Define sort
    sort = [{timestamp_field: {"order": "desc"}}]
    
    # Execute search
    response = search_elastic_logs(
        index_pattern=index_pattern,
        query=query,
        size=limit,
        sort=sort,
        _source=True,
    )
    
    # Parse and normalize results
    
    results = []
    
    for hit in response.hits:
        try:
            app_log = AppLog.from_elastic(hit)
            results.append({
                "timestamp": app_log.timestamp.isoformat(),
                "level": app_log.level.value,
                "message": app_log.message,
                "pod": app_log.pod,
                "service": app_log.service,
                "module": app_log.module,
                "trace_id": app_log.trace_id,
                "request_id": app_log.request_id,
                "environment": app_log.environment,
                "deployment": app_log.deployment,
                "namespace": app_log.namespace,
            })
        except Exception as e:
            # Log parsing error but continue
            print(f"Error parsing log entry: {e}")
            
    return results


@mcp.tool()
def list_active_pods(
    timeframe_minutes: int = 60,
    environment: Optional[str] = None,
) -> List[str]:
    """
    List pods that have been active within timeframe.
    
    Args:
        timeframe_minutes: Time window (1-1440)
        environment: Target environment
        
    Returns:
        List of pod names
    """
    
    
    if environment is None:
        environment = get_current_environment()
        
    timeframe_minutes = validate_timeframe(timeframe_minutes, max_minutes=1440)
    
    # Get configuration
    index_config = get_index_config(environment, "app_logs")
    index_pattern = index_config["pattern"]
    timestamp_field = get_field_mapping(environment, "app_logs", "timestamp")
    pod_field = get_field_mapping(environment, "app_logs", "pod")
    
    # Build query
    query = build_time_range_query(
        field=timestamp_field,
        minutes_ago=timeframe_minutes
    )
    
    # Aggregate unique pods
    aggregations = {
        "pods": {
            "terms": {
                "field": f"{pod_field}.keyword",
                "size": 1000,
            }
        }
    }
    
    response = aggregate_elastic_data(
        index_pattern=index_pattern,
        query=query,
        aggregations=aggregations,
    )
    
    # Extract pod names
    
    pods = extract_bucket_values(response.aggregations.get("pods", {}))
    
    return [pod for pod in pods if isinstance(pod, str)]


# ========== FLOW TOOLS ==========
# High-level tools that orchestrate multiple operations

@mcp.tool()
def investigate_issues(
    service_name: Optional[str] = None,
    timeframe_minutes: int = 60,
    environment: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Comprehensive issue investigation across logs.
    
    This flow tool combines multiple searches to identify:
    - Errors and warnings
    - Slow requests
    - Failed requests
    - Anomalies
    
    Args:
        service_name: Optional service to focus on
        timeframe_minutes: Time window (1-1440)
        environment: Target environment
        
    Returns:
        Comprehensive issue report
    """
    # This is a placeholder - full implementation would orchestrate
    # multiple searches and aggregate findings
    
    if environment is None:
        environment = get_current_environment()
    
    # Search for errors
    errors = search_app_logs(
        service_name=service_name,
        level="ERROR",
        timeframe_minutes=timeframe_minutes,
        limit=50,
        environment=environment,
    )
    
    # Search for warnings
    warnings = search_app_logs(
        service_name=service_name,
        level="WARNING",
        timeframe_minutes=timeframe_minutes,
        limit=50,
        environment=environment,
    )
    
    # Search for slow requests
    slow_requests = search_app_logs(
        service_name=service_name,
        message_filter="slow",
        timeframe_minutes=timeframe_minutes,
        limit=50,
        environment=environment,
    )
    
    # Build report
    report = {
        "summary": f"Issue investigation for {service_name or 'all services'}",
        "timeframe_minutes": timeframe_minutes,
        "environment": environment,
        "error_count": len(errors),
        "warning_count": len(warnings),
        "slow_request_count": len(slow_requests),
        "top_errors": errors[:10],
        "top_warnings": warnings[:10],
        "top_slow_requests": slow_requests[:10],
        "recommendations": [],
    }
    
    # Add recommendations based on findings
    if len(errors) > 20:
        report["recommendations"].append("High error rate detected - investigate error patterns")
    if len(slow_requests) > 10:
        report["recommendations"].append("Performance degradation detected - check resource usage")
    
    return report


@mcp.tool()
def fetch_user_logs(
    user_id: int,
    timeframe_minutes: int = 60,
    slow_request_threshold: float = 2.0,
    limit: int = 100,
    environment: Optional[str] = None,
    start_time: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Fetch user-specific logs from app-logs* including errors and slow requests.
    
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
        except (ValueError, TypeError) as e:
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
                {"term": {"json.levelname.keyword": "ERROR"}}
            ]
        }
    }
    
    try:
        # Call the primitive search from tools.primitives
    
        
        error_response = search_elastic_logs(
            index_pattern="app-logs*",
            query=error_query,
            size=limit,
            sort=[{"@timestamp": {"order": "desc"}}]
        )
        
        error_logs = error_response.hits
        
    except Exception as e:
        error_logs = []
        print(f"Error searching for error logs: {e}")
    
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
    
    try:
        slow_response = search_elastic_logs(
            index_pattern="app-logs*", 
            query=slow_query,
            size=limit,
            sort=[{"json.extra.request_time": {"order": "desc"}}]
        )
        
        slow_requests = slow_response.hits
        
    except Exception as e:
        slow_requests = []
        print(f"Error searching for slow requests: {e}")
    
    # Search for the most recent log for this user (any log, no time restriction)
    recent_query = user_query  # Only user filter, no time restriction
    
    try:
        recent_response = search_elastic_logs(
            index_pattern="app-logs*",
            query=recent_query,
            size=1,  # Just get the most recent one
            sort=[{"@timestamp": {"order": "desc"}}]
        )
        
        recent_logs = recent_response.hits
        
    except Exception as e:
        recent_logs = []
        print(f"Error searching for recent logs: {e}")
    
    # Extract and format the logs for better readability
    def format_log(hit):
        source = hit.get("_source", {})
        json_data = source.get("json", {})
        
        formatted = {
            "timestamp": source.get("@timestamp"),
            "index": hit.get("_index"),
            "message": json_data.get("message", ""),
            "level": json_data.get("levelname", ""),
            "service": json_data.get("service_name", ""),
            "hostname": json_data.get("hostname", ""),
            "user_id": json_data.get("user_id") or json_data.get("mobile_user_id"),
        }
        
        # Add request-specific fields for slow requests
        if "extra" in json_data and "request_time" in json_data["extra"]:
            formatted["request_time"] = json_data["extra"]["request_time"]
            formatted["method"] = json_data["extra"].get("method", "")
            formatted["url"] = json_data["extra"].get("url", "")
            formatted["status_code"] = json_data["extra"].get("status_code", "")
        
        return formatted
    
    formatted_errors = [format_log(hit) for hit in error_logs]
    formatted_slow = [format_log(hit) for hit in slow_requests]
    formatted_recent = [format_log(hit) for hit in recent_logs]
    
    # Create summary
    summary = {
        "user_id": user_id,
        "timeframe_minutes": timeframe_minutes,
        "search_period": {
            "start": start_time_dt.isoformat(),
            "end": end_time.isoformat()
        },
        "total_errors": len(formatted_errors),
        "total_slow_requests": len(formatted_slow),
        "has_recent_activity": len(formatted_recent) > 0,
        "slow_request_threshold": slow_request_threshold,
        "max_results_per_type": limit
    }
    
    # Add insights
    insights = []
    if len(formatted_recent) == 0:
        insights.append("❌ No logs found for this user - verify user ID or field mapping")
    else:
        recent_timestamp = formatted_recent[0].get("timestamp", "")
        insights.append(f"✅ User found - last activity: {recent_timestamp}")
        
        # Check if recent activity was within the search timeframe
        if len(formatted_errors) == 0 and len(formatted_slow) == 0:
            insights.append("ℹ️ No errors/slow requests in the specified timeframe")
        
    if len(formatted_errors) > 10:
        insights.append(f"⚠️ High error count ({len(formatted_errors)}) - user may be experiencing issues")
    if len(formatted_slow) > 5:
        insights.append(f"⚠️ Multiple slow requests ({len(formatted_slow)}) - performance issues detected")
    
    summary["insights"] = insights
    
    return {
        "summary": summary,
        "error_logs": formatted_errors,
        "slow_requests": formatted_slow,
        "most_recent_log": formatted_recent[0] if formatted_recent else None
    }


# ========== HEALTH CHECK ==========

@mcp.tool()
def health() -> Dict[str, Any]:
    """
    Check MCP server health and connectivity.
    
    Returns:
        Health status
    """
    
    
    env = get_current_environment()
    connected = test_connection()
    
    return {
        "ok": connected,
        "environment": env,
        "version": "2.0.0",
        "architecture": "layered",
    }


if __name__ == "__main__":
    mcp.run()
