#!/usr/bin/env python3
"""
Test script to verify Bugsnag API calls are working with corrected filters.
"""
import os
import json
import asyncio
import sys
from utils.bugsnag_client import BugsnagClient
from config.bugsnag import get_bugsnag_config, validate_bugsnag_config

async def test_bugsnag_api():
    """Test actual Bugsnag API calls."""
    print("🐛 Testing Bugsnag API with corrected filter formatting\n")
    
    # Check configuration
    print("1. Checking configuration...")
    try:
        config = get_bugsnag_config()
        validation_result = validate_bugsnag_config()
        
        if not validation_result['valid']:
            print(f"   ❌ Config invalid: {validation_result['message']}")
            print(f"   Missing: {validation_result.get('missing_vars', [])}")
            return False
        
        print(f"   ✅ Config valid")
        print(f"   - API Token: {'*' * 20}...{config['api_token'][-4:] if config['api_token'] else 'None'}")
        print(f"   - Org ID: {config['org_id']}")
        print(f"   - Base URL: {config['base_url']}")
        print()
        
    except Exception as e:
        print(f"   ❌ Config error: {e}")
        return False
    
    # Test API connectivity
    print("2. Testing basic API connectivity...")
    try:
        client = BugsnagClient()
        projects = await client.get_projects()
        
        print(f"   ✅ Connected! Found {len(projects)} projects:")
        for project in projects:
            print(f"   - {project.get('name', 'Unknown')} (ID: {project.get('id', 'Unknown')})")
        print()
        
        # Find the mobile project
        mobile_project_id = None
        dashboard_project_id = None
        
        for project in projects:
            name = project.get('name', '').lower()
            if 'connecteam' in name and 'dashboard' not in name:
                mobile_project_id = project.get('id')
            elif 'dashboard' in name:
                dashboard_project_id = project.get('id')
        
        print(f"   📱 Mobile project ID: {mobile_project_id}")
        print(f"   💻 Dashboard project ID: {dashboard_project_id}")
        print()
        
    except Exception as e:
        print(f"   ❌ API connectivity failed: {e}")
        return False
    
    # Test error search without filters first
    print("3. Testing error search WITHOUT filters (should work)...")
    try:
        if mobile_project_id:
            result = await client.search_errors(
                project_id=mobile_project_id,
                limit=5
            )
            errors = result.get('errors', [])
            print(f"   ✅ No-filter search successful! Found {len(errors)} errors")
            if errors:
                print(f"   - First error: {errors[0].get('class', 'Unknown')}")
            print()
        else:
            print("   ⚠️ No mobile project found to test")
            print()
            
    except Exception as e:
        print(f"   ❌ No-filter search failed: {e}")
        return False
    
    # Test error search WITH user filter
    print("4. Testing error search WITH user filter (the critical test)...")
    try:
        if mobile_project_id:
            result = await client.search_errors(
                project_id=mobile_project_id,
                user_id="41343",
                limit=5
            )
            errors = result.get('errors', [])
            print(f"   ✅ User-filtered search successful! Found {len(errors)} errors for user 41343")
            if errors:
                for i, error in enumerate(errors[:3], 1):
                    print(f"   - Error {i}: {error.get('class', 'Unknown')}: {error.get('message', 'No message')[:80]}...")
            else:
                print("   - No errors found for this specific user (which may be correct)")
            print()
            
        else:
            print("   ⚠️ No mobile project found to test")
            print()
            
    except Exception as e:
        print(f"   ❌ User-filtered search failed: {e}")
        print(f"   Error details: {str(e)}")
        
        # If it's still a 400 error, let's examine the URL
        if "400" in str(e):
            print(f"   🔍 Still getting 400 error - let's check what we're sending...")
            
            # Build the exact same filters to see what's being sent
            filters = {"user.id": [{"eq": "41343"}]}
            json_filters = json.dumps(filters)
            print(f"   - JSON filters: {json_filters}")
            
            from urllib.parse import quote_plus
            encoded_filters = quote_plus(json_filters)
            print(f"   - URL encoded: {encoded_filters}")
            
        return False
    
    # Test with time filters too
    print("5. Testing error search WITH user + time filters...")
    try:
        if mobile_project_id:
            result = await client.search_errors(
                project_id=mobile_project_id,
                user_id="41343",
                start_time="2025-08-11T00:00:00.000Z",
                end_time="2025-08-12T23:59:59.999Z",
                limit=5
            )
            errors = result.get('errors', [])
            print(f"   ✅ User+time filtered search successful! Found {len(errors)} errors")
            print()
            
        else:
            print("   ⚠️ No mobile project found to test")
            print()
            
    except Exception as e:
        print(f"   ❌ User+time filtered search failed: {e}")
        return False
    
    print("✅ All Bugsnag API tests completed successfully!")
    return True

def main():
    """Run the test."""
    print("=" * 80)
    print("🧪 BUGSNAG API TESTING")
    print("=" * 80)
    print()
    
    try:
        success = asyncio.run(test_bugsnag_api())
        if success:
            print("\n🎉 ALL TESTS PASSED - Bugsnag integration is working!")
        else:
            print("\n❌ TESTS FAILED - Bugsnag integration needs more work")
            sys.exit(1)
    except Exception as e:
        print(f"\n💥 Test runner failed: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
