"""
Primitive aggregation operations for Elasticsearch.
"""

from typing import Dict, Any, List, Optional

from mcp_types.primitives import AggregationQuery, AggregationResponse
from utils.connection import get_elasticsearch_client
from utils.validation import validate_index_pattern


def aggregate_elastic_data(
    index_pattern: str,
    query: Dict[str, Any],
    aggregations: Dict[str, Any],
    size: int = 0,
) -> AggregationResponse:
    """
    Execute Elasticsearch aggregations.
    
    This primitive provides direct access to Elasticsearch aggregation
    capabilities without any domain logic.
    
    Args:
        index_pattern: Index pattern to search
        query: Filter query for aggregation
        aggregations: Aggregation DSL definition
        size: Number of documents to return (0 for aggs only)
        
    Returns:
        AggregationResponse with aggregation results
        
    Raises:
        ValueError: If parameters are invalid
        Exception: If aggregation fails
    """
    validate_index_pattern(index_pattern)
    
    agg_query = AggregationQuery(
        index_pattern=index_pattern,
        query=query,
        aggregations=aggregations,
        size=size,
    )
    
    es = get_elasticsearch_client()
    
    try:
        response = es.search(
            index=index_pattern,
            body=agg_query.to_dict(),
        )
        return AggregationResponse.from_dict(response)
        
    except Exception as e:
        raise Exception(f"Elasticsearch aggregation failed: {str(e)}") from e


def get_field_cardinality(
    index_pattern: str,
    field: str,
    query: Optional[Dict[str, Any]] = None,
    precision_threshold: int = 3000,
) -> int:
    """
    Get approximate cardinality (unique values) of a field.
    
    Uses HyperLogLog++ algorithm for efficient cardinality estimation.
    
    Args:
        index_pattern: Index pattern to search
        field: Field to analyze
        query: Optional filter query
        precision_threshold: Precision vs memory trade-off
        
    Returns:
        Approximate number of unique values
    """
    if query is None:
        query = {"match_all": {}}
        
    aggregations = {
        "unique_count": {
            "cardinality": {
                "field": field,
                "precision_threshold": precision_threshold,
            }
        }
    }
    
    response = aggregate_elastic_data(
        index_pattern=index_pattern,
        query=query,
        aggregations=aggregations,
    )
    
    return int(response.aggregations.get("unique_count", {}).get("value", 0))
