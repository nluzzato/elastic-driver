"""
Type definitions for the MCP Elasticsearch server.
"""

from .primitives import (
    ElasticQuery,
    ElasticResponse,
    AggregationQuery,
    AggregationResponse,
    IndexStats,
    SortOrder,
    TimeRange,
)

from .domain import (
    LogLevel,
    AppLog,
    InfraLog,
    SecurityLog,
    AuditLog,
    ServiceError,
    PodMetrics,
)

from .flows import (
    IssueReport,
    IssueDetail,
    IssueSeverity,
    PerformanceReport,
    IncidentReport,
    HealthReport,
    UserJourney,
)

__all__ = [
    # Primitives
    "ElasticQuery",
    "ElasticResponse",
    "AggregationQuery",
    "AggregationResponse",
    "IndexStats",
    "SortOrder",
    "TimeRange",
    # Domain
    "LogLevel",
    "AppLog",
    "InfraLog",
    "SecurityLog",
    "AuditLog",
    "ServiceError",
    "PodMetrics",
    # Flows
    "IssueReport",
    "IssueDetail",
    "IssueSeverity",
    "PerformanceReport",
    "IncidentReport",
    "HealthReport",
    "UserJourney",
]
