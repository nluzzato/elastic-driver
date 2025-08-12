# MCP Server Architecture Documentation

## Overview

This document outlines the layered architecture for the Model Context Protocol (MCP) server that provides Elasticsearch functionality. The architecture follows a hierarchical design with clear separation of concerns, enabling reusability, maintainability, and extensibility.

## Architecture Principles

1. **Layered Abstraction**: Each layer builds upon the previous, adding domain knowledge and complexity
2. **Single Responsibility**: Each tool has one clear purpose
3. **Composability**: Higher layers compose lower layer tools
4. **Environment Agnostic**: Core logic separated from environment configuration
5. **Type Safety**: Strong typing throughout all layers

## Architecture Layers

### Layer 1: Primitive Tools (Foundation)

The primitive layer provides low-level, generic Elasticsearch operations. These tools are environment and domain agnostic.

```
┌─────────────────────────────────────────────────────────┐
│                    PRIMITIVE TOOLS                       │
├─────────────────────────────────────────────────────────┤
│ • search_elastic_logs      - Raw log search             │
│ • aggregate_elastic_data   - Aggregation queries        │
│ • get_elastic_stats       - Index statistics            │
│ • query_elastic_raw       - Direct DSL execution        │
│ • bulk_elastic_operations - Batch operations            │
└─────────────────────────────────────────────────────────┘
```

#### Primitive Tool Specifications

**search_elastic_logs**
- Purpose: Execute raw Elasticsearch queries for log data
- Inputs: 
  - `index_pattern`: String (e.g., "logs-*")
  - `query`: Dict (Elasticsearch Query DSL)
  - `size`: Int (1-10000)
  - `from`: Int (pagination offset)
  - `sort`: List[Dict] (sort criteria)
  - `fields`: List[str] (fields to return)
- Output: Raw Elasticsearch response

**aggregate_elastic_data**
- Purpose: Perform aggregations on Elasticsearch data
- Inputs:
  - `index_pattern`: String
  - `query`: Dict (filter query)
  - `aggregations`: Dict (aggregation DSL)
  - `size`: Int (bucket size)
- Output: Aggregation results

**get_elastic_stats**
- Purpose: Retrieve index metadata and statistics
- Inputs:
  - `index_pattern`: String
  - `metric`: Enum["docs", "store", "indexing", "search", "segments"]
- Output: Index statistics

### Layer 2: Wrapper Tools (Domain-Aware)

Wrapper tools encapsulate domain knowledge and provide simplified interfaces for specific use cases.

```
┌─────────────────────────────────────────────────────────┐
│                    WRAPPER TOOLS                         │
├─────────────────────────────────────────────────────────┤
│ • search_app_logs         - Application log search      │
│ • search_infra_logs       - Infrastructure logs         │
│ • search_security_logs    - Security event logs         │
│ • search_audit_logs       - Audit trail logs            │
│ • get_pod_metrics         - Pod-specific metrics        │
│ • get_service_errors      - Service error summary       │
└─────────────────────────────────────────────────────────┘
```

#### Wrapper Tool Example

**search_app_logs**
```python
def search_app_logs(
    pod_name: Optional[str] = None,
    service_name: Optional[str] = None,
    level: Optional[str] = None,
    message_contains: Optional[str] = None,
    timeframe_minutes: int = 60,
    limit: int = 100,
    environment: str = "production"
) -> List[AppLog]:
    """
    Searches application logs with domain-specific knowledge.
    
    This wrapper:
    1. Knows the correct index pattern for the environment
    2. Understands field mappings (e.g., json.hostname -> pod_name)
    3. Applies default filters and transformations
    4. Returns typed, normalized results
    """
    # Implementation calls primitive search_elastic_logs
    # with proper query construction
```

### Layer 3: Flow Tools (Use-Case Driven)

Flow tools orchestrate multiple operations to solve complex use cases.

```
┌─────────────────────────────────────────────────────────┐
│                     FLOW TOOLS                           │
├─────────────────────────────────────────────────────────┤
│ • investigate_issues      - General issue investigation │
│ • diagnose_performance    - Performance analysis        │
│ • trace_user_journey      - End-to-end request trace   │
│ • analyze_incident        - Incident correlation        │
│ • generate_health_report  - System health overview      │
└─────────────────────────────────────────────────────────┘
```

#### Flow Tool Example

**investigate_issues**
```python
def investigate_issues(
    service_name: str,
    timeframe_minutes: int = 60,
    environment: str = "production"
) -> IssueReport:
    """
    Comprehensive issue investigation combining multiple searches.
    
    Workflow:
    1. Search for errors in app logs
    2. Search for slow requests (>1s response time)
    3. Check infrastructure logs for resource issues
    4. Correlate security events
    5. Aggregate findings into actionable report
    """
    # Orchestrates multiple wrapper tool calls
```

### Layer 4: Index Configuration System

Centralized configuration for different Elasticsearch environments.

```python
# config/indices.py
INDEX_REGISTRY = {
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
                "trace_id": "json.trace_id",
                "request_id": "json.request_id"
            },
            "mappings": {
                "level": {
                    "ERROR": ["error", "ERROR", "E"],
                    "WARN": ["warn", "WARNING", "W"],
                    "INFO": ["info", "INFO", "I"],
                    "DEBUG": ["debug", "DEBUG", "D"]
                }
            }
        },
        "infra_logs": {
            "pattern": "infrastructure-prod-*",
            "fields": {...}
        },
        "security_logs": {
            "pattern": "security-prod-*",
            "fields": {...}
        }
    },
    "staging": {...},
    "development": {...}
}
```

## Implementation Guidelines

### 1. Tool Naming Convention

- Primitive tools: `{action}_elastic_{resource}` (e.g., `search_elastic_logs`)
- Wrapper tools: `{action}_{domain}_{resource}` (e.g., `search_app_logs`)
- Flow tools: `{action}_{use_case}` (e.g., `investigate_issues`)

### 2. Error Handling

Each layer should handle errors appropriately:
- Primitive: Wrap Elasticsearch errors with context
- Wrapper: Add domain-specific error messages
- Flow: Aggregate errors and provide actionable feedback

### 3. Type Safety

```python
# types/primitives.py
@dataclass
class ElasticQuery:
    index_pattern: str
    query: Dict[str, Any]
    size: int = 100
    from_: int = 0

# types/domain.py
@dataclass
class AppLog:
    timestamp: datetime
    level: LogLevel
    message: str
    pod: str
    service: Optional[str]
    trace_id: Optional[str]

# types/flows.py
@dataclass
class IssueReport:
    summary: str
    error_count: int
    slow_request_count: int
    affected_services: List[str]
    recommendations: List[str]
    details: List[IssueDetail]
```

### 4. Testing Strategy

- **Unit Tests**: Test each tool in isolation
- **Integration Tests**: Test layer interactions
- **End-to-End Tests**: Test complete flows
- **Mock Strategy**: Each layer can be mocked for testing higher layers

### 5. Documentation Requirements

Each tool must include:
1. Clear description of purpose
2. Input parameter specifications
3. Output format documentation
4. Example usage
5. Error scenarios

## Directory Structure

```
mcp/
├── fastmcp-elasticsearch/
│   ├── server.py              # Main MCP server
│   ├── tools/
│   │   ├── __init__.py
│   │   ├── primitives/        # Layer 1
│   │   │   ├── __init__.py
│   │   │   ├── search.py
│   │   │   ├── aggregate.py
│   │   │   └── stats.py
│   │   ├── wrappers/          # Layer 2
│   │   │   ├── __init__.py
│   │   │   ├── app_logs.py
│   │   │   ├── infra_logs.py
│   │   │   └── security_logs.py
│   │   └── flows/             # Layer 3
│   │       ├── __init__.py
│   │       ├── investigate.py
│   │       ├── diagnose.py
│   │       └── analyze.py
│   ├── config/
│   │   ├── __init__.py
│   │   ├── indices.py         # Index configurations
│   │   └── environments.py    # Environment settings
│   ├── types/
│   │   ├── __init__.py
│   │   ├── primitives.py
│   │   ├── domain.py
│   │   └── flows.py
│   ├── utils/
│   │   ├── __init__.py
│   │   ├── query_builder.py
│   │   └── response_parser.py
│   └── tests/
│       ├── unit/
│       ├── integration/
│       └── e2e/
```

## Migration Path

1. **Phase 1**: Implement primitive tools while maintaining current functionality
2. **Phase 2**: Create wrappers that use primitives internally
3. **Phase 3**: Build flow tools on top of wrappers
4. **Phase 4**: Migrate existing code to use new architecture
5. **Phase 5**: Deprecate old implementation

## Performance Considerations

1. **Caching**: Implement caching at wrapper layer for frequently accessed data
2. **Batch Operations**: Use bulk operations in primitives for efficiency
3. **Query Optimization**: Wrapper layer should optimize queries for common patterns
4. **Connection Pooling**: Maintain Elasticsearch connection pool
5. **Async Operations**: Support async/await for concurrent operations

## Security Considerations

1. **Field Filtering**: Primitive layer enforces field access control
2. **Query Validation**: Validate and sanitize all user inputs
3. **Audit Logging**: Log all operations with user context
4. **Rate Limiting**: Implement rate limits per tool and user
5. **Data Redaction**: Automatic PII redaction in responses

## Future Extensions

1. **Caching Layer**: Redis-based caching for expensive queries
2. **Query Templates**: Reusable query patterns
3. **ML Integration**: Anomaly detection in flow tools
4. **Alerting**: Proactive issue detection
5. **Visualization**: Data preparation for UI components

## Conclusion

This layered architecture provides a solid foundation for building a maintainable, extensible, and powerful MCP server for Elasticsearch operations. By separating concerns across layers, we enable independent development, testing, and evolution of each component while maintaining a cohesive system.
