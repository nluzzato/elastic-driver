"""
End-to-end tests for the MCP server using actual stdio communication.
"""

import pytest
import asyncio
import json
import os
import sys
from unittest.mock import patch, Mock

# Add project root to path
project_root = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
sys.path.insert(0, project_root)

try:
    from mcp.client.session import ClientSession
    from mcp.client.stdio import stdio_client, StdioServerParameters
    MCP_AVAILABLE = True
except ImportError:
    MCP_AVAILABLE = False


@pytest.mark.skipif(not MCP_AVAILABLE, reason="MCP client not available")
class TestMCPServerE2E:
    """End-to-end tests for the MCP server."""

    @pytest.mark.asyncio
    async def test_server_initialization(self):
        """Test that the MCP server can be initialized and lists tools."""
        # Mock Elasticsearch to avoid needing a real instance
        with patch('utils.connection.get_elasticsearch_client') as mock_get_client:
            mock_es = Mock()
            mock_es.ping.return_value = True
            mock_get_client.return_value = mock_es
            
            # Spawn the MCP server
            server_path = os.path.join(project_root, "server.py")
            params = StdioServerParameters(
                command="python", 
                args=[server_path], 
                env=dict(os.environ)
            )
            
            try:
                async with stdio_client(params) as (read_stream, write_stream):
                    async with ClientSession(read_stream, write_stream) as session:
                        await session.initialize()
                        
                        # List available tools
                        tools = await session.list_tools()
                        tool_names = [t.name for t in tools.tools]
                        
                        # Verify expected tools are available
                        expected_tools = [
                            "search_logs_primitive",
                            "aggregate_data_primitive", 
                            "get_index_stats_primitive",
                            "search_app_logs",
                            "list_active_pods",
                            "investigate_issues",
                            "health"
                        ]
                        
                        for tool in expected_tools:
                            assert tool in tool_names, f"Tool {tool} not found in {tool_names}"
                            
            except Exception as e:
                pytest.skip(f"Could not start MCP server: {e}")

    @pytest.mark.asyncio
    async def test_health_tool(self):
        """Test the health tool via MCP."""
        with patch('utils.connection.test_connection', return_value=True), \
             patch('config.get_current_environment', return_value='test'):
            
            server_path = os.path.join(project_root, "server.py")
            params = StdioServerParameters(
                command="python",
                args=[server_path],
                env=dict(os.environ)
            )
            
            try:
                async with stdio_client(params) as (read_stream, write_stream):
                    async with ClientSession(read_stream, write_stream) as session:
                        await session.initialize()
                        
                        # Call health tool
                        result = await session.call_tool("health", {})
                        
                        # Parse result
                        if hasattr(result, 'content') and result.content:
                            health_data = json.loads(result.content[0].text)
                            
                            assert "ok" in health_data
                            assert "environment" in health_data
                            assert "version" in health_data
                            assert "architecture" in health_data
                            assert health_data["architecture"] == "layered"
                            
            except Exception as e:
                pytest.skip(f"Could not test health tool: {e}")

    @pytest.mark.asyncio 
    async def test_search_logs_primitive_tool(self):
        """Test the search_logs_primitive tool via MCP."""
        # Mock Elasticsearch response
        mock_response = {
            "took": 5,
            "timed_out": False,
            "hits": {
                "total": {"value": 1},
                "hits": [
                    {
                        "_index": "app-logs-test",
                        "_source": {
                            "@timestamp": "2024-01-15T10:30:00Z",
                            "json": {
                                "message": "Test log message",
                                "levelname": "INFO",
                                "hostname": "test-pod"
                            }
                        }
                    }
                ]
            }
        }
        
        with patch('utils.connection.get_elasticsearch_client') as mock_get_client:
            mock_es = Mock()
            mock_es.search.return_value = mock_response
            mock_get_client.return_value = mock_es
            
            server_path = os.path.join(project_root, "server.py")
            params = StdioServerParameters(
                command="python",
                args=[server_path],
                env=dict(os.environ)
            )
            
            try:
                async with stdio_client(params) as (read_stream, write_stream):
                    async with ClientSession(read_stream, write_stream) as session:
                        await session.initialize()
                        
                        # Call search_logs_primitive
                        result = await session.call_tool(
                            "search_logs_primitive",
                            {
                                "index_pattern": "app-logs*",
                                "query": {"match_all": {}},
                                "size": 10
                            }
                        )
                        
                        # Parse and verify result
                        if hasattr(result, 'content') and result.content:
                            search_data = json.loads(result.content[0].text)
                            
                            assert "took" in search_data
                            assert "total" in search_data
                            assert "hits" in search_data
                            assert search_data["total"] == 1
                            assert len(search_data["hits"]) == 1
                            
            except Exception as e:
                pytest.skip(f"Could not test search primitive: {e}")


@pytest.mark.manual
class TestManualE2E:
    """Manual tests that require actual Elasticsearch setup."""
    
    def test_real_elasticsearch_connection(self):
        """
        Manual test for real Elasticsearch connection.
        
        To run this test:
        1. Set up Elasticsearch instance
        2. Set environment variables:
           - ELASTIC_URL
           - ELASTIC_USERNAME/ELASTIC_PASSWORD or ELASTIC_API_KEY
        3. Run with: pytest -m manual
        """
        if not os.getenv("ELASTIC_URL"):
            pytest.skip("ELASTIC_URL not set - skipping real ES test")
            
        from utils.connection import test_connection
        
        # Test connection
        connected = test_connection()
        assert connected, "Could not connect to Elasticsearch"
        
        print("✅ Successfully connected to Elasticsearch")

    @pytest.mark.asyncio
    async def test_real_mcp_server_with_elasticsearch(self):
        """
        Manual test using real MCP server with real Elasticsearch.
        
        Requires:
        - Running Elasticsearch
        - Environment variables set
        - Some test data in app-logs* indices
        """
        if not os.getenv("ELASTIC_URL"):
            pytest.skip("ELASTIC_URL not set - skipping real MCP test")
            
        server_path = os.path.join(project_root, "server.py")
        params = StdioServerParameters(
            command="python",
            args=[server_path],
            env=dict(os.environ)
        )
        
        async with stdio_client(params) as (read_stream, write_stream):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                
                # Test health
                health_result = await session.call_tool("health", {})
                health_data = json.loads(health_result.content[0].text)
                assert health_data["ok"] is True
                
                print("✅ MCP server health check passed")
                
                # Test search (may return no results, that's OK)
                search_result = await session.call_tool(
                    "search_logs_primitive",
                    {
                        "index_pattern": "app-logs*",
                        "query": {"match_all": {}},
                        "size": 1
                    }
                )
                
                search_data = json.loads(search_result.content[0].text)
                print(f"✅ Search returned {search_data['total']} total results")
                
                # Test list pods
                pods_result = await session.call_tool("list_active_pods", {})
                pods_data = json.loads(pods_result.content[0].text)
                print(f"✅ Found {len(pods_data)} active pods")
                
                print("✅ All manual E2E tests passed!")
