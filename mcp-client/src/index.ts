import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import readline from "readline/promises";

import dotenv from "dotenv";
dotenv.config();

import { type OpenAI, modelName, client as openAIClient } from './openai.js';

class MCPClient {
  private mcp: Client;
  private transport: SSEClientTransport | null = null;
  private tools: OpenAI.Responses.Tool[] = [];

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
          type: 'function',
          name: tool.name,
          description: tool.description,
          parameters: tool.inputSchema,
          strict: false,
        }
      });
      console.log(
        "Connected to server with tools:",
        this.tools
      );
    } catch (e) {
      console.log("Failed to connect to MCP server: ", e);
      throw e;
    }
  }

  async processQuery(query: string) {
    const messages: OpenAI.Responses.ResponseInputItem[] = [
      {
        role: "user",
        content: query,
      },
    ];

    const response = await openAIClient.responses.create({
      model: modelName,
      input: messages,
      tools: this.tools,
      stream: false,
      // store: true
    })

    // console.log(response)

    const finalText = [];
    const toolResults = [];

    for (const output of response.output) {
      if (output.type === "message") {
        for (const content of output.content) {
          if (content.type === 'output_text') {
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

        console.log('callTool', { name: toolName, arguments: toolArgs })

        const result = await this.mcp.callTool({
          name: toolName,
          arguments: toolArgs,
        });
        toolResults.push(result);

        // console.log(result);
        finalText.push(
          `[Calling tool ${toolName} with args ${JSON.stringify(toolArgs)}]`
        );

        messages.push(output);
        messages.push({
          type: 'function_call_output',
          call_id,
          output: (<{ type: 'text', text: string }[]>result.content)[0].text,
        });

        const response2 = await openAIClient.responses.create({
          model: modelName,
          input: messages,
          // tools: this.tools,
          // stream: false,
          store: true
        })

        finalText.push(
          response2.output_text
        );
      }
    }

    return finalText.join("\n");
  }

  async chatLoop() {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    try {
      console.log("\nMCP Client Started!");
      console.log("Type your queries or 'quit' to exit.");

      while (true) {
        const message = await rl.question("\nQuery: ");
        if (message.toLowerCase() === "quit") {
          break;
        }
        const response = await this.processQuery(message);
        console.log("\n" + response);
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
    await mcpClient.connectToServer(new URL('http://localhost:3000/sse'));
    await mcpClient.chatLoop();
  } catch (e) {
    console.error(e)
  } finally {
    await mcpClient.cleanup();
    process.exit(0);
  }
}

main();