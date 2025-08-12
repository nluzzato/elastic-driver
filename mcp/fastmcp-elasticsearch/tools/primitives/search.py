"""
Primitive search operations for Elasticsearch.
"""

from typing import Dict, Any, List, Optional, Tuple
from elasticsearch import Elasticsearch

from mcp_types.primitives import ElasticQuery, ElasticResponse
from utils.connection import get_elasticsearch_client
from utils.validation import validate_index_pattern, validate_size, clamp_value


def search_elastic_logs(
    index_pattern: str,
    query: Dict[str, Any],
    size: int = 100,
    from_: int = 0,
    sort: Optional[List[Dict[str, Any]]] = None,
    fields: Optional[List[str]] = None,
    _source: Any = True,
    highlight: Optional[Dict[str, Any]] = None,
    track_total_hits: Any = True,
    scroll: Optional[str] = None,
) -> ElasticResponse:
    """
    Execute a raw Elasticsearch search query.
    
    This is the foundational search primitive that all other search
    operations build upon. It provides direct access to the Elasticsearch
    Query DSL without any domain-specific logic.
    
    Args:
        index_pattern: Index pattern to search (e.g., "logs-*")
        query: Elasticsearch Query DSL query
        size: Number of results to return (1-10000)
        from_: Offset for pagination
        sort: Sort criteria
        fields: Specific fields to return
        _source: Source filtering (True, False, or field list)
        highlight: Highlight configuration
        track_total_hits: Whether to track total hit count
        scroll: Scroll timeout for large result sets
        
    Returns:
        ElasticResponse with search results
        
    Raises:
        ValueError: If parameters are invalid
        Exception: If Elasticsearch query fails
    """
    # Validate inputs
    validate_index_pattern(index_pattern)
    size = clamp_value(size, min_value=1, max_value=10000)
    from_ = max(0, from_)
    
    # Build query
    elastic_query = ElasticQuery(
        index_pattern=index_pattern,
        query=query,
        size=size,
        from_=from_,
        sort=sort,
        fields=fields,
        _source=_source,
        highlight=highlight,
        track_total_hits=track_total_hits,
    )
    
    # Execute search
    es = get_elasticsearch_client()
    body = elastic_query.to_dict()
    
    try:
        if scroll:
            response = es.search(
                index=index_pattern,
                body=body,
                scroll=scroll,
            )
        else:
            response = es.search(
                index=index_pattern,
                body=body,
            )
            
        return ElasticResponse.from_dict(response)
        
    except Exception as e:
        # Log error details for debugging
        raise Exception(f"Elasticsearch query failed: {str(e)}") from e


def scroll_elastic_logs(
    scroll_id: str,
    scroll: str = "1m",
) -> ElasticResponse:
    """
    Continue scrolling through search results.
    
    Used for retrieving large result sets that exceed the 10k limit.
    Must be called after an initial search with scroll parameter.
    
    Args:
        scroll_id: Scroll ID from previous search
        scroll: Scroll timeout (e.g., "1m", "30s")
        
    Returns:
        ElasticResponse with next batch of results
        
    Raises:
        Exception: If scroll fails
    """
    es = get_elasticsearch_client()
    
    try:
        response = es.scroll(
            scroll_id=scroll_id,
            scroll=scroll,
        )
        return ElasticResponse.from_dict(response)
        
    except Exception as e:
        raise Exception(f"Elasticsearch scroll failed: {str(e)}") from e


def clear_scroll(scroll_id: str) -> None:
    """
    Clear a scroll context to free resources.
    
    Should be called when done scrolling or on error.
    
    Args:
        scroll_id: Scroll ID to clear
    """
    es = get_elasticsearch_client()
    
    try:
        es.clear_scroll(scroll_id=scroll_id)
    except Exception:
        # Best effort - ignore errors
        pass
