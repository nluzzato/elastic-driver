#!/usr/bin/env python3

"""
Test runner for MCP Elasticsearch server.

Usage:
    python run_tests.py [test_type] [options]
    
Test types:
    unit        - Run unit tests only
    integration - Run integration tests only  
    e2e         - Run end-to-end tests only
    manual      - Run manual tests (requires real Elasticsearch)
    all         - Run all tests (default)
    
Examples:
    python run_tests.py unit
    python run_tests.py integration -v
    python run_tests.py e2e --no-cov
    python run_tests.py manual  # Requires ELASTIC_URL env var
"""

import sys
import subprocess
import os
from pathlib import Path

def run_command(cmd, description):
    """Run a command and handle errors."""
    print(f"\n🔍 {description}")
    print(f"Running: {' '.join(cmd)}")
    
    result = subprocess.run(cmd, capture_output=True, text=True)
    
    if result.returncode == 0:
        print(f"✅ {description} completed successfully")
        if result.stdout:
            print(result.stdout)
    else:
        print(f"❌ {description} failed")
        if result.stderr:
            print("STDERR:", result.stderr)
        if result.stdout:
            print("STDOUT:", result.stdout)
        return False
    
    return True

def install_test_dependencies():
    """Install test dependencies."""
    tests_dir = Path(__file__).parent / "tests"
    requirements_file = tests_dir / "requirements.txt"
    
    if requirements_file.exists():
        cmd = [sys.executable, "-m", "pip", "install", "-r", str(requirements_file)]
        return run_command(cmd, "Installing test dependencies")
    else:
        print("⚠️  No test requirements.txt found")
        return True

def run_tests(test_type="all", extra_args=None):
    """Run tests based on type."""
    if extra_args is None:
        extra_args = []
    
    # Base pytest command
    cmd = [sys.executable, "-m", "pytest"]
    
    # Add coverage by default (unless --no-cov specified)
    if "--no-cov" not in extra_args:
        cmd.extend(["--cov=.", "--cov-report=term-missing"])
    
    # Determine test path based on type
    tests_dir = Path(__file__).parent / "tests"
    
    if test_type == "unit":
        cmd.append(str(tests_dir / "unit"))
    elif test_type == "integration":
        cmd.append(str(tests_dir / "integration"))
    elif test_type == "e2e":
        cmd.append(str(tests_dir / "e2e"))
        cmd.extend(["-m", "not manual"])  # Exclude manual tests
    elif test_type == "manual":
        cmd.append(str(tests_dir / "e2e"))
        cmd.extend(["-m", "manual"])
    elif test_type == "all":
        cmd.append(str(tests_dir))
        cmd.extend(["-m", "not manual"])  # Exclude manual tests by default
    else:
        print(f"❌ Unknown test type: {test_type}")
        return False
    
    # Add extra arguments
    cmd.extend(extra_args)
    
    return run_command(cmd, f"Running {test_type} tests")

def main():
    """Main test runner function."""
    # Parse arguments
    args = sys.argv[1:]
    test_type = "all"
    extra_args = []
    
    if args:
        if args[0] in ["unit", "integration", "e2e", "manual", "all"]:
            test_type = args[0]
            extra_args = args[1:]
        else:
            extra_args = args
    
    print(f"🧪 MCP Elasticsearch Server Test Runner")
    print(f"Test Type: {test_type}")
    print(f"Extra Args: {extra_args}")
    
    # Check if we're in the right directory
    current_dir = Path.cwd()
    expected_files = ["server.py", "tests", "tools", "mcp_types"]
    
    if not all((current_dir / f).exists() for f in expected_files):
        print("❌ Please run this script from the MCP server root directory")
        print(f"Current directory: {current_dir}")
        print(f"Expected files: {expected_files}")
        return 1
    
    # Install test dependencies
    if not install_test_dependencies():
        return 1
    
    # Check for manual test requirements
    if test_type == "manual":
        if not os.getenv("ELASTIC_URL"):
            print("❌ Manual tests require ELASTIC_URL environment variable")
            print("Set ELASTIC_URL to your Elasticsearch instance")
            return 1
        print("✅ ELASTIC_URL found - manual tests can proceed")
    
    # Run tests
    if not run_tests(test_type, extra_args):
        return 1
    
    print(f"\n🎉 All {test_type} tests completed successfully!")
    
    if test_type in ["all", "unit", "integration"]:
        print("\n💡 To run manual tests with real Elasticsearch:")
        print("   export ELASTIC_URL=http://your-elasticsearch:9200")
        print("   python run_tests.py manual")
    
    return 0

if __name__ == "__main__":
    sys.exit(main())
