#!/usr/bin/env python3
"""
Debug script for testing the consolidated health check tool.

Tests both Elasticsearch and Bugsnag connectivity independently.
"""
import sys
import os

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.connection import test_connection
from tools.primitives.bugsnag import bugsnag_health_check
from config import get_current_environment
from debug.utils.test_helpers import (
    print_header, print_test, print_success, print_error, print_info, print_json,
    safe_call, exit_with_summary
)


class HealthTester:
    def __init__(self):
        self.passed = 0
        self.failed = 0

    def test_elasticsearch_connectivity(self) -> bool:
        """Test Elasticsearch connectivity."""
        print_test("Elasticsearch Connectivity")
        
        success, result = safe_call(test_connection)
        
        if success and result:
            print_success("Elasticsearch connected successfully")
            self.passed += 1
            return True
        else:
            print_error(f"Elasticsearch connection failed: {result if not success else 'Connection returned False'}")
            self.failed += 1
            return False

    def test_environment_config(self) -> bool:
        """Test environment configuration."""
        print_test("Environment Configuration")
        
        success, env = safe_call(get_current_environment)
        
        if success:
            print_success(f"Environment: {env}")
            self.passed += 1
            return True
        else:
            print_error(f"Environment config failed: {env}")
            self.failed += 1
            return False

    def test_bugsnag_connectivity(self) -> bool:
        """Test Bugsnag API connectivity."""
        print_test("Bugsnag API Connectivity")
        
        success, result = safe_call(bugsnag_health_check)
        
        if success:
            if result.get("status") == "success":
                projects = result.get("projects", [])
                print_success(f"Bugsnag connected successfully - {len(projects)} projects found")
                for project in projects:
                    print_info(f"- {project.get('name')} (ID: {project.get('id')})")
                self.passed += 1
                return True
            else:
                print_error(f"Bugsnag connection failed: {result.get('message', 'Unknown error')}")
                self.failed += 1
                return False
        else:
            print_error(f"Bugsnag health check failed: {result}")
            self.failed += 1
            return False

    def test_consolidated_health(self) -> bool:
        """Test the consolidated health function (simulated)."""
        print_test("Consolidated Health Check (Simulated)")
        
        # Get environment
        env_success, env = safe_call(get_current_environment)
        
        # Test Elasticsearch
        es_success, es_result = safe_call(test_connection)
        elasticsearch_connected = es_success and es_result
        
        # Test Bugsnag
        bugsnag_success, bugsnag_result = safe_call(bugsnag_health_check)
        bugsnag_connected = bugsnag_success and bugsnag_result.get("status") == "success"
        
        # Simulate consolidated response
        health_response = {
            "overall_status": "healthy" if elasticsearch_connected and bugsnag_connected else "degraded",
            "environment": env if env_success else "unknown",
            "services": {
                "elasticsearch": {
                    "service": "elasticsearch",
                    "connected": elasticsearch_connected,
                    "environment": env if env_success else "unknown",
                    "version": "2.0.0"
                },
                "bugsnag": {
                    "service": "bugsnag", 
                    "connected": bugsnag_connected,
                    "projects_count": len(bugsnag_result.get("projects", [])) if bugsnag_success else 0
                }
            }
        }
        
        print_json(health_response, "Consolidated Health Response")
        
        if health_response["overall_status"] == "healthy":
            print_success("Overall system health: HEALTHY")
            self.passed += 1
            return True
        else:
            print_error("Overall system health: DEGRADED")
            self.failed += 1
            return False

    def run_all_tests(self) -> None:
        """Run all health tests."""
        print_header("HEALTH CHECK TESTING")
        
        # Test individual components
        self.test_environment_config()
        self.test_elasticsearch_connectivity()
        self.test_bugsnag_connectivity()
        
        # Test consolidated health
        self.test_consolidated_health()
        
        # Summary
        exit_with_summary(self.passed, self.failed)


def main():
    """Main entry point."""
    tester = HealthTester()
    tester.run_all_tests()


if __name__ == "__main__":
    main()
