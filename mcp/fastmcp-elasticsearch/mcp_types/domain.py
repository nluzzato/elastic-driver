"""
Domain layer type definitions.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, List, Dict, Any
from enum import Enum


class LogLevel(str, Enum):
    """Standard log levels."""
    DEBUG = "DEBUG"
    INFO = "INFO"
    WARNING = "WARNING"
    ERROR = "ERROR"
    CRITICAL = "CRITICAL"
    
    @classmethod
    def from_string(cls, value: str) -> "LogLevel":
        """Parse log level from various formats."""
        value = value.upper()
        mapping = {
            "D": cls.DEBUG,
            "I": cls.INFO,
            "W": cls.WARNING,
            "WARN": cls.WARNING,
            "E": cls.ERROR,
            "ERR": cls.ERROR,
            "C": cls.CRITICAL,
            "CRIT": cls.CRITICAL,
            "FATAL": cls.CRITICAL,
        }
        return mapping.get(value, cls(value))


@dataclass
class AppLog:
    """Application log entry."""
    timestamp: datetime
    level: LogLevel
    message: str
    pod: str
    service: Optional[str] = None
    module: Optional[str] = None
    trace_id: Optional[str] = None
    request_id: Optional[str] = None
    user_id: Optional[str] = None
    environment: Optional[str] = None
    deployment: Optional[str] = None
    namespace: Optional[str] = None
    extra: Dict[str, Any] = None
    
    @classmethod
    def from_elastic(cls, doc: Dict[str, Any]) -> "AppLog":
        """Create from Elasticsearch document."""
        source = doc.get("_source", {})
        json_data = source.get("json", {})
        
        # Parse timestamp
        timestamp_str = source.get("@timestamp", "")
        timestamp = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
        
        # Parse log level
        level_str = json_data.get("levelname", "INFO")
        level = LogLevel.from_string(level_str)
        
        return cls(
            timestamp=timestamp,
            level=level,
            message=json_data.get("message", ""),
            pod=json_data.get("hostname", ""),
            service=json_data.get("service_name"),
            module=json_data.get("module"),
            trace_id=json_data.get("trace_id"),
            request_id=json_data.get("request_id"),
            user_id=json_data.get("user_id"),
            environment=json_data.get("environment"),
            deployment=source.get("ct_deployment"),
            namespace=source.get("ct_feature"),
            extra={k: v for k, v in json_data.items() 
                   if k not in ["levelname", "message", "hostname", "service_name", 
                               "module", "trace_id", "request_id", "user_id", "environment"]},
        )


@dataclass
class InfraLog:
    """Infrastructure log entry."""
    timestamp: datetime
    level: LogLevel
    message: str
    host: str
    component: str  # e.g., "kubernetes", "docker", "systemd"
    resource_type: Optional[str] = None  # e.g., "pod", "node", "service"
    resource_name: Optional[str] = None
    cpu_usage: Optional[float] = None
    memory_usage: Optional[float] = None
    disk_usage: Optional[float] = None
    network_in: Optional[float] = None
    network_out: Optional[float] = None
    extra: Dict[str, Any] = None


@dataclass
class SecurityLog:
    """Security event log entry."""
    timestamp: datetime
    event_type: str  # e.g., "authentication", "authorization", "audit"
    action: str  # e.g., "login", "access_denied", "privilege_escalation"
    outcome: str  # e.g., "success", "failure"
    user: Optional[str] = None
    source_ip: Optional[str] = None
    target_resource: Optional[str] = None
    risk_score: Optional[int] = None
    details: Dict[str, Any] = None


@dataclass
class AuditLog:
    """Audit trail log entry."""
    timestamp: datetime
    action: str  # e.g., "create", "update", "delete", "read"
    resource_type: str  # e.g., "user", "configuration", "data"
    resource_id: str
    user: str
    source_ip: Optional[str] = None
    changes: Optional[Dict[str, Any]] = None
    reason: Optional[str] = None
    compliance_tags: Optional[List[str]] = None


@dataclass
class ServiceError:
    """Service error summary."""
    service: str
    error_count: int
    error_rate: float  # errors per minute
    top_errors: List[Dict[str, Any]]  # [{message, count, last_seen}, ...]
    affected_endpoints: List[str]
    time_window_minutes: int


@dataclass
class PodMetrics:
    """Pod performance metrics."""
    pod: str
    namespace: str
    cpu_usage_avg: float
    cpu_usage_max: float
    memory_usage_avg: float
    memory_usage_max: float
    request_rate: float
    error_rate: float
    response_time_p50: float
    response_time_p95: float
    response_time_p99: float
    time_window_minutes: int
