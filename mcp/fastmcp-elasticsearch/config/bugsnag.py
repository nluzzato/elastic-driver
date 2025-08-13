"""
Bugsnag (Insight Hub) API configuration and validation.
"""
import os
from typing import Optional


def get_bugsnag_config() -> dict:
    """
    Get Bugsnag configuration from environment variables.
    
    Required environment variables:
    - BUGSNAG_API_TOKEN: API token for authentication
    - BUGSNAG_ORG_ID: Organization ID (from Bugsnag dashboard)
    
    Optional environment variables:
    - BUGSNAG_BASE_URL: Base URL (defaults to Bugsnag's API)
    """
    return {
        'api_token': os.getenv('BUGSNAG_API_TOKEN'),
        'org_id': os.getenv('BUGSNAG_ORG_ID'),
        'base_url': os.getenv('BUGSNAG_BASE_URL', 'https://api.bugsnag.com'),
        'timeout': int(os.getenv('BUGSNAG_TIMEOUT', '30'))
    }


def validate_bugsnag_config() -> bool:
    """
    Validate that required Bugsnag configuration is present.
    
    Returns:
        bool: True if valid configuration, False otherwise
    """
    config = get_bugsnag_config()
    
    # Check required fields
    required_fields = ['api_token', 'org_id']
    missing_fields = [field for field in required_fields if not config.get(field)]
    
    if missing_fields:
        print(f"Missing required Bugsnag configuration: {', '.join(missing_fields)}")
        return False
    
    return True


def get_auth_headers() -> dict:
    """
    Get authentication headers for Bugsnag API requests.
    
    Returns:
        dict: Headers with authorization token
    """
    config = get_bugsnag_config()
    return {
        'Authorization': f'token {config["api_token"]}',
        'Content-Type': 'application/json',
        'x-version': '2',
        'accept': 'application/json'
    }
