# Example GraphQL Operations

This folder contains example GraphQL operations that demonstrate how to use the operations feature with `@description` decorator for custom descriptions.

## How to Use

1. Copy this `operations` folder to your project root (or specify a custom path with `OPERATIONS_FOLDER` environment variable)
2. Modify the operations to match your GraphQL schema
3. Start the MCP server

## Files

- **CreateUser.graphql** - Query with `@description` decorator demonstrating description extraction
- **CreateUserMutation.graphql** - Mutation with `@description` decorator demonstrating description extraction

## Comment-based Descriptions

Use the `@description` decorator in your GraphQL files to provide custom tool descriptions:

```graphql
# General file comment
# @description 
# Creates a new user account in the system
# This operation will validate the input and create a user record
mutation CreateUser($input: CreateUserInput!) {
    # ... operation
}
```

Only comments following the `@description` line will be used as the tool description. If no `@description` decorator is found, the operation will use an auto-generated description.

## Notes

- Each `.graphql` file becomes a separate MCP tool
- Tool names match the GraphQL operation names
- Parameters are automatically mapped from GraphQL variables
- Mutations require `ALLOW_MUTATIONS=true` environment variable
- Tool descriptions are extracted from comments following the `@description` decorator
