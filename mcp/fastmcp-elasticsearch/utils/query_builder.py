"""
Query building utilities for Elasticsearch.
"""

from datetime import datetime, timedelta
from typing import Dict, Any, List, Optional, Union


def build_time_range_query(
    field: str,
    start: Optional[datetime] = None,
    end: Optional[datetime] = None,
    minutes_ago: Optional[int] = None,
) -> Dict[str, Any]:
    """
    Build a time range query.
    
    Args:
        field: Timestamp field name
        start: Start time (inclusive)
        end: End time (inclusive)
        minutes_ago: Alternative - minutes before now
        
    Returns:
        Range query dict
    """
    if minutes_ago is not None:
        end = datetime.utcnow()
        start = end - timedelta(minutes=minutes_ago)
    
    range_query = {}
    if start:
        range_query["gte"] = start.isoformat()
    if end:
        range_query["lte"] = end.isoformat()
        
    return {"range": {field: range_query}}


def build_term_query(
    field: str,
    value: Union[str, int, bool],
    use_keyword: bool = True,
) -> Dict[str, Any]:
    """
    Build a term query for exact matching.
    
    Args:
        field: Field name
        value: Value to match
        use_keyword: Whether to append .keyword for text fields
        
    Returns:
        Term query dict
    """
    if use_keyword and isinstance(value, str):
        field = f"{field}.keyword"
        
    return {"term": {field: value}}


def build_match_query(
    field: str,
    value: str,
    operator: str = "or",
    fuzziness: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Build a match query for text search.
    
    Args:
        field: Field name
        value: Text to search
        operator: "or" or "and"
        fuzziness: Fuzzy matching (e.g., "AUTO", "1", "2")
        
    Returns:
        Match query dict
    """
    query = {"query": value, "operator": operator}
    if fuzziness:
        query["fuzziness"] = fuzziness
        
    return {"match": {field: query}}


def build_bool_query(
    must: Optional[List[Dict[str, Any]]] = None,
    must_not: Optional[List[Dict[str, Any]]] = None,
    should: Optional[List[Dict[str, Any]]] = None,
    filter: Optional[List[Dict[str, Any]]] = None,
    minimum_should_match: Optional[Union[int, str]] = None,
) -> Dict[str, Any]:
    """
    Build a bool query combining multiple conditions.
    
    Args:
        must: Queries that must match
        must_not: Queries that must not match
        should: Optional queries (OR logic)
        filter: Filter context queries (no scoring)
        minimum_should_match: Minimum number of should clauses
        
    Returns:
        Bool query dict
    """
    bool_query = {}
    
    if must:
        bool_query["must"] = must
    if must_not:
        bool_query["must_not"] = must_not
    if should:
        bool_query["should"] = should
    if filter:
        bool_query["filter"] = filter
    if minimum_should_match is not None:
        bool_query["minimum_should_match"] = minimum_should_match
        
    return {"bool": bool_query}
