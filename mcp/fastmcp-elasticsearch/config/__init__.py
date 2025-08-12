"""
Configuration management for MCP Elasticsearch server.
"""

from .indices import INDEX_REGISTRY, get_index_config, get_field_mapping
from .environments import get_environment_config, get_current_environment

__all__ = [
    "INDEX_REGISTRY",
    "get_index_config",
    "get_field_mapping",
    "get_environment_config",
    "get_current_environment",
]
