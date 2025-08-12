"""
Environment configuration management.
"""

import os
from typing import Dict, Any, Optional


# Single environment configuration - reads directly from env vars
DEFAULT_CONFIG = {
    "name": "default",
    "elasticsearch": {
        "url": os.getenv("ELASTIC_URL", os.getenv("ELASTICSEARCH_URL", "http://localhost:9200")),
        "username": os.getenv("ELASTIC_USERNAME", os.getenv("ELASTICSEARCH_USERNAME")),
        "password": os.getenv("ELASTIC_PASSWORD", os.getenv("ELASTICSEARCH_PASSWORD")),
        "api_key": os.getenv("ELASTIC_API_KEY", os.getenv("ELASTICSEARCH_API_KEY")),
        "timeout_ms": int(os.getenv("ELASTIC_TIMEOUT", os.getenv("ELASTICSEARCH_TIMEOUT", "30000"))),
        "verify_certs": True,
        "ca_certs": os.getenv("ELASTIC_CA_CERTS"),
    },
    "defaults": {
        "max_results": 1000,
        "default_timeframe_minutes": 60,
        "max_timeframe_minutes": 1440,  # 24 hours
    },
    "features": {
        "enable_caching": False,
        "enable_audit_logging": False,
        "enable_rate_limiting": False,
    },
}


def get_current_environment() -> str:
    """
    Get the current environment name.
    
    Returns:
        Always returns 'default' since we use a single environment
    """
    return "default"


def get_environment_config(environment: Optional[str] = None) -> Dict[str, Any]:
    """
    Get configuration for the environment.
    
    Args:
        environment: Ignored (kept for compatibility)
        
    Returns:
        Environment configuration dictionary
    """
    return DEFAULT_CONFIG


def get_elasticsearch_config(environment: Optional[str] = None) -> Dict[str, Any]:
    """
    Get Elasticsearch configuration.
    
    Args:
        environment: Ignored (kept for compatibility)
        
    Returns:
        Elasticsearch configuration dictionary
    """
    return DEFAULT_CONFIG["elasticsearch"]


def get_feature_flag(feature: str, environment: Optional[str] = None) -> bool:
    """
    Check if a feature is enabled.
    
    Args:
        feature: Feature name
        environment: Ignored (kept for compatibility)
        
    Returns:
        True if feature is enabled
    """
    return DEFAULT_CONFIG.get("features", {}).get(feature, False)
