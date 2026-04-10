import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export class McpUnavailableError extends Error {
  public readonly code = "MCP_UNAVAILABLE";

  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "McpUnavailableError";
  }
}

function getMcpServerUrl(): URL {
  const rawUrl = process.env.MCP_SERVER_URL?.trim();
  if (!rawUrl) {
    throw new McpUnavailableError("MCP server URL is not configured.");
  }

  try {
    return new URL(rawUrl);
  } catch {
    throw new McpUnavailableError("MCP server URL is invalid.");
  }
}

function buildRequestInit(): RequestInit | undefined {
  const bearerToken = process.env.MCP_BEARER_TOKEN?.trim();
  if (!bearerToken) {
    return undefined;
  }

  return {
    headers: {
      Authorization: `Bearer ${bearerToken}`,
    },
  };
}

export async function callMcpTool<Result>(name: string, args: Record<string, unknown>): Promise<Result> {
  let client: Client | null = null;
  let transport: StreamableHTTPClientTransport | null = null;

  try {
    const serverUrl = getMcpServerUrl();

    client = new Client({ name: "kapman-tradelog", version: "0.1.0" });
    transport = new StreamableHTTPClientTransport(serverUrl, {
      requestInit: buildRequestInit(),
    });
    await client.connect(transport);

    const response = await client.callTool({
      name,
      arguments: args,
    });

    const structuredContent =
      typeof response.structuredContent === "object" && response.structuredContent !== null ? response.structuredContent : null;
    if (!structuredContent || !("result" in structuredContent)) {
      throw new McpUnavailableError("MCP tool response did not include structuredContent.result.");
    }

    return structuredContent.result as Result;
  } catch (error) {
    if (error instanceof McpUnavailableError) {
      throw error;
    }

    throw new McpUnavailableError("MCP tool call failed.", { cause: error });
  } finally {
    if (client) {
      try {
        await client.close();
      } catch {
        // Ignore cleanup errors.
      }
    } else if (transport) {
      try {
        await transport.close();
      } catch {
        // Ignore cleanup errors.
      }
    }
  }
}
