"""
Primitive tools for Bugsnag API access.
"""
import asyncio
from typing import Dict, List, Optional, Any
from utils.bugsnag_client import BugsnagClient, test_bugsnag_connection


def search_bugsnag_errors(
    project_id: Optional[str] = None,
    user_id: Optional[str] = None,
    start_time: Optional[str] = None,
    end_time: Optional[str] = None,
    limit: int = 50
) -> Dict[str, Any]:
    """
    Search for errors in Bugsnag with optional filtering.
    
    This primitive tool provides direct access to Bugsnag's error search API.
    
    Args:
        project_id: Specific project ID (uses default if not provided)
        user_id: Filter by user ID
        start_time: Start time in ISO format (e.g., '2025-06-23T00:00:00Z')
        end_time: End time in ISO format
        limit: Maximum results to return (1-100)
        
    Returns:
        Raw Bugsnag API response with errors data
    """
    try:
        client = BugsnagClient()
        
        # Run async function in sync context
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            result = loop.run_until_complete(
                client.search_errors(
                    project_id=project_id,
                    user_id=user_id,
                    start_time=start_time,
                    end_time=end_time,
                    limit=limit
                )
            )
            return result
        finally:
            loop.close()
            
    except Exception as e:
        return {
            "error": True,
            "message": f"Bugsnag search failed: {str(e)}",
            "errors": []
        }


def get_bugsnag_error_details(error_id: str) -> Dict[str, Any]:
    """
    Get detailed information about a specific Bugsnag error.
    
    Args:
        error_id: Error ID to fetch details for
        
    Returns:
        Detailed error information
    """
    try:
        client = BugsnagClient()
        
        # Run async function in sync context
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            result = loop.run_until_complete(
                client.get_error_details(error_id)
            )
            return result
        finally:
            loop.close()
            
    except Exception as e:
        return {
            "error": True,
            "message": f"Failed to get error details: {str(e)}"
        }


def get_bugsnag_error_events(
    error_id: str,
    limit: int = 30
) -> Dict[str, Any]:
    """
    Get events (instances) for a specific Bugsnag error.
    
    Args:
        error_id: Error ID
        limit: Maximum events to return (1-100)
        
    Returns:
        List of error events with stack traces and context
    """
    try:
        client = BugsnagClient()
        
        # Run async function in sync context
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            result = loop.run_until_complete(
                client.get_error_events(error_id, limit)
            )
            return result
        finally:
            loop.close()
            
    except Exception as e:
        return {
            "error": True,
            "message": f"Failed to get error events: {str(e)}",
            "events": []
        }


def get_bugsnag_projects() -> Dict[str, Any]:
    """
    Get list of Bugsnag projects in the organization.
    
    Returns:
        List of available projects
    """
    try:
        client = BugsnagClient()
        
        # Run async function in sync context
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        
        try:
            result = loop.run_until_complete(client.get_projects())
            return {
                "projects": result,
                "count": len(result)
            }
        finally:
            loop.close()
            
    except Exception as e:
        return {
            "error": True,
            "message": f"Failed to get projects: {str(e)}",
            "projects": []
        }


def bugsnag_health_check() -> Dict[str, Any]:
    """
    Test Bugsnag API connectivity and configuration.
    
    Returns:
        Health check results
    """
    return test_bugsnag_connection()
