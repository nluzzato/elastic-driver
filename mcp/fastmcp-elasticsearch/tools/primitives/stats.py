"""
Primitive stats operations for Elasticsearch.
"""

from typing import Dict, Any, List, Optional

from mcp_types.primitives import IndexStats
from utils.connection import get_elasticsearch_client
from utils.validation import validate_index_pattern


def get_elastic_stats(
    index_pattern: str,
    metric: str = "_all",
) -> Dict[str, IndexStats]:
    """
    Get index statistics from Elasticsearch.
    
    Args:
        index_pattern: Index pattern to get stats for
        metric: Specific metric or "_all" for all metrics
        
    Returns:
        Dictionary mapping index names to IndexStats
        
    Raises:
        Exception: If stats retrieval fails
    """
    validate_index_pattern(index_pattern)
    
    es = get_elasticsearch_client()
    
    try:
        response = es.indices.stats(
            index=index_pattern,
            metric=metric,
        )
        
        results = {}
        for index_name, index_data in response.get("indices", {}).items():
            results[index_name] = IndexStats.from_dict(index_name, index_data)
            
        return results
        
    except Exception as e:
        raise Exception(f"Failed to get index stats: {str(e)}") from e


def get_index_mapping(
    index_pattern: str,
) -> Dict[str, Any]:
    """
    Get field mappings for indices.
    
    Args:
        index_pattern: Index pattern to get mappings for
        
    Returns:
        Dictionary of index mappings
        
    Raises:
        Exception: If mapping retrieval fails
    """
    validate_index_pattern(index_pattern)
    
    es = get_elasticsearch_client()
    
    try:
        return es.indices.get_mapping(index=index_pattern)
        
    except Exception as e:
        raise Exception(f"Failed to get index mappings: {str(e)}") from e


def check_index_exists(
    index_pattern: str,
) -> bool:
    """
    Check if any indices match the pattern.
    
    Args:
        index_pattern: Index pattern to check
        
    Returns:
        True if at least one index matches
    """
    validate_index_pattern(index_pattern)
    
    es = get_elasticsearch_client()
    
    try:
        return es.indices.exists(index=index_pattern)
        
    except Exception:
        return False
