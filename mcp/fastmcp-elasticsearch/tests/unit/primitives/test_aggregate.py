"""
Unit tests for primitive aggregation operations.
"""

import pytest
from unittest.mock import patch

from tools.primitives.aggregate import aggregate_elastic_data, get_field_cardinality
from mcp_types.primitives import AggregationResponse


class TestAggregateElasticData:
    """Test cases for aggregate_elastic_data function."""

    def test_basic_aggregation(self, mock_es_client, sample_aggregation):
        """Test basic aggregation functionality."""
        # Mock aggregation response
        mock_es_client.search.return_value = {
            "took": 10,
            "timed_out": False,
            "aggregations": {
                "pods": {
                    "buckets": [
                        {"key": "pod-1", "doc_count": 100},
                        {"key": "pod-2", "doc_count": 50},
                    ]
                }
            }
        }
        
        result = aggregate_elastic_data(
            index_pattern="app-logs*",
            query={"match_all": {}},
            aggregations=sample_aggregation
        )
        
        assert isinstance(result, AggregationResponse)
        assert result.took == 10
        assert result.timed_out is False
        assert "pods" in result.aggregations
        assert len(result.aggregations["pods"]["buckets"]) == 2

    def test_aggregation_with_filter(self, mock_es_client, sample_aggregation):
        """Test aggregation with filter query."""
        filter_query = {
            "bool": {
                "must": [
                    {"term": {"json.levelname.keyword": "ERROR"}}
                ]
            }
        }
        
        result = aggregate_elastic_data(
            index_pattern="app-logs*",
            query=filter_query,
            aggregations=sample_aggregation
        )
        
        # Verify the filter was applied
        call_args = mock_es_client.search.call_args
        body = call_args[1]["body"]
        assert body["query"] == filter_query
        assert body["aggs"] == sample_aggregation
        assert body["size"] == 0  # No documents returned by default

    def test_aggregation_with_documents(self, mock_es_client, sample_aggregation):
        """Test aggregation that also returns documents."""
        result = aggregate_elastic_data(
            index_pattern="app-logs*",
            query={"match_all": {}},
            aggregations=sample_aggregation,
            size=10
        )
        
        call_args = mock_es_client.search.call_args
        body = call_args[1]["body"]
        assert body["size"] == 10

    def test_aggregation_error(self, mock_es_client, sample_aggregation):
        """Test handling of aggregation errors."""
        mock_es_client.search.side_effect = Exception("Invalid aggregation")
        
        with pytest.raises(Exception, match="Elasticsearch aggregation failed"):
            aggregate_elastic_data(
                index_pattern="logs-*",
                query={"match_all": {}},
                aggregations=sample_aggregation
            )


class TestGetFieldCardinality:
    """Test cases for get_field_cardinality function."""

    def test_field_cardinality(self, mock_es_client):
        """Test getting field cardinality."""
        # Mock cardinality response
        mock_es_client.search.return_value = {
            "took": 5,
            "aggregations": {
                "unique_count": {
                    "value": 250
                }
            }
        }
        
        result = get_field_cardinality(
            index_pattern="app-logs*",
            field="json.hostname.keyword"
        )
        
        assert result == 250
        
        # Verify correct aggregation was used
        call_args = mock_es_client.search.call_args
        body = call_args[1]["body"]
        assert "unique_count" in body["aggs"]
        assert body["aggs"]["unique_count"]["cardinality"]["field"] == "json.hostname.keyword"

    def test_field_cardinality_with_filter(self, mock_es_client):
        """Test field cardinality with filter query."""
        filter_query = {"term": {"json.levelname.keyword": "ERROR"}}
        
        result = get_field_cardinality(
            index_pattern="app-logs*",
            field="json.hostname.keyword",
            query=filter_query
        )
        
        call_args = mock_es_client.search.call_args
        body = call_args[1]["body"]
        assert body["query"] == filter_query

    def test_field_cardinality_custom_precision(self, mock_es_client):
        """Test field cardinality with custom precision threshold."""
        result = get_field_cardinality(
            index_pattern="app-logs*",
            field="json.hostname.keyword",
            precision_threshold=5000
        )
        
        call_args = mock_es_client.search.call_args
        body = call_args[1]["body"]
        cardinality_agg = body["aggs"]["unique_count"]["cardinality"]
        assert cardinality_agg["precision_threshold"] == 5000

    def test_field_cardinality_no_results(self, mock_es_client):
        """Test field cardinality when no aggregation results."""
        mock_es_client.search.return_value = {
            "took": 1,
            "aggregations": {}
        }
        
        result = get_field_cardinality(
            index_pattern="app-logs*",
            field="json.hostname.keyword"
        )
        
        assert result == 0
