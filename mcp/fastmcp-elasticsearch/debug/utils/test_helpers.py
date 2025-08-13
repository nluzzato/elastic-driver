"""
Shared test utilities and helpers for debug scripts.
"""
import json
import sys
from datetime import datetime, timezone, timedelta
from typing import Any, Dict, Optional
from urllib.parse import unquote_plus


def print_header(title: str) -> None:
    """Print a formatted test section header."""
    print("\n" + "=" * 80)
    print(f"🧪 {title}")
    print("=" * 80)


def print_test(test_name: str) -> None:
    """Print a formatted test name."""
    print(f"\n🔍 {test_name}")
    print("-" * 60)


def print_success(message: str) -> None:
    """Print a success message."""
    print(f"   ✅ {message}")


def print_error(message: str) -> None:
    """Print an error message."""
    print(f"   ❌ {message}")


def print_info(message: str) -> None:
    """Print an info message."""
    print(f"   ℹ️  {message}")


def print_json(data: Any, title: str = "JSON Data") -> None:
    """Pretty print JSON data."""
    print(f"   📄 {title}:")
    json_str = json.dumps(data, indent=4, default=str)
    for line in json_str.split('\n'):
        print(f"      {line}")


def decode_url_filters(encoded_filters: str) -> Dict[str, Any]:
    """Decode URL-encoded filter parameters."""
    try:
        decoded = unquote_plus(encoded_filters)
        return json.loads(decoded)
    except Exception as e:
        print_error(f"Failed to decode filters: {e}")
        return {}


def create_test_timeframe(hours_ago: int = 24) -> tuple[str, str]:
    """Create start and end times for testing."""
    end_time = datetime.now(timezone.utc)
    start_time = end_time - timedelta(hours=hours_ago)
    return start_time.isoformat(), end_time.isoformat()


def validate_json_format(data: Any) -> bool:
    """Validate that data can be JSON serialized."""
    try:
        json.dumps(data)
        return True
    except (TypeError, ValueError):
        return False


def safe_call(func, *args, **kwargs) -> tuple[bool, Any]:
    """Safely call a function and return (success, result)."""
    try:
        result = func(*args, **kwargs)
        return True, result
    except Exception as e:
        return False, str(e)


def exit_with_summary(passed: int, failed: int) -> None:
    """Exit with a test summary."""
    total = passed + failed
    print(f"\n{'='*80}")
    print(f"📊 TEST SUMMARY")
    print(f"{'='*80}")
    print(f"   Total Tests: {total}")
    print(f"   ✅ Passed: {passed}")
    print(f"   ❌ Failed: {failed}")
    
    if failed == 0:
        print("   🎉 ALL TESTS PASSED!")
        sys.exit(0)
    else:
        print(f"   ⚠️  {failed} test(s) failed")
        sys.exit(1)
