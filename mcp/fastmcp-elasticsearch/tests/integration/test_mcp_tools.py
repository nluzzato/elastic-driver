"""
Integration tests for MCP tools using the actual server functions.
"""

import pytest
import os
import sys
from unittest.mock import patch, Mock
from datetime import datetime, timedelta

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
sys.path.insert(0, project_root)


class TestPrimitiveTools:
    """Test MCP primitive tools integration."""

    @patch('utils.connection.get_elasticsearch_client')
    def test_search_logs_primitive_tool(self, mock_get_client):
        """Test the search_logs_primitive MCP tool."""
        # Import here to avoid import issues during test discovery
        from server_new import search_logs_primitive
        
        # Setup mock
        mock_es = Mock()
        mock_es.search.return_value = {
            "took": 5,
            "timed_out": False,
            "hits": {
                "total": {"value": 10},
                "hits": [
                    {
                        "_index": "app-logs-2024-01",
                        "_source": {
                            "@timestamp": "2024-01-15T10:30:00Z",
                            "json": {
                                "levelname": "INFO",
                                "message": "Test message",
                                "hostname": "test-pod"
                            }
                        }
                    }
                ]
            }
        }
        mock_get_client.return_value = mock_es
        
        # Test the tool
        result = search_logs_primitive(
            index_pattern="app-logs*",
            query={"match_all": {}},
            size=10
        )
        
        # Verify result structure
        assert "took" in result
        assert "total" in result
        assert "hits" in result
        assert result["total"] == 10
        assert len(result["hits"]) == 1
        
        # Verify Elasticsearch was called
        mock_es.search.assert_called_once()

    @patch('utils.connection.get_elasticsearch_client')
    def test_aggregate_data_primitive_tool(self, mock_get_client):
        """Test the aggregate_data_primitive MCP tool."""
        from server_new import aggregate_data_primitive
        
        # Setup mock
        mock_es = Mock()
        mock_es.search.return_value = {
            "took": 3,
            "timed_out": False,
            "aggregations": {
                "pods": {
                    "buckets": [
                        {"key": "pod-1", "doc_count": 100}
                    ]
                }
            }
        }
        mock_get_client.return_value = mock_es
        
        # Test the tool
        result = aggregate_data_primitive(
            index_pattern="app-logs*",
            query={"match_all": {}},
            aggregations={
                "pods": {
                    "terms": {"field": "json.hostname.keyword"}
                }
            }
        )
        
        # Verify result
        assert "aggregations" in result
        assert "pods" in result["aggregations"]

    @patch('utils.connection.get_elasticsearch_client')
    def test_get_index_stats_primitive_tool(self, mock_get_client):
        """Test the get_index_stats_primitive MCP tool."""
        from server_new import get_index_stats_primitive
        
        # Setup mock
        mock_es = Mock()
        mock_es.indices.stats.return_value = {
            "indices": {
                "app-logs-2024-01": {
                    "primaries": {
                        "docs": {"count": 1000, "deleted": 0},
                        "store": {"size_in_bytes": 1024000},
                        "indexing": {"index_total": 1000, "index_time_in_millis": 5000},
                        "search": {"query_total": 50, "query_time_in_millis": 1000},
                        "segments": {"count": 5},
                    }
                }
            }
        }
        mock_get_client.return_value = mock_es
        
        # Test the tool
        result = get_index_stats_primitive(index_pattern="app-logs*")
        
        # Verify result
        assert "app-logs-2024-01" in result
        stats = result["app-logs-2024-01"]
        assert stats["docs_count"] == 1000
        assert stats["store_size_bytes"] == 1024000


class TestWrapperTools:
    """Test MCP wrapper tools integration."""

    @patch('config.get_current_environment')
    @patch('config.get_index_config')
    @patch('config.get_field_mapping')
    @patch('utils.connection.get_elasticsearch_client')
    def test_search_app_logs_tool(self, mock_get_client, mock_field_mapping, 
                                  mock_index_config, mock_env):
        """Test the search_app_logs MCP tool."""
        from server_new import search_app_logs
        
        # Setup mocks
        mock_env.return_value = "test"
        mock_index_config.return_value = {"pattern": "app-logs-test-*"}
        mock_field_mapping.side_effect = lambda env, idx_type, field: {
            "timestamp": "@timestamp",
            "pod": "json.hostname",
            "level": "json.levelname",
            "message": "json.message"
        }.get(field)
        
        mock_es = Mock()
        mock_es.search.return_value = {
            "took": 5,
            "timed_out": False,
            "hits": {
                "total": {"value": 5},
                "hits": [
                    {
                        "_source": {
                            "@timestamp": "2024-01-15T10:30:00Z",
                            "json": {
                                "levelname": "ERROR",
                                "message": "Test error message",
                                "hostname": "test-pod-123",
                                "service_name": "test-service"
                            }
                        }
                    }
                ]
            }
        }
        mock_get_client.return_value = mock_es
        
        # Test the tool
        result = search_app_logs(
            pod_name="test-pod-123",
            level="ERROR",
            timeframe_minutes=60,
            limit=10
        )
        
        # Verify result
        assert isinstance(result, list)
        assert len(result) == 1
        log_entry = result[0]
        assert log_entry["level"] == "ERROR"
        assert log_entry["pod"] == "test-pod-123"
        assert log_entry["message"] == "Test error message"

    @patch('config.get_current_environment')
    @patch('config.get_index_config')
    @patch('config.get_field_mapping')
    @patch('utils.connection.get_elasticsearch_client')
    def test_list_active_pods_tool(self, mock_get_client, mock_field_mapping,
                                   mock_index_config, mock_env):
        """Test the list_active_pods MCP tool."""
        from server_new import list_active_pods
        
        # Setup mocks
        mock_env.return_value = "test"
        mock_index_config.return_value = {"pattern": "app-logs-test-*"}
        mock_field_mapping.side_effect = lambda env, idx_type, field: {
            "timestamp": "@timestamp",
            "pod": "json.hostname"
        }.get(field)
        
        mock_es = Mock()
        mock_es.search.return_value = {
            "aggregations": {
                "pods": {
                    "buckets": [
                        {"key": "pod-1"},
                        {"key": "pod-2"},
                        {"key": "pod-3"}
                    ]
                }
            }
        }
        mock_get_client.return_value = mock_es
        
        # Test the tool
        result = list_active_pods(timeframe_minutes=60)
        
        # Verify result
        assert isinstance(result, list)
        assert len(result) == 3
        assert "pod-1" in result
        assert "pod-2" in result
        assert "pod-3" in result


class TestFlowTools:
    """Test MCP flow tools integration."""

    @patch('server_new.search_app_logs')
    def test_investigate_issues_tool(self, mock_search_app_logs):
        """Test the investigate_issues MCP tool."""
        from server_new import investigate_issues
        
        # Mock the wrapper tool calls
        mock_search_app_logs.side_effect = [
            # Errors
            [{"level": "ERROR", "message": "Database error"}],
            # Warnings  
            [{"level": "WARNING", "message": "High memory usage"}],
            # Slow requests
            [{"message": "Slow query detected"}]
        ]
        
        # Test the tool
        result = investigate_issues(
            service_name="test-service",
            timeframe_minutes=60
        )
        
        # Verify result structure
        assert "summary" in result
        assert "error_count" in result
        assert "warning_count" in result
        assert "slow_request_count" in result
        assert "recommendations" in result
        
        # Verify counts
        assert result["error_count"] == 1
        assert result["warning_count"] == 1
        assert result["slow_request_count"] == 1
        
        # Verify search_app_logs was called 3 times
        assert mock_search_app_logs.call_count == 3
