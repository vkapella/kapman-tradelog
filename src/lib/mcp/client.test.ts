import { beforeEach, describe, expect, it, vi } from "vitest";

const mcpMocks = vi.hoisted(() => {
  return {
    clientConnect: vi.fn(),
    clientCallTool: vi.fn(),
    clientClose: vi.fn(),
    transportClose: vi.fn(),
  };
});

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => {
  return {
    Client: vi.fn().mockImplementation(() => ({
      connect: mcpMocks.clientConnect,
      callTool: mcpMocks.clientCallTool,
      close: mcpMocks.clientClose,
    })),
  };
});

vi.mock("@modelcontextprotocol/sdk/client/streamableHttp.js", () => {
  return {
    StreamableHTTPClientTransport: vi.fn().mockImplementation(() => ({
      close: mcpMocks.transportClose,
    })),
  };
});

describe("callMcpTool", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.MCP_SERVER_URL;
    delete process.env.MCP_BEARER_TOKEN;
  });

  it("throws McpUnavailableError when MCP_SERVER_URL is missing", async () => {
    const { callMcpTool, McpUnavailableError } = await import("./client");

    await expect(callMcpTool("get_quotes", { symbols: "SPY" })).rejects.toBeInstanceOf(McpUnavailableError);
    expect(mcpMocks.clientConnect).not.toHaveBeenCalled();
    expect(mcpMocks.clientCallTool).not.toHaveBeenCalled();
  });

  it("wraps tool-call failures in McpUnavailableError", async () => {
    process.env.MCP_SERVER_URL = "https://mcp.example.com";
    mcpMocks.clientCallTool.mockRejectedValueOnce(new Error("tool boom"));

    const { callMcpTool, McpUnavailableError } = await import("./client");

    await expect(callMcpTool("get_quotes", { symbols: "SPY" })).rejects.toBeInstanceOf(McpUnavailableError);
    expect(mcpMocks.clientConnect).toHaveBeenCalledTimes(1);
    expect(mcpMocks.clientCallTool).toHaveBeenCalledTimes(1);
    expect(mcpMocks.clientClose).toHaveBeenCalledTimes(1);
  });
});
