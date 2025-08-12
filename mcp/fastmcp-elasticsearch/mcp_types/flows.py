"""
Flow layer type definitions.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Dict, Any, Optional
from enum import Enum


class IssueSeverity(str, Enum):
    """Issue severity levels."""
    CRITICAL = "CRITICAL"
    HIGH = "HIGH"
    MEDIUM = "MEDIUM"
    LOW = "LOW"
    INFO = "INFO"


@dataclass
class IssueDetail:
    """Detailed information about a specific issue."""
    type: str  # e.g., "error", "performance", "security"
    severity: IssueSeverity
    description: str
    count: int
    first_seen: datetime
    last_seen: datetime
    affected_components: List[str]
    sample_logs: List[Dict[str, Any]]
    recommended_actions: List[str]


@dataclass
class IssueReport:
    """Comprehensive issue investigation report."""
    summary: str
    time_range: Dict[str, datetime]
    total_issues: int
    critical_issues: int
    error_count: int
    warning_count: int
    slow_request_count: int
    affected_services: List[str]
    affected_pods: List[str]
    issues: List[IssueDetail]
    recommendations: List[str]
    metadata: Dict[str, Any] = field(default_factory=dict)


@dataclass
class PerformanceReport:
    """Performance analysis report."""
    summary: str
    time_range: Dict[str, datetime]
    services: List[Dict[str, Any]]  # Per-service metrics
    bottlenecks: List[Dict[str, Any]]  # Identified performance issues
    slow_endpoints: List[Dict[str, Any]]  # Endpoints with high latency
    resource_usage: Dict[str, Any]  # CPU, memory, disk, network
    recommendations: List[str]
    trends: Dict[str, Any]  # Performance trends over time


@dataclass
class IncidentReport:
    """Security or operational incident report."""
    incident_id: str
    title: str
    severity: IssueSeverity
    status: str  # e.g., "active", "contained", "resolved"
    start_time: datetime
    end_time: Optional[datetime]
    affected_services: List[str]
    affected_users: Optional[int]
    timeline: List[Dict[str, Any]]  # Event timeline
    root_cause: Optional[str]
    impact_assessment: str
    remediation_steps: List[str]
    lessons_learned: Optional[List[str]]


@dataclass
class HealthReport:
    """System health overview report."""
    timestamp: datetime
    overall_status: str  # e.g., "healthy", "degraded", "critical"
    services: List[Dict[str, Any]]  # Service health status
    error_rate: float
    success_rate: float
    average_response_time: float
    active_alerts: List[Dict[str, Any]]
    resource_utilization: Dict[str, float]
    recommendations: List[str]


@dataclass
class UserJourney:
    """End-to-end user request trace."""
    journey_id: str
    user_id: Optional[str]
    start_time: datetime
    end_time: datetime
    duration_ms: int
    services_called: List[str]
    total_requests: int
    successful_requests: int
    failed_requests: int
    steps: List[Dict[str, Any]]  # Detailed journey steps
    errors: List[Dict[str, Any]]
    performance_metrics: Dict[str, float]
    recommendations: List[str]
