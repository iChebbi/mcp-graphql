import { readdir, readFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { parse, OperationDefinitionNode, VariableDefinitionNode } from "graphql";
import { z } from "zod";

export interface GraphQLOperation {
	name: string;
	query: string;
	variables: Record<string, z.ZodTypeAny>;
	description: string;
}

/**
 * Extract description from comments in GraphQL file content using @description separator
 * @param content - The raw GraphQL file content
 * @returns Extracted description or null if no @description comments found
 */
function extractDescriptionFromComments(content: string): string | null {
	const lines = content.split('\n');
	const commentLines: string[] = [];
	
	// Look for comments after the @description separator
	let separatorFound = false;
	for (const line of lines) {
		const trimmedLine = line.trim();
		if (trimmedLine.includes('@description')) {
			separatorFound = true;
			continue;
		}
		if (separatorFound && trimmedLine.startsWith('#')) {
			commentLines.push(trimmedLine.substring(1).trim());
		} else if (separatorFound && trimmedLine !== '' && !trimmedLine.startsWith('#')) {
			// Stop collecting comments when we hit non-comment, non-empty line
			break;
		}
	}
	
	if (commentLines.length === 0) {
		return null;
	}
	
	// Join comments with spaces, removing empty lines
	return commentLines.filter(line => line.length > 0).join(' ');
}

/**
 * Load GraphQL operations from .graphql files in the specified folder
 * @param operationsFolder - The folder containing .graphql files
 * @returns Array of GraphQL operations with their schemas
 */
export async function loadGraphQLOperations(operationsFolder: string): Promise<GraphQLOperation[]> {
	try {
		const files = await readdir(operationsFolder);
		const graphqlFiles = files.filter(file => extname(file) === ".graphql");
		
		const operations: GraphQLOperation[] = [];

		for (const file of graphqlFiles) {
			const filePath = join(operationsFolder, file);
			const content = await readFile(filePath, "utf-8");
			
			// Extract description from comments
			const extractedDescription = extractDescriptionFromComments(content);
			
			try {
				const document = parse(content);
				
				// Extract operation definitions
				for (const definition of document.definitions) {
					if (definition.kind === "OperationDefinition") {
						const operation = parseOperationDefinition(definition, basename(file, ".graphql"), extractedDescription);
						if (operation) {
							operation.query = content;
							operations.push(operation);
						}
					}
				}
			} catch (parseError) {
				console.error(`Failed to parse GraphQL file ${file}:`, parseError);
			}
		}

		return operations;
	} catch (error) {
		// If operations folder doesn't exist or can't be read, return empty array
		return [];
	}
}

/**
 * Parse a GraphQL operation definition to extract name, variables, and generate schema
 * @param definition - The GraphQL operation definition
 * @param fileName - The filename (used as fallback for operation name)
 * @param extractedDescription - Description extracted from comments (optional)
 * @returns Parsed operation information
 */
function parseOperationDefinition(definition: OperationDefinitionNode, fileName: string, extractedDescription?: string | null): GraphQLOperation | null {
	const operationName = definition.name?.value || fileName;
	const operationType = definition.operation;
	
	// Use extracted description if available, otherwise fall back to generated description
	const description = extractedDescription || `Execute ${operationType} operation: ${operationName}`;
	
	// Parse variables and create Zod schema
	const variables: Record<string, z.ZodTypeAny> = {};
	
	if (definition.variableDefinitions) {
		for (const varDef of definition.variableDefinitions) {
			const varName = varDef.variable.name.value;
			const zodType = graphqlTypeToZod(varDef);
			if (zodType) {
				variables[varName] = zodType;
			}
		}
	}

	return {
		name: operationName,
		query: "", // Will be set by the caller
		variables,
		description,
	};
}

/**
 * Convert GraphQL variable definition to Zod schema
 * @param varDef - GraphQL variable definition
 * @returns Zod schema type
 */
function graphqlTypeToZod(varDef: VariableDefinitionNode): z.ZodTypeAny | null {
	const type = varDef.type;
	const hasDefaultValue = !!varDef.defaultValue;
	
	// Extract the base type (handling NonNullType and ListType)
	let baseType = type;
	let isRequired = false;
	let isList = false;
	
	// Handle NonNullType
	if (baseType.kind === "NonNullType") {
		isRequired = true;
		baseType = baseType.type;
	}
	
	// Handle ListType
	if (baseType.kind === "ListType") {
		isList = true;
		baseType = baseType.type;
		
		// Handle NonNullType inside ListType
		if (baseType.kind === "NonNullType") {
			baseType = baseType.type;
		}
	}
	
	// Handle NamedType
	if (baseType.kind !== "NamedType") {
		return null;
	}
	
	const typeName = baseType.name.value;
	
	// Map GraphQL scalar types to Zod types
	let zodType: z.ZodTypeAny;
	
	switch (typeName) {
		case "String":
		case "ID":
			zodType = z.string();
			break;
		case "Int":
		case "Float":
			zodType = z.number();
			break;
		case "Boolean":
			zodType = z.boolean();
			break;
		default:
			// For custom input types or object types, use a more permissive schema that accepts objects
			if (typeName.endsWith("Input") || typeName.endsWith("Type")) {
				zodType = z.record(z.any()).describe(`${typeName} object`);
			} else {
				// For other custom types, use string as fallback
				zodType = z.string();
			}
			break;
	}
	
	// Handle lists
	if (isList) {
		zodType = z.array(zodType);
	}
	
	// Handle optional/required fields
	if (!isRequired || hasDefaultValue) {
		zodType = zodType.optional();
	}
	
	return zodType;
}
