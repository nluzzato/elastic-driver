"""
Input validation utilities.
"""

import re
from typing import Any


def validate_index_pattern(pattern: str) -> None:
    """
    Validate an Elasticsearch index pattern.
    
    Args:
        pattern: Index pattern to validate
        
    Raises:
        ValueError: If pattern is invalid
    """
    if not pattern:
        raise ValueError("Index pattern cannot be empty")
        
    # Basic validation - can be extended
    if pattern.startswith("_"):
        raise ValueError("Index pattern cannot start with underscore")
        
    # Check for invalid characters
    invalid_chars = re.findall(r'[^a-zA-Z0-9\-_.*]', pattern)
    if invalid_chars:
        raise ValueError(f"Invalid characters in index pattern: {invalid_chars}")


def validate_size(size: int, max_size: int = 10000) -> int:
    """
    Validate and clamp size parameter.
    
    Args:
        size: Requested size
        max_size: Maximum allowed size
        
    Returns:
        Valid size value
    """
    return clamp_value(size, min_value=1, max_value=max_size)


def validate_timeframe(minutes: int, max_minutes: int = 10080) -> int:
    """
    Validate and clamp timeframe in minutes.
    
    Args:
        minutes: Requested timeframe
        max_minutes: Maximum allowed timeframe (default 7 days)
        
    Returns:
        Valid timeframe value
    """
    return clamp_value(minutes, min_value=1, max_value=max_minutes)


def clamp_value(value: Any, min_value: Any, max_value: Any) -> Any:
    """
    Clamp a value between min and max.
    
    Args:
        value: Value to clamp
        min_value: Minimum allowed value
        max_value: Maximum allowed value
        
    Returns:
        Clamped value
    """
    return max(min_value, min(value, max_value))
