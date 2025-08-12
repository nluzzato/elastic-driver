"""
Primitive layer type definitions.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional, Union
from enum import Enum


class SortOrder(str, Enum):
    """Sort order for queries."""
    ASC = "asc"
    DESC = "desc"


@dataclass
class TimeRange:
    """Time range for queries."""
    start: datetime
    end: Optional[datetime] = None
    
    def to_query(self) -> Dict[str, Any]:
        """Convert to Elasticsearch range query."""
        query = {"gte": self.start.isoformat()}
        if self.end:
            query["lte"] = self.end.isoformat()
        return query


@dataclass
class ElasticQuery:
    """Base query structure for Elasticsearch."""
    index_pattern: str
    query: Dict[str, Any] = field(default_factory=lambda: {"match_all": {}})
    size: int = 100
    from_: int = 0
    sort: Optional[List[Dict[str, Any]]] = None
    fields: Optional[List[str]] = None
    _source: Union[bool, List[str], Dict[str, Any]] = True
    highlight: Optional[Dict[str, Any]] = None
    track_total_hits: Union[bool, int] = True
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to Elasticsearch query dict."""
        body: Dict[str, Any] = {
            "query": self.query,
            "size": self.size,
            "from": self.from_,
        }
        
        if self.sort:
            body["sort"] = self.sort
        if self.fields:
            body["fields"] = self.fields
        if self._source is not True:
            body["_source"] = self._source
        if self.highlight:
            body["highlight"] = self.highlight
        if self.track_total_hits is not True:
            body["track_total_hits"] = self.track_total_hits
            
        return body


@dataclass
class ElasticResponse:
    """Elasticsearch search response."""
    took: int
    timed_out: bool
    total: int
    hits: List[Dict[str, Any]]
    aggregations: Optional[Dict[str, Any]] = None
    _scroll_id: Optional[str] = None
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ElasticResponse":
        """Create from Elasticsearch response dict."""
        hits_data = data.get("hits", {})
        total = hits_data.get("total", {})
        if isinstance(total, dict):
            total = total.get("value", 0)
            
        return cls(
            took=data.get("took", 0),
            timed_out=data.get("timed_out", False),
            total=total,
            hits=[hit for hit in hits_data.get("hits", [])],
            aggregations=data.get("aggregations"),
            _scroll_id=data.get("_scroll_id"),
        )


@dataclass
class AggregationQuery:
    """Aggregation query structure."""
    index_pattern: str
    query: Dict[str, Any] = field(default_factory=lambda: {"match_all": {}})
    aggregations: Dict[str, Any] = field(default_factory=dict)
    size: int = 0  # Don't return documents by default
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to Elasticsearch query dict."""
        return {
            "query": self.query,
            "aggs": self.aggregations,
            "size": self.size,
        }


@dataclass
class AggregationResponse:
    """Elasticsearch aggregation response."""
    took: int
    timed_out: bool
    aggregations: Dict[str, Any]
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "AggregationResponse":
        """Create from Elasticsearch response dict."""
        return cls(
            took=data.get("took", 0),
            timed_out=data.get("timed_out", False),
            aggregations=data.get("aggregations", {}),
        )


@dataclass
class IndexStats:
    """Elasticsearch index statistics."""
    index: str
    docs_count: int
    docs_deleted: int
    store_size_bytes: int
    indexing_index_total: int
    indexing_index_time_ms: int
    search_query_total: int
    search_query_time_ms: int
    segments_count: int
    
    @classmethod
    def from_dict(cls, index: str, data: Dict[str, Any]) -> "IndexStats":
        """Create from Elasticsearch stats response."""
        primaries = data.get("primaries", {})
        docs = primaries.get("docs", {})
        store = primaries.get("store", {})
        indexing = primaries.get("indexing", {})
        search = primaries.get("search", {})
        segments = primaries.get("segments", {})
        
        return cls(
            index=index,
            docs_count=docs.get("count", 0),
            docs_deleted=docs.get("deleted", 0),
            store_size_bytes=store.get("size_in_bytes", 0),
            indexing_index_total=indexing.get("index_total", 0),
            indexing_index_time_ms=indexing.get("index_time_in_millis", 0),
            search_query_total=search.get("query_total", 0),
            search_query_time_ms=search.get("query_time_in_millis", 0),
            segments_count=segments.get("count", 0),
        )
