"""
Elasticsearch connection management.
"""

from typing import Optional
from elasticsearch import Elasticsearch

from config.environments import get_elasticsearch_config


_es_client: Optional[Elasticsearch] = None


def get_elasticsearch_client(environment: Optional[str] = None) -> Elasticsearch:
    """
    Get or create an Elasticsearch client for the specified environment.
    
    Args:
        environment: Environment name (uses current if not specified)
        
    Returns:
        Configured Elasticsearch client
    """
    global _es_client
    
    # For now, create a new client each time
    # TODO: Implement connection pooling per environment
    config = get_elasticsearch_config(environment)
    
    # Build connection parameters
    params = {
        "hosts": [config["url"]],
        "request_timeout": config["timeout_ms"] / 1000.0,
        "verify_certs": config.get("verify_certs", True),
    }
    
    # Add CA certificates if provided
    if config.get("ca_certs"):
        params["ca_certs"] = config["ca_certs"]
    
    # Add authentication
    if config.get("api_key"):
        params["api_key"] = config["api_key"]
    elif config.get("username") and config.get("password"):
        params["basic_auth"] = (config["username"], config["password"])
    
    return Elasticsearch(**params)


def test_connection(environment: Optional[str] = None) -> bool:
    """
    Test Elasticsearch connection using a low-privilege operation.
    
    Args:
        environment: Environment name (uses current if not specified)
        
    Returns:
        True if connection successful
    """
    try:
        es = get_elasticsearch_client(environment)
        
        # Instead of ping() which requires cluster:monitor privileges,
        # try a simple search operation which works with editor role
        response = es.search(
            index="*",
            size=0,  # Don't return any documents
            query={"match_all": {}},
            timeout="5s"
        )
        
        # If we get a response with hits info, connection is working
        return "hits" in response
        
    except Exception:
        # If search fails, try a simple count which might have lower requirements
        try:
            es = get_elasticsearch_client(environment)
            response = es.count(index="*")
            return "count" in response
        except Exception:
            return False
