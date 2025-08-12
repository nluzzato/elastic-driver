"""
Response parsing utilities for Elasticsearch.
"""

from typing import Dict, Any, List, Optional


def parse_hits(response: Dict[str, Any]) -> List[Dict[str, Any]]:
    """
    Extract hits from search response.
    
    Args:
        response: Elasticsearch response
        
    Returns:
        List of hit documents
    """
    return response.get("hits", {}).get("hits", [])


def parse_aggregations(response: Dict[str, Any]) -> Dict[str, Any]:
    """
    Extract aggregations from response.
    
    Args:
        response: Elasticsearch response
        
    Returns:
        Aggregations dict
    """
    return response.get("aggregations", {})


def extract_bucket_values(
    aggregation: Dict[str, Any],
    value_field: str = "key",
) -> List[Any]:
    """
    Extract values from aggregation buckets.
    
    Args:
        aggregation: Aggregation result
        value_field: Field to extract from each bucket
        
    Returns:
        List of values
    """
    buckets = aggregation.get("buckets", [])
    return [bucket.get(value_field) for bucket in buckets if value_field in bucket]
