"""
Index configuration registry for different Elasticsearch environments.
"""

from typing import Dict, Any, Optional, List
import os


# Index registry with environment-specific configurations
INDEX_REGISTRY: Dict[str, Dict[str, Any]] = {
    "production": {
        "app_logs": {
            "pattern": "app-logs-prod-*",
            "rollover": "daily",
            "retention": "30d",
            "fields": {
                "timestamp": "@timestamp",
                "level": "json.levelname",
                "message": "json.message",
                "pod": "json.hostname",
                "service": "json.service_name",
                "module": "json.module",
                "trace_id": "json.trace_id",
                "request_id": "json.request_id",
                "user_id": "json.user_id",
                "environment": "json.environment",
                "deployment": "ct_deployment",
                "namespace": "ct_feature",
                "application": "applicationName",
            },
            "mappings": {
                "level": {
                    "ERROR": ["error", "ERROR", "E", "err", "ERR"],
                    "WARNING": ["warn", "WARNING", "W", "warning", "WARN"],
                    "INFO": ["info", "INFO", "I"],
                    "DEBUG": ["debug", "DEBUG", "D"],
                    "CRITICAL": ["critical", "CRITICAL", "C", "crit", "CRIT", "fatal", "FATAL"],
                }
            },
            "default_size": 100,
            "max_size": 1000,
            "timeout_ms": 30000,
        },
        "infra_logs": {
            "pattern": "infrastructure-prod-*",
            "rollover": "daily",
            "retention": "14d",
            "fields": {
                "timestamp": "@timestamp",
                "level": "level",
                "message": "message",
                "host": "host.name",
                "component": "component",
                "resource_type": "kubernetes.resource.type",
                "resource_name": "kubernetes.resource.name",
                "cpu_usage": "system.cpu.usage",
                "memory_usage": "system.memory.usage",
                "disk_usage": "system.disk.usage",
                "network_in": "system.network.in.bytes",
                "network_out": "system.network.out.bytes",
            },
            "default_size": 100,
            "max_size": 500,
            "timeout_ms": 30000,
        },
        "security_logs": {
            "pattern": "security-prod-*",
            "rollover": "daily",
            "retention": "90d",
            "fields": {
                "timestamp": "@timestamp",
                "event_type": "event.type",
                "action": "event.action",
                "outcome": "event.outcome",
                "user": "user.name",
                "source_ip": "source.ip",
                "target_resource": "resource.name",
                "risk_score": "risk.score",
            },
            "default_size": 100,
            "max_size": 500,
            "timeout_ms": 30000,
        },
        "audit_logs": {
            "pattern": "audit-prod-*",
            "rollover": "monthly",
            "retention": "365d",
            "fields": {
                "timestamp": "@timestamp",
                "action": "event.action",
                "resource_type": "resource.type",
                "resource_id": "resource.id",
                "user": "user.name",
                "source_ip": "source.ip",
                "changes": "event.changes",
                "reason": "event.reason",
                "compliance_tags": "tags.compliance",
            },
            "default_size": 100,
            "max_size": 500,
            "timeout_ms": 30000,
        },
    },
    "staging": {
        "app_logs": {
            "pattern": "app-logs-staging-*",
            "rollover": "daily",
            "retention": "14d",
            "fields": {
                # Same as production but different pattern
                "timestamp": "@timestamp",
                "level": "json.levelname",
                "message": "json.message",
                "pod": "json.hostname",
                "service": "json.service_name",
                "module": "json.module",
                "trace_id": "json.trace_id",
                "request_id": "json.request_id",
                "user_id": "json.user_id",
                "environment": "json.environment",
                "deployment": "ct_deployment",
                "namespace": "ct_feature",
                "application": "applicationName",
            },
            "mappings": {
                "level": {
                    "ERROR": ["error", "ERROR", "E", "err", "ERR"],
                    "WARNING": ["warn", "WARNING", "W", "warning", "WARN"],
                    "INFO": ["info", "INFO", "I"],
                    "DEBUG": ["debug", "DEBUG", "D"],
                    "CRITICAL": ["critical", "CRITICAL", "C", "crit", "CRIT", "fatal", "FATAL"],
                }
            },
            "default_size": 100,
            "max_size": 1000,
            "timeout_ms": 30000,
        },
        # Other indices follow similar pattern...
    },
    "development": {
        "app_logs": {
            "pattern": "app-logs-dev-*",
            "rollover": "weekly",
            "retention": "7d",
            "fields": {
                # Simplified for development
                "timestamp": "@timestamp",
                "level": "level",
                "message": "message",
                "pod": "hostname",
                "service": "service",
            },
            "mappings": {
                "level": {
                    "ERROR": ["error", "ERROR"],
                    "WARNING": ["warn", "WARNING"],
                    "INFO": ["info", "INFO"],
                    "DEBUG": ["debug", "DEBUG"],
                }
            },
            "default_size": 50,
            "max_size": 200,
            "timeout_ms": 10000,
        },
    },
}


def get_index_config(
    environment: str, 
    index_type: str,
    override_pattern: Optional[str] = None
) -> Dict[str, Any]:
    """
    Get index configuration for a specific environment and type.
    
    Args:
        environment: Environment name (production, staging, development)
        index_type: Index type (app_logs, infra_logs, security_logs, audit_logs)
        override_pattern: Optional index pattern override
        
    Returns:
        Index configuration dictionary
        
    Raises:
        KeyError: If environment or index_type not found
    """
    env_config = INDEX_REGISTRY.get(environment)
    if not env_config:
        raise KeyError(f"Unknown environment: {environment}")
        
    index_config = env_config.get(index_type)
    if not index_config:
        raise KeyError(f"Unknown index type: {index_type} for environment: {environment}")
        
    # Create a copy to avoid modifying the original
    config = index_config.copy()
    
    # Apply override if provided
    if override_pattern:
        config["pattern"] = override_pattern
        
    # Apply environment variable overrides
    env_pattern = os.getenv(f"ELASTIC_{index_type.upper()}_PATTERN")
    if env_pattern:
        config["pattern"] = env_pattern
        
    return config


def get_field_mapping(
    environment: str,
    index_type: str,
    field_name: str
) -> Optional[str]:
    """
    Get the Elasticsearch field name for a logical field.
    
    Args:
        environment: Environment name
        index_type: Index type
        field_name: Logical field name
        
    Returns:
        Elasticsearch field name or None if not found
    """
    try:
        config = get_index_config(environment, index_type)
        return config.get("fields", {}).get(field_name)
    except KeyError:
        return None


def get_level_mapping(
    environment: str,
    index_type: str,
    level: str
) -> List[str]:
    """
    Get all possible values that map to a log level.
    
    Args:
        environment: Environment name
        index_type: Index type  
        level: Normalized log level (ERROR, WARNING, INFO, DEBUG, CRITICAL)
        
    Returns:
        List of strings that map to this level
    """
    try:
        config = get_index_config(environment, index_type)
        mappings = config.get("mappings", {}).get("level", {})
        return mappings.get(level, [level])
    except KeyError:
        return [level]
