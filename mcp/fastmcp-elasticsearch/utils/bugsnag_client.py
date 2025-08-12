"""
Bugsnag (Insight Hub) API client for fetching error data.
"""
import httpx
import json
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone, timedelta
from config.bugsnag import get_bugsnag_config, get_auth_headers, validate_bugsnag_config


class BugsnagClient:
    """Client for interacting with Bugsnag API."""
    
    def __init__(self):
        self.config = get_bugsnag_config()
        self.base_url = self.config['base_url']
        self.timeout = self.config['timeout']
        
        if not validate_bugsnag_config():
            raise ValueError("Invalid Bugsnag configuration")
    
    async def _make_request(self, method: str, endpoint: str, params: Optional[Dict] = None) -> Dict[str, Any]:
        """
        Make authenticated request to Bugsnag API.
        
        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint (without base URL)
            params: Query parameters
            
        Returns:
            JSON response data
        """
        url = f"{self.base_url}{endpoint}"
        headers = get_auth_headers()
        
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            response = await client.request(
                method=method,
                url=url,
                headers=headers,
                params=params or {}
            )
            response.raise_for_status()
            return response.json()
    
    async def get_projects(self) -> List[Dict[str, Any]]:
        """
        Get list of projects in the organization.
        
        Returns:
            List of project data
        """
        endpoint = f"/organizations/{self.config['org_id']}/projects"
        return await self._make_request("GET", endpoint)
    
    async def search_errors(
        self,
        project_id: Optional[str] = None,
        user_id: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        limit: int = 50
    ) -> Dict[str, Any]:
        """
        Search for errors across projects with optional filtering.
        
        Args:
            project_id: Specific project ID (if provided, searches only that project)
            user_id: Filter by user ID
            start_time: Start time in ISO format
            end_time: End time in ISO format
            limit: Maximum results to return
            
        Returns:
            Dictionary containing errors data from all projects
        """
        if project_id:
            # Search specific project
            endpoint = f"/projects/{project_id}/errors"
            return await self._search_single_project(endpoint, user_id, start_time, end_time, limit)
        else:
            # Search all projects in the organization
            return await self._search_all_projects(user_id, start_time, end_time, limit)
    
    async def _search_single_project(
        self,
        endpoint: str,
        user_id: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        limit: int = 50
    ) -> Dict[str, Any]:
        """Search errors in a single project."""
        
        # Build query parameters
        params = {
            'per_page': min(limit, 100),  # API max is typically 100
            'sort': 'last_seen',
            'direction': 'desc'
        }
        
        # Add filters object according to Bugsnag API documentation
        filters = {}
        
        if user_id:
            filters['user.id'] = [{"eq": user_id}]
        
        if start_time:
            filters['since'] = [{"eq": start_time}]
        
        if end_time:
            filters['before'] = [{"eq": end_time}]
        
        if filters:
            params['filters'] = json.dumps(filters)
        
        response = await self._make_request("GET", endpoint, params)
        
        # Handle different response formats
        if isinstance(response, list):
            return {"errors": response}
        return response
    
    async def _search_all_projects(
        self,
        user_id: Optional[str] = None,
        start_time: Optional[str] = None,
        end_time: Optional[str] = None,
        limit: int = 50
    ) -> Dict[str, Any]:
        """Search for errors across all projects in the organization."""
        try:
            # Get all projects first
            projects = await self.get_projects()
            
            all_errors = []
            project_summaries = []
            
            for project in projects:
                project_id = project.get('id')
                project_name = project.get('name', 'Unknown')
                
                try:
                    # Search this project
                    endpoint = f"/projects/{project_id}/errors"
                    project_result = await self._search_single_project(
                        endpoint, user_id, start_time, end_time, 
                        min(limit, 25)  # Limit per project
                    )
                    
                    project_errors = project_result.get('errors', [])
                    
                    # Add project context to each error
                    for error in project_errors:
                        error['project_id'] = project_id
                        error['project_name'] = project_name
                    
                    all_errors.extend(project_errors)
                    
                    project_summaries.append({
                        'project_id': project_id,
                        'project_name': project_name,
                        'errors_found': len(project_errors)
                    })
                    
                except Exception as e:
                    project_summaries.append({
                        'project_id': project_id,
                        'project_name': project_name,
                        'errors_found': 0,
                        'error': str(e)
                    })
            
            # Sort by last_seen and limit total results
            all_errors.sort(
                key=lambda x: x.get('last_seen', ''), 
                reverse=True
            )
            
            return {
                'errors': all_errors[:limit],
                'total_projects_searched': len(projects),
                'project_summaries': project_summaries,
                'total_errors_found': len(all_errors)
            }
            
        except Exception as e:
            return {
                'error': True,
                'message': f'Multi-project search failed: {str(e)}',
                'errors': []
            }
    
    async def get_error_details(self, error_id: str) -> Dict[str, Any]:
        """
        Get detailed information about a specific error.
        
        Args:
            error_id: Error ID to fetch
            
        Returns:
            Error details
        """
        endpoint = f"/errors/{error_id}"
        return await self._make_request("GET", endpoint)
    
    async def get_error_events(
        self,
        error_id: str,
        limit: int = 30
    ) -> Dict[str, Any]:
        """
        Get events (instances) for a specific error.
        
        Args:
            error_id: Error ID
            limit: Maximum events to return
            
        Returns:
            List of error events
        """
        endpoint = f"/errors/{error_id}/events"
        params = {
            'per_page': min(limit, 100),
            'sort': 'received_at',
            'direction': 'desc'
        }
        return await self._make_request("GET", endpoint, params)


def test_bugsnag_connection() -> Dict[str, Any]:
    """
    Test Bugsnag API connection and configuration.
    
    Returns:
        Connection test results
    """
    try:
        if not validate_bugsnag_config():
            return {
                "status": "error",
                "message": "Invalid configuration - check environment variables"
            }
        
        client = BugsnagClient()
        
        # Try to fetch projects as a connectivity test
        import asyncio
        import concurrent.futures
        
        # Handle event loop properly
        try:
            # Try to get current event loop
            loop = asyncio.get_running_loop()
            # If we're in an event loop, use executor
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, client.get_projects())
                projects = future.result(timeout=30)
        except RuntimeError:
            # No event loop running, safe to use asyncio.run
            projects = asyncio.run(client.get_projects())
        
        return {
            "status": "success",
            "message": f"Connected successfully. Found {len(projects)} projects.",
            "projects": [{"id": p.get("id"), "name": p.get("name")} for p in projects]
        }
        
    except Exception as e:
        return {
            "status": "error",
            "message": f"Connection failed: {str(e)}"
        }
