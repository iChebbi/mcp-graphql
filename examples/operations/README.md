# Example GraphQL Operations

This folder contains example GraphQL operations that demonstrate how to use the operations feature.

## How to Use

1. Copy this `operations` folder to your project root (or specify a custom path with `OPERATIONS_FOLDER` environment variable)
2. Modify the operations to match your GraphQL schema
3. Start the MCP server

## Files

- **GetUser.graphql** - Query with required ID parameter

## Notes

- Each `.graphql` file becomes a separate MCP tool
- Tool names match the GraphQL operation names
- Parameters are automatically mapped from GraphQL variables
- Mutations require `ALLOW_MUTATIONS=true` environment variable
