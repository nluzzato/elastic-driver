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
        
        # Handle event loop properly
        import concurrent.futures
        
        async def _search():
            return await client.search_errors(
                project_id=project_id,
                user_id=user_id,
                start_time=start_time,
                end_time=end_time,
                limit=limit
            )
        
        try:
            # Try to get current event loop
            loop = asyncio.get_running_loop()
            # If we're in an event loop, use executor
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _search())
                result = future.result(timeout=30)
        except RuntimeError:
            # No event loop running, safe to use asyncio.run
            result = asyncio.run(_search())
        
        return result
            
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
        
        # Handle event loop properly
        import concurrent.futures
        
        async def _get_details():
            return await client.get_error_details(error_id)
        
        try:
            # Try to get current event loop
            loop = asyncio.get_running_loop()
            # If we're in an event loop, use executor
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _get_details())
                result = future.result(timeout=30)
        except RuntimeError:
            # No event loop running, safe to use asyncio.run
            result = asyncio.run(_get_details())
        
        return result
            
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
        
        # Handle event loop properly
        import concurrent.futures
        
        async def _get_events():
            return await client.get_error_events(error_id, limit)
        
        try:
            # Try to get current event loop
            loop = asyncio.get_running_loop()
            # If we're in an event loop, use executor
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _get_events())
                result = future.result(timeout=30)
        except RuntimeError:
            # No event loop running, safe to use asyncio.run
            result = asyncio.run(_get_events())
        
        return result
            
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
        
        # Handle event loop properly
        import concurrent.futures
        
        async def _get_projects():
            return await client.get_projects()
        
        try:
            # Try to get current event loop
            loop = asyncio.get_running_loop()
            # If we're in an event loop, use executor
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _get_projects())
                result = future.result(timeout=30)
        except RuntimeError:
            # No event loop running, safe to use asyncio.run
            result = asyncio.run(_get_projects())
        
        return {
            "projects": result,
            "count": len(result)
        }
            
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
