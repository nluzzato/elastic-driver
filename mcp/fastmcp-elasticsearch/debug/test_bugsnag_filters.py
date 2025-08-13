#!/usr/bin/env python3
"""
Debug script for Bugsnag API filter testing.

This script tests various filter combinations to debug the 400 Bad Request
errors we're getting with user.id filtering.
"""
import asyncio
import json
import sys
import os
from urllib.parse import urlencode, unquote_plus

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.bugsnag_client import BugsnagClient
from config.bugsnag import get_bugsnag_config, validate_bugsnag_config
from debug.utils.test_helpers import (
    print_header, print_test, print_success, print_error, print_info, print_json,
    decode_url_filters, create_test_timeframe, safe_call, exit_with_summary
)


class BugsnagFilterTester:
    def __init__(self):
        self.client = None
        self.test_user_id = "41343"
        self.mobile_project_id = "5d3d37ee9e40380011caf720"
        self.dashboard_project_id = "607c531330d97a000df4982c"
        self.passed = 0
        self.failed = 0

    async def setup(self) -> bool:
        """Initialize and validate configuration."""
        print_test("Configuration Setup")
        
        try:
            config = get_bugsnag_config()
            validation = validate_bugsnag_config()
            
            if not validation['valid']:
                print_error(f"Invalid config: {validation['message']}")
                return False
            
            print_success("Configuration valid")
            print_info(f"Org ID: {config['org_id']}")
            print_info(f"Base URL: {config['base_url']}")
            
            self.client = BugsnagClient()
            return True
            
        except Exception as e:
            print_error(f"Setup failed: {e}")
            return False

    async def test_basic_connectivity(self) -> bool:
        """Test basic API connectivity without filters."""
        print_test("Basic Connectivity (No Filters)")
        
        success, result = await safe_call(self.client.get_projects)
        
        if success:
            projects = result
            print_success(f"Connected! Found {len(projects)} projects")
            for project in projects:
                print_info(f"- {project.get('name')} (ID: {project.get('id')})")
            self.passed += 1
            return True
        else:
            print_error(f"Failed: {result}")
            self.failed += 1
            return False

    async def test_no_filters_search(self) -> bool:
        """Test searching errors without any filters."""
        print_test("Error Search (No Filters)")
        
        success, result = await safe_call(
            self.client.search_errors,
            project_id=self.mobile_project_id,
            limit=5
        )
        
        if success:
            errors = result.get('errors', [])
            print_success(f"No-filter search successful! Found {len(errors)} errors")
            if errors:
                print_info(f"First error: {errors[0].get('class', 'Unknown')}")
            self.passed += 1
            return True
        else:
            print_error(f"Failed: {result}")
            self.failed += 1
            return False

    async def test_user_filter_only(self) -> bool:
        """Test with only user.id filter."""
        print_test("Error Search (User Filter Only)")
        
        # Show what filter we're building
        filters = {"user.id": [{"eq": self.test_user_id}]}
        json_filters = json.dumps(filters)
        print_info(f"Filter object: {json_filters}")
        
        success, result = await safe_call(
            self.client.search_errors,
            project_id=self.mobile_project_id,
            user_id=self.test_user_id,
            limit=5
        )
        
        if success:
            errors = result.get('errors', [])
            print_success(f"User-only filter successful! Found {len(errors)} errors")
            self.passed += 1
            return True
        else:
            print_error(f"Failed: {result}")
            # Let's examine the URL that was called
            if "400" in str(result):
                self._analyze_400_error(str(result))
            self.failed += 1
            return False

    async def test_time_filter_only(self) -> bool:
        """Test with only time filters."""
        print_test("Error Search (Time Filter Only)")
        
        start_time, end_time = create_test_timeframe(24)
        
        # Show what filters we're building
        filters = {
            "since": [{"eq": start_time}],
            "before": [{"eq": end_time}]
        }
        json_filters = json.dumps(filters)
        print_info(f"Filter object: {json_filters}")
        
        success, result = await safe_call(
            self.client.search_errors,
            project_id=self.mobile_project_id,
            start_time=start_time,
            end_time=end_time,
            limit=5
        )
        
        if success:
            errors = result.get('errors', [])
            print_success(f"Time-only filter successful! Found {len(errors)} errors")
            self.passed += 1
            return True
        else:
            print_error(f"Failed: {result}")
            if "400" in str(result):
                self._analyze_400_error(str(result))
            self.failed += 1
            return False

    async def test_combined_filters(self) -> bool:
        """Test with both user and time filters (our current issue)."""
        print_test("Error Search (Combined User + Time Filters)")
        
        start_time, end_time = create_test_timeframe(24)
        
        # Show what filters we're building
        filters = {
            "user.id": [{"eq": self.test_user_id}],
            "since": [{"eq": start_time}],
            "before": [{"eq": end_time}]
        }
        json_filters = json.dumps(filters)
        print_info(f"Filter object: {json_filters}")
        
        success, result = await safe_call(
            self.client.search_errors,
            project_id=self.mobile_project_id,
            user_id=self.test_user_id,
            start_time=start_time,
            end_time=end_time,
            limit=5
        )
        
        if success:
            errors = result.get('errors', [])
            print_success(f"Combined filter successful! Found {len(errors)} errors")
            self.passed += 1
            return True
        else:
            print_error(f"Failed: {result}")
            if "400" in str(result):
                self._analyze_400_error(str(result))
            self.failed += 1
            return False

    async def test_alternative_filter_formats(self) -> bool:
        """Test alternative filter formats that might work."""
        print_test("Alternative Filter Formats")
        
        # Test different approaches
        test_cases = [
            {
                "name": "Simple user.id as string",
                "filters": {"user.id": self.test_user_id}
            },
            {
                "name": "user.id with different operator structure",
                "filters": {"user.id": {"eq": self.test_user_id}}
            },
            {
                "name": "Different field name",
                "filters": {"user": [{"eq": self.test_user_id}]}
            }
        ]
        
        for i, test_case in enumerate(test_cases, 1):
            print_info(f"Test {i}: {test_case['name']}")
            print_json(test_case['filters'], "Filter")
            
            # We can't easily test these without modifying the client,
            # but we can show what they would look like
            json_filters = json.dumps(test_case['filters'])
            print_info(f"JSON: {json_filters}")
        
        print_info("These would require client modifications to test properly")
        self.passed += 1
        return True

    def _analyze_400_error(self, error_msg: str) -> None:
        """Analyze a 400 error to understand what went wrong."""
        print_info("Analyzing 400 error...")
        
        # Extract URL from error message
        if "url '" in error_msg:
            url_start = error_msg.find("url '") + 5
            url_end = error_msg.find("'", url_start)
            if url_end > url_start:
                url = error_msg[url_start:url_end]
                print_info(f"Full URL: {url}")
                
                # Extract filters parameter
                if "filters=" in url:
                    filters_start = url.find("filters=") + 8
                    filters_end = url.find("&", filters_start)
                    if filters_end == -1:
                        filters_end = len(url)
                    
                    encoded_filters = url[filters_start:filters_end]
                    print_info(f"Encoded filters: {encoded_filters}")
                    
                    # Decode filters
                    decoded_filters = decode_url_filters(encoded_filters)
                    if decoded_filters:
                        print_json(decoded_filters, "Decoded filters")

    async def run_all_tests(self) -> None:
        """Run all filter tests."""
        print_header("BUGSNAG FILTER TESTING")
        
        # Setup
        if not await self.setup():
            exit_with_summary(0, 1)
        
        # Run tests
        await self.test_basic_connectivity()
        await self.test_no_filters_search()
        await self.test_user_filter_only()
        await self.test_time_filter_only()
        await self.test_combined_filters()
        await self.test_alternative_filter_formats()
        
        # Summary
        exit_with_summary(self.passed, self.failed)


async def safe_call(func, *args, **kwargs):
    """Safely call an async function."""
    try:
        if asyncio.iscoroutinefunction(func):
            result = await func(*args, **kwargs)
        else:
            result = func(*args, **kwargs)
        return True, result
    except Exception as e:
        return False, str(e)


def main():
    """Main entry point."""
    tester = BugsnagFilterTester()
    asyncio.run(tester.run_all_tests())


if __name__ == "__main__":
    main()
