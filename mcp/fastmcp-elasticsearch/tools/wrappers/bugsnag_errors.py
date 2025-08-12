"""
Wrapper tools for user-friendly Bugsnag error searches.
"""
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone, timedelta
from tools.primitives.bugsnag import search_bugsnag_errors, get_bugsnag_error_details, get_bugsnag_error_events


def search_user_errors_bugsnag(
    user_id: int,
    timeframe_minutes: int = 1440,
    start_time: Optional[str] = None,
    limit: int = 50
) -> Dict[str, Any]:
    """
    Search for Bugsnag errors associated with a specific user.
    
    This wrapper tool provides a user-friendly interface for finding client-side
    errors that affected a specific user within a given timeframe.
    
    Args:
        user_id: User ID to search for
        timeframe_minutes: Time window in minutes (default: 1440 = 24 hours)
        start_time: Optional start time in ISO format (e.g., '2025-06-23T00:00:00Z')
        limit: Maximum errors to return (1-100, default: 50)
        
    Returns:
        Dictionary containing user's errors with summary information
    """
    try:
        # Calculate time range
        if start_time:
            try:
                start_time_dt = datetime.fromisoformat(start_time.replace('Z', '+00:00'))
                end_time_dt = start_time_dt + timedelta(minutes=timeframe_minutes)
            except ValueError:
                # Fallback to current time if start_time is invalid
                end_time_dt = datetime.now(timezone.utc)
                start_time_dt = end_time_dt - timedelta(minutes=timeframe_minutes)
        else:
            end_time_dt = datetime.now(timezone.utc)
            start_time_dt = end_time_dt - timedelta(minutes=timeframe_minutes)
        
        # Search for errors
        result = search_bugsnag_errors(
            user_id=str(user_id),
            start_time=start_time_dt.isoformat(),
            end_time=end_time_dt.isoformat(),
            limit=limit
        )
        
        if result.get("error"):
            return result
        
        errors = result.get("errors", [])
        
        # Process and enrich error data
        processed_errors = []
        for error in errors:
            processed_error = {
                "id": error.get("id"),
                "class": error.get("class"),
                "message": error.get("message"),
                "context": error.get("context"),
                "first_seen": error.get("first_seen"),
                "last_seen": error.get("last_seen"),
                "events_count": error.get("events_count", 0),
                "users_count": error.get("users_count", 0),
                "severity": error.get("severity"),
                "status": error.get("status"),
                "assigned_user": error.get("assigned_user"),
                "url": error.get("url")
            }
            processed_errors.append(processed_error)
        
        # Generate summary
        total_errors = len(processed_errors)
        severity_counts = {}
        status_counts = {}
        
        for error in processed_errors:
            severity = error.get("severity", "unknown")
            status = error.get("status", "unknown")
            
            severity_counts[severity] = severity_counts.get(severity, 0) + 1
            status_counts[status] = status_counts.get(status, 0) + 1
        
        return {
            "user_id": user_id,
            "search_period": {
                "start": start_time_dt.isoformat(),
                "end": end_time_dt.isoformat(),
                "timeframe_minutes": timeframe_minutes
            },
            "summary": {
                "total_errors": total_errors,
                "severity_breakdown": severity_counts,
                "status_breakdown": status_counts,
                "has_critical_errors": any(e.get("severity") == "error" for e in processed_errors),
                "has_recent_errors": total_errors > 0
            },
            "errors": processed_errors[:10],  # Limit detailed errors for readability
            "all_errors_count": total_errors
        }
        
    except Exception as e:
        return {
            "error": True,
            "message": f"User error search failed: {str(e)}",
            "user_id": user_id
        }


def get_error_context_bugsnag(error_id: str, include_events: bool = True) -> Dict[str, Any]:
    """
    Get comprehensive context for a specific Bugsnag error.
    
    Args:
        error_id: Error ID to investigate
        include_events: Whether to include recent events/stack traces
        
    Returns:
        Error details with context and optionally recent events
    """
    try:
        # Get error details
        error_details = get_bugsnag_error_details(error_id)
        
        if error_details.get("error"):
            return error_details
        
        result = {
            "error_id": error_id,
            "details": error_details
        }
        
        # Optionally include recent events
        if include_events:
            events_result = get_bugsnag_error_events(error_id, limit=5)
            if not events_result.get("error"):
                result["recent_events"] = events_result.get("events", [])
                result["events_summary"] = {
                    "total_events": len(events_result.get("events", [])),
                    "latest_event": events_result.get("events", [{}])[0].get("received_at") if events_result.get("events") else None
                }
        
        return result
        
    except Exception as e:
        return {
            "error": True,
            "message": f"Failed to get error context: {str(e)}",
            "error_id": error_id
        }
