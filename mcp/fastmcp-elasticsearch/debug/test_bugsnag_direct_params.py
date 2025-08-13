#!/usr/bin/env python3
"""
Test Bugsnag API with direct query parameters instead of filters object.

This tests if Bugsnag expects direct query parameters rather than a filters object.
"""
import asyncio
import httpx
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config.bugsnag import get_bugsnag_config, get_auth_headers
from debug.utils.test_helpers import (
    print_header, print_test, print_success, print_error, print_info, print_json,
    safe_call, exit_with_summary
)


class BugsnagDirectParamTester:
    def __init__(self):
        self.config = get_bugsnag_config()
        self.base_url = self.config['base_url']
        self.timeout = self.config['timeout']
        self.mobile_project_id = "5d3d37ee9e40380011caf720"
        self.test_user_id = "41343"
        self.passed = 0
        self.failed = 0

    async def test_direct_user_param(self) -> bool:
        """Test with user.id as direct query parameter."""
        print_test("Direct Query Parameter: user.id")
        
        endpoint = f"/projects/{self.mobile_project_id}/errors"
        params = {
            'per_page': 5,
            'sort': 'last_seen',
            'direction': 'desc',
            'user.id': self.test_user_id
        }
        
        print_info(f"Testing params: {params}")
        
        success, result = await self._make_request("GET", endpoint, params)
        
        if success:
            errors = result if isinstance(result, list) else result.get('errors', [])
            print_success(f"Direct user.id param successful! Found {len(errors)} errors")
            self.passed += 1
            return True
        else:
            print_error(f"Failed: {result}")
            self.failed += 1
            return False

    async def test_direct_time_params(self) -> bool:
        """Test with since/before as direct query parameters."""
        print_test("Direct Query Parameters: since/before")
        
        endpoint = f"/projects/{self.mobile_project_id}/errors"
        params = {
            'per_page': 5,
            'sort': 'last_seen',
            'direction': 'desc',
            'since': '2025-08-12T00:00:00Z',
            'before': '2025-08-13T00:00:00Z'
        }
        
        print_info(f"Testing params: {params}")
        
        success, result = await self._make_request("GET", endpoint, params)
        
        if success:
            errors = result if isinstance(result, list) else result.get('errors', [])
            print_success(f"Direct time params successful! Found {len(errors)} errors")
            self.passed += 1
            return True
        else:
            print_error(f"Failed: {result}")
            self.failed += 1
            return False

    async def test_alternative_user_fields(self) -> bool:
        """Test alternative user field names."""
        print_test("Alternative User Field Names")
        
        endpoint = f"/projects/{self.mobile_project_id}/errors"
        
        # Try different user field variations
        test_fields = [
            ('user', self.test_user_id),
            ('user_id', self.test_user_id),
            ('userId', self.test_user_id),
            ('user-id', self.test_user_id)
        ]
        
        for field_name, value in test_fields:
            print_info(f"Testing field: {field_name} = {value}")
            
            params = {
                'per_page': 5,
                'sort': 'last_seen',
                'direction': 'desc',
                field_name: value
            }
            
            success, result = await self._make_request("GET", endpoint, params)
            
            if success:
                errors = result if isinstance(result, list) else result.get('errors', [])
                print_success(f"Field '{field_name}' worked! Found {len(errors)} errors")
                self.passed += 1
                return True
            else:
                print_info(f"Field '{field_name}' failed: {str(result)[:100]}")
        
        print_error("No alternative user fields worked")
        self.failed += 1
        return False

    async def test_search_endpoint(self) -> bool:
        """Test if there's a different search endpoint."""
        print_test("Alternative Search Endpoint")
        
        # Try /search endpoint instead of /errors
        endpoint = f"/projects/{self.mobile_project_id}/search"
        params = {
            'query': f'user.id:{self.test_user_id}',
            'per_page': 5
        }
        
        print_info(f"Testing search endpoint with query: {params['query']}")
        
        success, result = await self._make_request("GET", endpoint, params)
        
        if success:
            print_success("Search endpoint worked!")
            print_json(result, "Search Result")
            self.passed += 1
            return True
        else:
            print_error(f"Search endpoint failed: {result}")
            self.failed += 1
            return False

    async def test_events_endpoint(self) -> bool:
        """Test if we should use events endpoint instead."""
        print_test("Events Endpoint")
        
        # Try getting events instead of errors
        endpoint = f"/projects/{self.mobile_project_id}/events"
        params = {
            'per_page': 5,
            'sort': 'received_at',
            'direction': 'desc'
        }
        
        print_info("Testing events endpoint (no filters)")
        
        success, result = await self._make_request("GET", endpoint, params)
        
        if success:
            events = result if isinstance(result, list) else result.get('events', [])
            print_success(f"Events endpoint worked! Found {len(events)} events")
            
            # Now try with user filter
            params['user.id'] = self.test_user_id
            print_info("Testing events endpoint with user.id filter")
            
            success2, result2 = await self._make_request("GET", endpoint, params)
            if success2:
                filtered_events = result2 if isinstance(result2, list) else result2.get('events', [])
                print_success(f"Events with user filter worked! Found {len(filtered_events)} events")
                self.passed += 1
                return True
            else:
                print_error(f"Events with user filter failed: {result2}")
                self.failed += 1
                return False
        else:
            print_error(f"Events endpoint failed: {result}")
            self.failed += 1
            return False

    async def _make_request(self, method: str, endpoint: str, params: dict = None) -> tuple[bool, any]:
        """Make an HTTP request to Bugsnag API."""
        try:
            url = f"{self.base_url}{endpoint}"
            headers = get_auth_headers()
            
            print_info(f"URL: {url}")
            if params:
                from urllib.parse import urlencode
                query_string = urlencode(params)
                print_info(f"Query string: {query_string}")
            
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.request(
                    method=method,
                    url=url,
                    headers=headers,
                    params=params or {}
                )
                
                print_info(f"Response status: {response.status_code}")
                
                if response.status_code == 200:
                    return True, response.json()
                else:
                    return False, f"HTTP {response.status_code}: {response.text[:200]}"
                    
        except Exception as e:
            return False, str(e)

    async def run_all_tests(self) -> None:
        """Run all direct parameter tests."""
        print_header("BUGSNAG DIRECT PARAMETER TESTING")
        
        print_info("Testing alternative parameter approaches...")
        print_info(f"Base URL: {self.base_url}")
        print_info(f"Project ID: {self.mobile_project_id}")
        print_info(f"Test User ID: {self.test_user_id}")
        
        # Run tests
        await self.test_direct_user_param()
        await self.test_direct_time_params()
        await self.test_alternative_user_fields()
        await self.test_search_endpoint()
        await self.test_events_endpoint()
        
        # Summary
        exit_with_summary(self.passed, self.failed)


def main():
    """Main entry point."""
    tester = BugsnagDirectParamTester()
    asyncio.run(tester.run_all_tests())


if __name__ == "__main__":
    main()
