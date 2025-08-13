#!/usr/bin/env python3
"""
Debug script for testing Elasticsearch functionality.

Tests raw Elasticsearch queries and user analysis workflows.
"""
import sys
import os
from datetime import datetime, timezone, timedelta

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tools.primitives import search_elastic_logs
from utils.connection import test_connection
from debug.utils.test_helpers import (
    print_header, print_test, print_success, print_error, print_info, print_json,
    safe_call, exit_with_summary
)


class ElasticsearchTester:
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.test_user_id = 41343

    def test_basic_connectivity(self) -> bool:
        """Test basic Elasticsearch connectivity."""
        print_test("Elasticsearch Basic Connectivity")
        
        success, result = safe_call(test_connection)
        
        if success and result:
            print_success("Elasticsearch connection successful")
            self.passed += 1
            return True
        else:
            print_error(f"Elasticsearch connection failed: {result if not success else 'Returned False'}")
            self.failed += 1
            return False

    def test_simple_query(self) -> bool:
        """Test a simple match_all query."""
        print_test("Simple Match All Query")
        
        query = {"match_all": {}}
        
        success, result = safe_call(
            search_elastic_logs,
            index_pattern="app-logs-*",
            query=query,
            size=1
        )
        
        if success:
            print_success(f"Simple query successful - found {result.total} total documents")
            print_info(f"Query took: {result.took}ms")
            if result.hits:
                print_info(f"Sample index: {result.hits[0].get('_index')}")
            self.passed += 1
            return True
        else:
            print_error(f"Simple query failed: {result}")
            self.failed += 1
            return False

    def test_user_query(self) -> bool:
        """Test user-specific query."""
        print_test("User-Specific Query")
        
        user_query = {
            "bool": {
                "should": [
                    {"term": {"json.mobile_user_id": self.test_user_id}},
                    {"term": {"json.user_id.keyword": str(self.test_user_id)}}
                ],
                "minimum_should_match": 1
            }
        }
        
        print_json(user_query, "User Query")
        
        success, result = safe_call(
            search_elastic_logs,
            index_pattern="app-logs-*",
            query=user_query,
            size=5,
            sort=[{"@timestamp": {"order": "desc"}}]
        )
        
        if success:
            print_success(f"User query successful - found {result.total} documents for user {self.test_user_id}")
            print_info(f"Query took: {result.took}ms")
            if result.hits:
                latest_log = result.hits[0].get('_source', {})
                print_info(f"Latest activity: {latest_log.get('@timestamp')}")
            self.passed += 1
            return True
        else:
            print_error(f"User query failed: {result}")
            self.failed += 1
            return False

    def test_error_logs_query(self) -> bool:
        """Test query for error logs."""
        print_test("Error Logs Query")
        
        # Time range for last 24 hours
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(hours=24)
        
        error_query = {
            "bool": {
                "must": [
                    {
                        "bool": {
                            "should": [
                                {"term": {"json.mobile_user_id": self.test_user_id}},
                                {"term": {"json.user_id.keyword": str(self.test_user_id)}}
                            ],
                            "minimum_should_match": 1
                        }
                    },
                    {"term": {"json.levelname": "ERROR"}},
                    {
                        "range": {
                            "@timestamp": {
                                "gte": start_time.isoformat(),
                                "lte": end_time.isoformat()
                            }
                        }
                    }
                ]
            }
        }
        
        print_json(error_query, "Error Query")
        
        success, result = safe_call(
            search_elastic_logs,
            index_pattern="app-logs-*",
            query=error_query,
            size=10,
            sort=[{"@timestamp": {"order": "desc"}}]
        )
        
        if success:
            print_success(f"Error query successful - found {result.total} error logs for user {self.test_user_id}")
            print_info(f"Query took: {result.took}ms")
            for i, hit in enumerate(result.hits[:3]):  # Show first 3
                source = hit.get('_source', {})
                message = source.get('json', {}).get('message', source.get('message', 'No message'))
                print_info(f"Error {i+1}: {message[:100]}...")
            self.passed += 1
            return True
        else:
            print_error(f"Error query failed: {result}")
            self.failed += 1
            return False

    def test_slow_requests_query(self) -> bool:
        """Test query for slow requests."""
        print_test("Slow Requests Query")
        
        # Time range for last 24 hours
        end_time = datetime.now(timezone.utc)
        start_time = end_time - timedelta(hours=24)
        
        slow_query = {
            "bool": {
                "must": [
                    {
                        "bool": {
                            "should": [
                                {"term": {"json.mobile_user_id": self.test_user_id}},
                                {"term": {"json.user_id.keyword": str(self.test_user_id)}}
                            ],
                            "minimum_should_match": 1
                        }
                    },
                    {"range": {"json.extra.request_time": {"gt": 2.0}}},
                    {
                        "range": {
                            "@timestamp": {
                                "gte": start_time.isoformat(),
                                "lte": end_time.isoformat()
                            }
                        }
                    }
                ]
            }
        }
        
        print_json(slow_query, "Slow Request Query")
        
        success, result = safe_call(
            search_elastic_logs,
            index_pattern="app-logs-*",
            query=slow_query,
            size=10,
            sort=[{"json.extra.request_time": {"order": "desc"}}]
        )
        
        if success:
            print_success(f"Slow request query successful - found {result.total} slow requests for user {self.test_user_id}")
            print_info(f"Query took: {result.took}ms")
            for i, hit in enumerate(result.hits[:3]):  # Show first 3
                source = hit.get('_source', {})
                request_time = source.get('json', {}).get('extra', {}).get('request_time')
                url = source.get('json', {}).get('extra', {}).get('url', 'Unknown URL')
                print_info(f"Slow request {i+1}: {request_time}s - {url}")
            self.passed += 1
            return True
        else:
            print_error(f"Slow request query failed: {result}")
            self.failed += 1
            return False

    def test_index_patterns(self) -> bool:
        """Test different index patterns."""
        print_test("Index Pattern Testing")
        
        patterns = [
            "app-logs-*",
            "app-logs-access-*", 
            "app-logs-webserver-*"
        ]
        
        pattern_results = []
        
        for pattern in patterns:
            success, result = safe_call(
                search_elastic_logs,
                index_pattern=pattern,
                query={"match_all": {}},
                size=0  # Just get count
            )
            
            if success:
                pattern_results.append({
                    "pattern": pattern,
                    "total_docs": result.total,
                    "took_ms": result.took
                })
                print_info(f"{pattern}: {result.total} documents ({result.took}ms)")
            else:
                print_error(f"{pattern}: Failed - {result}")
                pattern_results.append({
                    "pattern": pattern,
                    "error": str(result)
                })
        
        if pattern_results:
            print_success(f"Index pattern testing completed - tested {len(patterns)} patterns")
            self.passed += 1
            return True
        else:
            print_error("All index patterns failed")
            self.failed += 1
            return False

    def run_all_tests(self) -> None:
        """Run all Elasticsearch tests."""
        print_header("ELASTICSEARCH FUNCTIONALITY TESTING")
        
        # Basic connectivity
        if not self.test_basic_connectivity():
            print_error("Skipping other tests due to connectivity failure")
            exit_with_summary(self.passed, self.failed)
        
        # Query tests
        self.test_simple_query()
        self.test_user_query()
        self.test_error_logs_query()
        self.test_slow_requests_query()
        self.test_index_patterns()
        
        # Summary
        exit_with_summary(self.passed, self.failed)


def main():
    """Main entry point."""
    tester = ElasticsearchTester()
    tester.run_all_tests()


if __name__ == "__main__":
    main()
