"""
Unit tests for primitive search operations.
"""

import pytest
from unittest.mock import patch
from datetime import datetime

from tools.primitives.search import search_elastic_logs, scroll_elastic_logs
from mcp_types.primitives import ElasticResponse


class TestSearchElasticLogs:
    """Test cases for search_elastic_logs function."""

    def test_search_basic_query(self, mock_es_client, sample_query):
        """Test basic search functionality."""
        result = search_elastic_logs(
            index_pattern="app-logs*",
            query=sample_query,
            size=10
        )
        
        assert isinstance(result, ElasticResponse)
        assert result.took == 5
        assert result.timed_out is False
        assert result.total == 100
        assert len(result.hits) == 1
        
        # Verify the mock was called correctly
        mock_es_client.search.assert_called_once()
        call_args = mock_es_client.search.call_args
        assert call_args[1]["index"] == "app-logs*"
        assert "query" in call_args[1]["body"]

    def test_search_with_pagination(self, mock_es_client, sample_query):
        """Test search with pagination parameters."""
        result = search_elastic_logs(
            index_pattern="logs-*",
            query=sample_query,
            size=50,
            from_=20
        )
        
        # Verify pagination parameters
        call_args = mock_es_client.search.call_args
        body = call_args[1]["body"]
        assert body["size"] == 50
        assert body["from"] == 20

    def test_search_with_sort(self, mock_es_client, sample_query):
        """Test search with sort parameters."""
        sort_criteria = [{"@timestamp": {"order": "desc"}}]
        
        result = search_elastic_logs(
            index_pattern="logs-*",
            query=sample_query,
            sort=sort_criteria
        )
        
        call_args = mock_es_client.search.call_args
        body = call_args[1]["body"]
        assert body["sort"] == sort_criteria

    def test_search_with_fields(self, mock_es_client, sample_query):
        """Test search with specific fields."""
        fields = ["@timestamp", "json.message", "json.levelname"]
        
        result = search_elastic_logs(
            index_pattern="logs-*",
            query=sample_query,
            fields=fields
        )
        
        call_args = mock_es_client.search.call_args
        body = call_args[1]["body"]
        assert body["fields"] == fields

    def test_search_size_validation(self, mock_es_client, sample_query):
        """Test that size parameter is properly validated."""
        # Test minimum clamp
        result = search_elastic_logs(
            index_pattern="logs-*",
            query=sample_query,
            size=0  # Should be clamped to 1
        )
        
        call_args = mock_es_client.search.call_args
        body = call_args[1]["body"]
        assert body["size"] == 1
        
        # Test maximum clamp
        result = search_elastic_logs(
            index_pattern="logs-*",
            query=sample_query,
            size=15000  # Should be clamped to 10000
        )
        
        call_args = mock_es_client.search.call_args
        body = call_args[1]["body"]
        assert body["size"] == 10000

    def test_search_invalid_index_pattern(self, mock_es_client, sample_query):
        """Test validation of index patterns."""
        with pytest.raises(ValueError, match="Index pattern cannot be empty"):
            search_elastic_logs(
                index_pattern="",
                query=sample_query
            )

    def test_search_elasticsearch_error(self, mock_es_client, sample_query):
        """Test handling of Elasticsearch errors."""
        mock_es_client.search.side_effect = Exception("Connection failed")
        
        with pytest.raises(Exception, match="Elasticsearch query failed"):
            search_elastic_logs(
                index_pattern="logs-*",
                query=sample_query
            )

    def test_search_with_scroll(self, mock_es_client, sample_query):
        """Test search with scroll for large result sets."""
        mock_es_client.search.return_value["_scroll_id"] = "scroll123"
        
        result = search_elastic_logs(
            index_pattern="logs-*",
            query=sample_query,
            scroll="1m"
        )
        
        # Verify scroll was used
        call_args = mock_es_client.search.call_args
        assert call_args[1]["scroll"] == "1m"
        assert result._scroll_id == "scroll123"


class TestScrollElasticLogs:
    """Test cases for scroll_elastic_logs function."""

    def test_scroll_continuation(self, mock_es_client):
        """Test continuing scroll through results."""
        mock_es_client.scroll.return_value = {
            "took": 3,
            "timed_out": False,
            "hits": {
                "total": {"value": 200},
                "hits": []
            },
            "_scroll_id": "new_scroll_id"
        }
        
        result = scroll_elastic_logs(
            scroll_id="scroll123",
            scroll="30s"
        )
        
        assert isinstance(result, ElasticResponse)
        assert result._scroll_id == "new_scroll_id"
        
        mock_es_client.scroll.assert_called_once_with(
            scroll_id="scroll123",
            scroll="30s"
        )

    def test_scroll_error(self, mock_es_client):
        """Test handling of scroll errors."""
        mock_es_client.scroll.side_effect = Exception("Scroll context expired")
        
        with pytest.raises(Exception, match="Elasticsearch scroll failed"):
            scroll_elastic_logs(scroll_id="invalid_scroll_id")
