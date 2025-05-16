import { AzureOpenAI, type OpenAI } from "openai";

const endpoint = process.env.AZURE_OPENAI_ENDPOINT ?? "";
const modelName = process.env.AZURE_OPENAI_MODEL_NAME ?? "";
const deployment = process.env.AZURE_OPENAI_DEPLOYMENT ?? "";

const apiKey = process.env.AZURE_OPENAI_API_KEY ?? "";
const apiVersion = process.env.AZURE_OPENAI_API_VERSION ?? "";
const options = { endpoint, apiKey, deployment, apiVersion }

console.log({ ...options, modelName })

const client = new AzureOpenAI(options);

export { client, modelName, OpenAI }