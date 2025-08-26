#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { parse } from "graphql/language/parser.js";
import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { checkDeprecatedArguments } from "./helpers/deprecation.js";
import {
	introspectEndpoint,
	introspectLocalSchema,
	introspectSchemaFromUrl,
} from "./helpers/introspection.js";
import { getVersion } from "./helpers/package.js";

// Check for deprecated command line arguments
checkDeprecatedArguments();

const EnvSchema = z.object({
	NAME: z.string().default("mcp-graphql"),
	ENDPOINT: z.string().url().default("http://localhost:4000/graphql"),
	ALLOW_MUTATIONS: z
		.enum(["true", "false"])
		.transform((value) => value === "true")
		.default("false"),
	HEADERS: z
		.string()
		.default("{}")
		.transform((val) => {
			try {
				return JSON.parse(val);
			} catch (e) {
				throw new Error("HEADERS must be a valid JSON string");
			}
		}),
	SCHEMA: z.string().optional(),
	TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
	HTTP_PORT: z.coerce.number().default(3000),
	HTTP_HOST: z.string().default("localhost"),
});

const env = EnvSchema.parse(process.env);

const server: any = new McpServer({
	name: env.NAME,
	version: getVersion(),
	description: `GraphQL MCP server for ${env.ENDPOINT}`,
});

server.resource("graphql-schema", new URL(env.ENDPOINT).href, async (uri) => {
	try {
		let schema: string;
		if (env.SCHEMA) {
			if (
				env.SCHEMA.startsWith("http://") ||
				env.SCHEMA.startsWith("https://")
			) {
				schema = await introspectSchemaFromUrl(env.SCHEMA);
			} else {
				schema = await introspectLocalSchema(env.SCHEMA);
			}
		} else {
			schema = await introspectEndpoint(env.ENDPOINT, env.HEADERS);
		}

		return {
			contents: [
				{
					uri: uri.href,
					text: schema,
				},
			],
		};
	} catch (error) {
		throw new Error(`Failed to get GraphQL schema: ${error}`);
	}
});

server.tool(
	"introspect-schema",
	"Introspect the GraphQL schema, use this tool before doing a query to get the schema information if you do not have it available as a resource already.",
	{
		// This is a workaround to help clients that can't handle an empty object as an argument
		// They will often send undefined instead of an empty object which is not allowed by the schema
		__ignore__: z
			.boolean()
			.default(false)
			.describe("This does not do anything"),
	},
	async () => {
		try {
			let schema: string;
			if (env.SCHEMA) {
				schema = await introspectLocalSchema(env.SCHEMA);
			} else {
				schema = await introspectEndpoint(env.ENDPOINT, env.HEADERS);
			}

			return {
				content: [
					{
						type: "text",
						text: schema,
					},
				],
			};
		} catch (error) {
			return {
				isError: true,
				content: [
					{
						type: "text",
						text: `Failed to introspect schema: ${error}`,
					},
				],
			};
		}
	},
);

server.tool(
	"query-graphql",
	"Query a GraphQL endpoint with the given query and variables",
	{
		query: z.string(),
		variables: z.string().optional(),
	},
	async ({ query, variables }) => {
		try {
			const parsedQuery = parse(query);

			// Check if the query is a mutation
			const isMutation = parsedQuery.definitions.some(
				(def) =>
					def.kind === "OperationDefinition" && def.operation === "mutation",
			);

			if (isMutation && !env.ALLOW_MUTATIONS) {
				return {
					isError: true,
					content: [
						{
							type: "text",
							text: "Mutations are not allowed unless you enable them in the configuration. Please use a query operation instead.",
						},
					],
				};
			}
		} catch (error) {
			return {
				isError: true,
				content: [
					{
						type: "text",
						text: `Invalid GraphQL query: ${error}`,
					},
				],
			};
		}

		try {
			const response = await fetch(env.ENDPOINT, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					...env.HEADERS,
				},
				body: JSON.stringify({
					query,
					variables,
				}),
			});

			if (!response.ok) {
				const responseText = await response.text();

				return {
					isError: true,
					content: [
						{
							type: "text",
							text: `GraphQL request failed: ${response.statusText}\n${responseText}`,
						},
					],
				};
			}

			const data = await response.json();

			if (data.errors && data.errors.length > 0) {
				// Contains GraphQL errors
				return {
					isError: true,
					content: [
						{
							type: "text",
							text: `The GraphQL response has errors, please fix the query: ${JSON.stringify(
								data,
								null,
								2,
							)}`,
						},
					],
				};
			}

			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(data, null, 2),
					},
				],
			};
		} catch (error) {
			throw new Error(`Failed to execute GraphQL query: ${error}`);
		}
	},
);

async function main() {
	if (env.TRANSPORT === "stdio") {
		const transport = new StdioServerTransport();
		await server.connect(transport);

		console.error(
			`Started graphql mcp server ${env.NAME} for endpoint: ${env.ENDPOINT} (stdio transport)`,
		);
	} else if (env.TRANSPORT === "http") {
		// Map to store transports by session ID for HTTP transport
		const transports: Record<string, any> = {};

		// Create HTTP server
		const httpServer = createServer(async (req: any, res: any) => {
			try {
				// Set CORS headers for development
				res.setHeader("Access-Control-Allow-Origin", "*");
				res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
				res.setHeader("Access-Control-Allow-Headers", "Content-Type, Accept, Mcp-Session-Id, Last-Event-ID");
				
				if (req.method === "OPTIONS") {
					res.writeHead(200);
					res.end();
					return;
				}

				if (req.method === "POST") {
					// Parse JSON body
					let body = "";
					req.on("data", (chunk: any) => {
						body += chunk.toString();
					});
					
					req.on("end", async () => {
						try {
							const parsedBody = JSON.parse(body);
							const sessionId = req.headers["mcp-session-id"] as string | undefined;
							
							let transport: any;
							
							if (sessionId && transports[sessionId]) {
								// Reuse existing transport for this session
								transport = transports[sessionId];
							} else {
								// Create new transport for new session
								transport = new StreamableHTTPServerTransport({
									sessionIdGenerator: () => randomUUID(),
									onsessioninitialized: (newSessionId: string) => {
										console.error(`Session initialized with ID: ${newSessionId}`);
										transports[newSessionId] = transport;
									}
								});

								// Set up cleanup when transport closes
								transport.onclose = () => {
									const sid = transport.sessionId;
									if (sid && transports[sid]) {
										console.error(`Session ${sid} closed, cleaning up transport`);
										delete transports[sid];
									}
								};

								// Connect the server to the transport
								await server.connect(transport);
							}

							// Handle the HTTP request
							await transport.handleRequest(req, res, parsedBody);
						} catch (error) {
							console.error("Error handling POST request:", error);
							if (!res.headersSent) {
								res.writeHead(400, { "Content-Type": "application/json" });
								res.end(JSON.stringify({
									jsonrpc: "2.0",
									error: {
										code: -32700,
										message: "Parse error"
									},
									id: null
								}));
							}
						}
					});
				} else if (req.method === "GET" || req.method === "DELETE") {
					// Handle SSE streams and session termination
					const sessionId = req.headers["mcp-session-id"] as string | undefined;
					
					if (!sessionId || !transports[sessionId]) {
						res.writeHead(404, { "Content-Type": "application/json" });
						res.end(JSON.stringify({
							jsonrpc: "2.0",
							error: {
								code: -32001,
								message: "Session not found"
							},
							id: null
						}));
						return;
					}

					const transport = transports[sessionId];
					
					if (req.method === "GET") {
						// Handle SSE stream
						await transport.handleRequest(req, res);
					} else if (req.method === "DELETE") {
						// Terminate session
						try {
							await transport.close();
							delete transports[sessionId];
							res.writeHead(200, { "Content-Type": "application/json" });
							res.end(JSON.stringify({ success: true }));
						} catch (error) {
							console.error("Error closing transport:", error);
							res.writeHead(500, { "Content-Type": "application/json" });
							res.end(JSON.stringify({
								jsonrpc: "2.0",
								error: {
									code: -32603,
									message: "Internal server error"
								},
								id: null
							}));
						}
					}
				} else {
					res.writeHead(405, { "Content-Type": "application/json" });
					res.end(JSON.stringify({
						jsonrpc: "2.0",
						error: {
							code: -32601,
							message: "Method not allowed"
						},
						id: null
					}));
				}
			} catch (error) {
				console.error("Error in HTTP server:", error);
				if (!res.headersSent) {
					res.writeHead(500, { "Content-Type": "application/json" });
					res.end(JSON.stringify({
						jsonrpc: "2.0",
						error: {
							code: -32603,
							message: "Internal server error"
						},
						id: null
					}));
				}
			}
		});

		httpServer.listen(env.HTTP_PORT, env.HTTP_HOST, () => {
			console.error(
				`Started graphql mcp server ${env.NAME} for endpoint: ${env.ENDPOINT} (http transport on ${env.HTTP_HOST}:${env.HTTP_PORT})`,
			);
		});

		// Graceful shutdown
		process.on("SIGINT", async () => {
			console.error("Shutting down HTTP server...");
			
			// Close all active transports
			for (const sessionId in transports) {
				try {
					await transports[sessionId].close();
					delete transports[sessionId];
				} catch (error) {
					console.error(`Error closing transport for session ${sessionId}:`, error);
				}
			}

			httpServer.close(() => {
				console.error("HTTP server shutdown complete");
				process.exit(0);
			});
		});
	}
}

main().catch((error) => {
	console.error(`Fatal error in main(): ${error}`);
	process.exit(1);
});
