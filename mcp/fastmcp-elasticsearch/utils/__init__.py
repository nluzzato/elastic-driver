"""
Utility functions for the MCP Elasticsearch server.
"""

from .connection import get_elasticsearch_client, test_connection
from .validation import (
    validate_index_pattern,
    validate_size,
    validate_timeframe,
    clamp_value,
)
from .query_builder import (
    build_time_range_query,
    build_term_query,
    build_match_query,
    build_bool_query,
)
from .response_parser import (
    parse_hits,
    parse_aggregations,
    extract_bucket_values,
)

__all__ = [
    # Connection
    "get_elasticsearch_client",
    "test_connection",
    # Validation
    "validate_index_pattern", 
    "validate_size",
    "validate_timeframe",
    "clamp_value",
    # Query building
    "build_time_range_query",
    "build_term_query",
    "build_match_query",
    "build_bool_query",
    # Response parsing
    "parse_hits",
    "parse_aggregations",
    "extract_bucket_values",
]
