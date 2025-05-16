import { AzureOpenAI } from "openai";

import dotenv from "dotenv";
dotenv.config();

const endpoint = process.env.AZURE_OPENAI_ENDPOINT ?? "";
const modelName = process.env.AZURE_OPENAI_MODEL_NAME ?? "";
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? "";

export async function main() {

  const apiKey = process.env.AZURE_OPENAI_API_KEY ?? "";
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "";
  const options = { endpoint, apiKey, deployment, apiVersion }

  console.log({ ...options, modelName })

  const client = new AzureOpenAI(options);

  const response = await client.chat.completions.create({
    messages: [
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "I am going to Paris, what should I see?" }
    ],
    stream: true,
    max_completion_tokens: 800,
    temperature: 1,
    top_p: 1,
    frequency_penalty: 0,
    presence_penalty: 0,
    model: modelName
  });

  for await (const part of response) {
    process.stdout.write(part.choices[0]?.delta?.content || '');
  }
  process.stdout.write('\n');
}

main().catch((err) => {
  console.error("The sample encountered an error:", err);
});