#!/usr/bin/env python3
"""
Debug script to test Bugsnag API filter parameter formatting.
"""
import json
import asyncio
from datetime import datetime, timezone, timedelta
from urllib.parse import urlencode, quote_plus
from utils.bugsnag_client import BugsnagClient

def test_filter_formatting():
    """Test how filters are formatted and URL-encoded."""
    print("🔧 Testing Bugsnag Filter Parameter Formatting\n")
    
    # Test data
    user_id = "41343"
    start_time = "2025-08-11T13:43:04.142880+00:00"
    end_time = "2025-08-12T13:43:04.142880+00:00"
    
    # Build filters as the client would
    filters = {}
    if user_id:
        filters['user.id'] = [{"eq": user_id}]
    if start_time:
        filters['since'] = [{"eq": start_time}]
    if end_time:
        filters['before'] = [{"eq": end_time}]
    
    print("1. Filter object (Python dict):")
    print(json.dumps(filters, indent=2))
    print()
    
    print("2. JSON-encoded filter:")
    json_filter = json.dumps(filters)
    print(json_filter)
    print()
    
    print("3. URL-encoded filter (what httpx will send):")
    url_encoded = quote_plus(json_filter)
    print(url_encoded)
    print()
    
    # Test params as they would be built
    params = {
        'per_page': 25,
        'sort': 'last_seen',
        'direction': 'desc',
        'filters': json_filter
    }
    
    print("4. Complete params object:")
    print(json.dumps(params, indent=2))
    print()
    
    print("5. URL query string (as httpx would build it):")
    query_string = urlencode(params)
    print(query_string)
    print()
    
    # Show the difference
    print("6. COMPARISON:")
    print("   ❌ OLD (broken): Python str representation gets URL-encoded")
    old_broken = str(filters).replace("'", "%27").replace(" ", "+").replace("{", "%7B").replace("}", "%7D")
    print(f"   {old_broken}")
    print()
    print("   ✅ NEW (correct): JSON string gets URL-encoded")
    print(f"   {url_encoded}")
    print()

async def test_real_api_call():
    """Test a real API call with the corrected filters."""
    print("🚀 Testing Real Bugsnag API Call\n")
    
    try:
        client = BugsnagClient()
        
        # Test with a simple project list first
        print("1. Testing basic connectivity (list projects):")
        projects = await client.get_projects()
        print(f"   ✅ Success! Found {len(projects)} projects")
        for project in projects:
            print(f"   - {project.get('name')} (ID: {project.get('id')})")
        print()
        
        # Test error search with filters
        print("2. Testing error search with user filter:")
        result = await client.search_errors(
            project_id="5d3d37ee9e40380011caf720",  # Mobile project
            user_id="41343",
            start_time="2025-08-11T13:43:04.142880+00:00",
            end_time="2025-08-12T13:43:04.142880+00:00",
            limit=5
        )
        
        print(f"   ✅ Search completed!")
        print(f"   - Errors found: {len(result.get('errors', []))}")
        if result.get('errors'):
            for error in result['errors'][:3]:  # Show first 3
                print(f"   - {error.get('class', 'Unknown')}: {error.get('message', 'No message')[:100]}")
        print()
        
    except Exception as e:
        print(f"   ❌ Error: {str(e)}")
        print()

def main():
    """Run all tests."""
    print("=" * 80)
    print("🐛 BUGSNAG FILTER DEBUGGING")
    print("=" * 80)
    print()
    
    # Test 1: Filter formatting
    test_filter_formatting()
    
    print("=" * 80)
    
    # Test 2: Real API call
    try:
        asyncio.run(test_real_api_call())
    except Exception as e:
        print(f"❌ Async test failed: {e}")
    
    print("=" * 80)
    print("✅ Debug script completed!")

if __name__ == "__main__":
    main()
