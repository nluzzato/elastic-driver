"""
Primitive raw query operations for Elasticsearch.
"""

from typing import Dict, Any, List, Optional

from utils.connection import get_elasticsearch_client
from utils.validation import validate_index_pattern


def query_elastic_raw(
    body: Dict[str, Any],
    index: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Execute a raw Elasticsearch query with full control.
    
    This is the most primitive operation, providing direct access
    to the Elasticsearch API without any abstraction.
    
    Args:
        body: Complete query body
        index: Optional index pattern
        
    Returns:
        Raw Elasticsearch response
        
    Raises:
        Exception: If query fails
    """
    es = get_elasticsearch_client()
    
    try:
        if index:
            validate_index_pattern(index)
            return es.search(index=index, body=body)
        else:
            return es.search(body=body)
            
    except Exception as e:
        raise Exception(f"Raw query failed: {str(e)}") from e


def multi_search_elastic(
    searches: List[Dict[str, Any]],
    index: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Execute multiple searches in a single request.
    
    More efficient than multiple individual searches.
    
    Args:
        searches: List of search requests
        index: Optional default index for all searches
        
    Returns:
        List of search responses
        
    Raises:
        Exception: If multi-search fails
    """
    es = get_elasticsearch_client()
    
    # Build multi-search body
    body = []
    for search in searches:
        # Add index line
        header = {}
        if index or search.get("index"):
            header["index"] = search.get("index", index)
        body.append(header)
        
        # Add query line
        query = {k: v for k, v in search.items() if k != "index"}
        body.append(query)
    
    try:
        response = es.msearch(body=body)
        return response.get("responses", [])
        
    except Exception as e:
        raise Exception(f"Multi-search failed: {str(e)}") from e
