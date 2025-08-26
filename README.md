# mcp-graphql

[![smithery badge](https://smithery.ai/badge/mcp-graphql)](https://smithery.ai/server/mcp-graphql)

A Model Context Protocol server that enables LLMs to interact with GraphQL APIs. This implementation provides schema introspection and query execution capabilities, allowing models to discover and use GraphQL APIs dynamically.

<a href="https://glama.ai/mcp/servers/4zwa4l8utf"><img width="380" height="200" src="https://glama.ai/mcp/servers/4zwa4l8utf/badge" alt="mcp-graphql MCP server" /></a>

## Usage

Run `mcp-graphql` with the correct endpoint, it will automatically try to introspect your queries.

### Environment Variables (Breaking change in 1.0.0)

> **Note:** As of version 1.0.0, command line arguments have been replaced with environment variables.

| Environment Variable | Description | Default |
|----------|-------------|---------|
| `ENDPOINT` | GraphQL endpoint URL | `http://localhost:4000/graphql` |
| `HEADERS` | JSON string containing headers for requests | `{}` |
| `ALLOW_MUTATIONS` | Enable mutation operations (disabled by default) | `false` |
| `NAME` | Name of the MCP server | `mcp-graphql` |
| `SCHEMA` | Path to a local GraphQL schema file or URL (optional) | - |
| `TRANSPORT` | Transport mode: `stdio` or `http` | `stdio` |
| `HTTP_PORT` | Port for HTTP transport (when `TRANSPORT=http`) | `3000` |
| `HTTP_HOST` | Host for HTTP transport (when `TRANSPORT=http`) | `localhost` |

### Examples

```bash
# Basic usage with a local GraphQL server (stdio transport - default)
ENDPOINT=http://localhost:3000/graphql npx mcp-graphql

# Using HTTP transport (streamable HTTP as per MCP spec)
TRANSPORT=http HTTP_PORT=3001 ENDPOINT=http://localhost:3000/graphql npx mcp-graphql

# Using with custom headers
ENDPOINT=https://api.example.com/graphql HEADERS='{"Authorization":"Bearer token123"}' npx mcp-graphql

# Enable mutation operations
ENDPOINT=http://localhost:3000/graphql ALLOW_MUTATIONS=true npx mcp-graphql

# Using a local schema file instead of introspection
ENDPOINT=http://localhost:3000/graphql SCHEMA=./schema.graphql npx mcp-graphql

# Using a schema file hosted at a URL
ENDPOINT=http://localhost:3000/graphql SCHEMA=https://example.com/schema.graphql npx mcp-graphql
```

## Transport Modes

The server supports two transport modes as defined by the Model Context Protocol specification:

### Stdio Transport (Default)
- Uses standard input/output for JSON-RPC communication
- Suitable for command-line tools and development
- Compatible with Claude Desktop and other MCP clients

### Streamable HTTP Transport
- Implements the [MCP Streamable HTTP specification](https://modelcontextprotocol.io/specification/draft/basic/transports#streamable-http)
- Uses HTTP POST for requests and Server-Sent Events (SSE) for responses
- Supports session management and resumability
- Suitable for web applications and HTTP-based integrations

To use HTTP transport:
```bash
TRANSPORT=http HTTP_PORT=3001 npx mcp-graphql
```

The HTTP server provides:
- Health check endpoint at `/` - returns server status and version
- MCP server endpoint at `/mcp` - handles all MCP protocol communication

Example:
```bash
# Health check
curl http://localhost:3001/

# MCP communication (requires proper MCP headers)
curl -X POST http://localhost:3001/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","method":"ping","id":1}'
```

## Resources

- **graphql-schema**: The server exposes the GraphQL schema as a resource that clients can access. This is either the local schema file, a schema file hosted at a URL, or based on an introspection query.

## Available Tools

The server provides two main tools:

1. **introspect-schema**: This tool retrieves the GraphQL schema. Use this first if you don't have access to the schema as a resource.
This uses either the local schema file, a schema file hosted at a URL, or an introspection query.

2. **query-graphql**: Execute GraphQL queries against the endpoint. By default, mutations are disabled unless `ALLOW_MUTATIONS` is set to `true`.

## Installation

### Installing via Smithery

To install GraphQL MCP Server for Claude Desktop automatically via [Smithery](https://smithery.ai/server/mcp-graphql):

```bash
npx -y @smithery/cli install mcp-graphql --client claude
```

### Installing Manually

It can be manually installed to Claude:
```json
{
    "mcpServers": {
        "mcp-graphql": {
            "command": "npx",
            "args": ["mcp-graphql"],
            "env": {
                "ENDPOINT": "http://localhost:3000/graphql"
            }
        }
    }
}
```

## Security Considerations

Mutations are disabled by default as a security measure to prevent an LLM from modifying your database or service data. Consider carefully before enabling mutations in production environments.

## Customize for your own server

This is a very generic implementation where it allows for complete introspection and for your users to do whatever (including mutations). If you need a more specific implementation I'd suggest to just create your own MCP and lock down tool calling for clients to only input specific query fields and/or variables. You can use this as a reference.
