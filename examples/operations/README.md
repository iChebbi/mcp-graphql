# Example GraphQL Operations

This folder contains example GraphQL operations that demonstrate how to use the operations feature, including comment-based descriptions.

## How to Use

1. Copy this `operations` folder to your project root (or specify a custom path with `OPERATIONS_FOLDER` environment variable)
2. Modify the operations to match your GraphQL schema
3. Start the MCP server

## Files

- **CreateUser.graphql** - Query with comments that demonstrate description extraction
- **CreateUserMutation.graphql** - Mutation with separator-based description extraction

## Comment-based Descriptions

The operations in this folder demonstrate different ways to add descriptions:

### Default behavior (CreateUser.graphql)
All leading comments are used as the tool description:
```graphql
# Fetches user information by ID
# Returns the user's basic profile including name and email address
query GetUser($id: ID!) {
    # ... operation
}
```

### Using separators (CreateUserMutation.graphql)
Use `COMMENT_SEPARATOR` environment variable to extract specific comments:
```graphql
# General file comment
# @description: Creates a new user account in the system
# This operation will validate the input and create a user record
mutation CreateUser($input: CreateUserInput!) {
    # ... operation
}
```

Start with: `COMMENT_SEPARATOR="@description:" npx mcp-graphql`

## Notes

- Each `.graphql` file becomes a separate MCP tool
- Tool names match the GraphQL operation names
- Parameters are automatically mapped from GraphQL variables
- Mutations require `ALLOW_MUTATIONS=true` environment variable
- Tool descriptions are extracted from comments using configurable separators
