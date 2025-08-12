"""
Pytest configuration and fixtures for MCP Elasticsearch tests.
"""

import pytest
import os
import sys
from unittest.mock import Mock, patch
from datetime import datetime, timedelta
from typing import Dict, Any

# Add the project root to the Python path
project_root = os.path.dirname(os.path.dirname(__file__))
sys.path.insert(0, project_root)


@pytest.fixture
def mock_elasticsearch():
    """Mock Elasticsearch client for testing."""
    mock_es = Mock()
    
    # Mock search response
    mock_es.search.return_value = {
        "took": 5,
        "timed_out": False,
        "hits": {
            "total": {"value": 100},
            "hits": [
                {
                    "_index": "app-logs-2024-01",
                    "_source": {
                        "@timestamp": "2024-01-15T10:30:00Z",
                        "json": {
                            "levelname": "INFO",
                            "message": "Test log message",
                            "hostname": "test-pod-123",
                            "service_name": "test-service",
                            "request_id": "req-123",
                        }
                    }
                }
            ]
        }
    }
    
    # Mock ping response
    mock_es.ping.return_value = True
    
    # Mock stats response
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
    
    return mock_es


@pytest.fixture
def mock_es_client(mock_elasticsearch):
    """Patch the get_elasticsearch_client function."""
    with patch('utils.connection.get_elasticsearch_client', return_value=mock_elasticsearch):
        yield mock_elasticsearch


@pytest.fixture
def sample_query():
    """Sample Elasticsearch query for testing."""
    return {
        "bool": {
            "must": [
                {"match_all": {}},
                {
                    "range": {
                        "@timestamp": {
                            "gte": (datetime.utcnow() - timedelta(hours=1)).isoformat()
                        }
                    }
                }
            ]
        }
    }


@pytest.fixture
def sample_aggregation():
    """Sample aggregation query for testing."""
    return {
        "pods": {
            "terms": {
                "field": "json.hostname.keyword",
                "size": 10
            }
        }
    }


@pytest.fixture
def test_environment_config():
    """Test environment configuration."""
    return {
        "name": "test",
        "elasticsearch": {
            "url": "http://localhost:9200",
            "username": None,
            "password": None,
            "api_key": None,
            "timeout_ms": 5000,
            "verify_certs": False,
        },
        "defaults": {
            "max_results": 100,
            "default_timeframe_minutes": 30,
            "max_timeframe_minutes": 1440,
        },
        "features": {
            "enable_caching": False,
            "enable_audit_logging": False,
            "enable_rate_limiting": False,
        },
    }


@pytest.fixture
def patch_environment(test_environment_config):
    """Patch environment configuration for testing."""
    with patch('config.environments.get_environment_config', return_value=test_environment_config), \
         patch('config.environments.get_current_environment', return_value='test'):
        yield
