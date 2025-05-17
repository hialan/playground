import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import readline from "readline/promises";

import dotenv from "dotenv";
dotenv.config();

import { type OpenAI, modelName, client as openAIClient } from "./openai.js";

class MCPClient {
  private mcp: Client;
  private transport: SSEClientTransport | null = null;
  private tools: OpenAI.Responses.Tool[] = [];
  private messages: OpenAI.Responses.ResponseInputItem[] = [];

  constructor() {
    this.mcp = new Client({ name: "mcp-client-cli", version: "1.0.0" });
  }

  async connectToServer(sseUrl: URL) {
    try {
      this.transport = new SSEClientTransport(sseUrl);
      await this.mcp.connect(this.transport);

      const toolsResult = await this.mcp.listTools();
      this.tools = toolsResult.tools.map((tool) => {
        return {
          type: "function",
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
          strict: false,
        };
      });
      console.log("Connected to server with tools:", this.tools);
    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
      throw e;
    }
  }

  appendMessage(message: OpenAI.Responses.ResponseInputItem) {
    this.messages.push(message);

    const logMessage: OpenAI.Responses.ResponseInputItem = { ...message };
    if (
      message.type === "function_call_output" &&
      message.output.length > 1000
    ) {
      (<OpenAI.Responses.ResponseInputItem.FunctionCallOutput>(
        logMessage
      )).output =
        message.output.slice(0, 1000) + " ... TOOL RESPONSE TRUNCATED";
    }

    process.stdout.write(
      ">>>>> Append Message:\n" + JSON.stringify(logMessage, null, 2) + "\n"
    );
  }

  async requestAI() {
    const response = await openAIClient.responses.create({
      model: modelName,
      input: this.messages,
      tools: this.tools,
      stream: false,
    });

    const { id, object, created_at, status, error, model, output, usage } =
      response;

    process.stdout.write(
      "<<<<< AI Response: \n" +
        JSON.stringify(
          { id, object, created_at, status, error, model, output, usage },
          null,
          2
        ) +
        "\n"
    );
    return response;
  }

  async processResponse(response: OpenAI.Responses.Response) {
    const finalText = [];

    for (const output of response.output) {
      if (output.type === "message") {
        for (const content of output.content) {
          if (content.type === "output_text") {
            finalText.push(content.text + "\n");
          } else {
            finalText.push(content.refusal + "\n");
          }
        }
      } else if (output.type === "function_call") {
        console.log(output);

        const { id, call_id, name, arguments: toolArgsStr } = output;
        const toolName = name;
        const toolArgs = JSON.parse(toolArgsStr);

        console.log("callTool", { name: toolName, arguments: toolArgs });

        const result = await this.mcp.callTool({
          name: toolName,
          arguments: toolArgs,
        });

        finalText.push(
          `[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`
        );

        this.appendMessage(output);
        this.appendMessage({
          type: "function_call_output",
          call_id,
          output: (<{ type: "text"; text: string }[]>result.content)[0].text,
        });

        const response2 = await this.requestAI();

        finalText.push(response2.output_text);
      }
    }

    return finalText.join("\n");
  }

  async processQuery(query: string) {
    this.appendMessage({
      role: "user",
      content: query,
    });

    const response = await this.requestAI();

    return await this.processResponse(response);
  }

  async chatLoop() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      console.log("\nMCP Client Started!");
      console.log("Type your queries or '\\q' to exit.");

      while (true) {
        const message = await rl.question("\nQuery: ");
        if (message.toLowerCase() === "\\q") {
          break;
        }
        const response = await this.processQuery(message);
        console.log("\n=======================\n" + response);
      }
    } finally {
      rl.close();
    }
  }

  async cleanup() {
    await this.mcp.close();
  }
}

async function main() {
  // if (process.argv.length < 3) {
  //   console.log("Usage: node index.ts <path_to_server_script>");
  //   return;
  // }
  const mcpClient = new MCPClient();
  try {
    await mcpClient.connectToServer(new URL("http://localhost:3000/sse"));
    await mcpClient.chatLoop();
  } catch (e) {
    console.error(e);
  } finally {
    await mcpClient.cleanup();
    process.exit(0);
  }
}

main();
