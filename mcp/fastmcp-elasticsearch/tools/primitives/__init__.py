"""
Primitive tools for low-level Elasticsearch operations.
"""

from .search import search_elastic_logs, scroll_elastic_logs
from .aggregate import aggregate_elastic_data, get_field_cardinality
from .stats import get_elastic_stats, get_index_mapping, check_index_exists
from .query import query_elastic_raw, multi_search_elastic

__all__ = [
    # Search operations
    "search_elastic_logs",
    "scroll_elastic_logs",
    # Aggregation operations
    "aggregate_elastic_data",
    "get_field_cardinality",
    # Stats operations
    "get_elastic_stats",
    "get_index_mapping",
    "check_index_exists",
    # Raw query operations
    "query_elastic_raw",
    "multi_search_elastic",
]
