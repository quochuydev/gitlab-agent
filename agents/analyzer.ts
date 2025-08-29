import { MongoDBChatMessageHistory } from "@langchain/mongodb";
import { ChatOpenAI } from "@langchain/openai";
import { ConversationChain } from "langchain/chains";
import { BufferMemory } from "langchain/memory";
import { MongoClient } from "mongodb";
import { File } from "parse-diff";
import { configuration } from "../configuration";
import { createComment } from "../utils/comments";
import { createPrompt } from "./prompts";

export async function analyzeCode(
  parsedDiff: File[],
  sessionId: string
): Promise<Array<{ body: string; path: string; line: number }>> {
  if (!configuration.mongodbUrl) {
    console.log("🔄 MongoDB not configured, running without memory...");
    return analyzeCodeWithoutMemory(parsedDiff);
  } else {
    console.log("🔄 MongoDB configured, running with memory...");
    return analyzeCodeMemory(parsedDiff, sessionId);
  }
}

async function analyzeCodeMemory(
  parsedDiff: File[],
  sessionId: string
): Promise<Array<{ body: string; path: string; line: number }>> {
  const startTime = Date.now();
  let totalTokens = 0;

  const client = new MongoClient(
    `${configuration.mongodbUrl}/?retryWrites=true&w=majority&appName=ai-agent`,
    {
      driverInfo: {
        name: "langchainjs",
      },
    }
  );

  try {
    await client.connect();
    console.log("🔗 Connected to MongoDB, using memory...");
  } catch (error) {
    console.log(
      "❌ MongoDB connection failed, falling back to no-memory mode..."
    );
    throw error;
  }

  const collection = client.db("langchain").collection("memory");

  const memory = new BufferMemory({
    chatHistory: new MongoDBChatMessageHistory({
      collection,
      sessionId,
    }),
  });

  const model = new ChatOpenAI({
    openAIApiKey: configuration.openai.apiKey,
    modelName: configuration.openai.model,
    temperature: 0,
  });

  const chain = new ConversationChain({
    llm: model,
    memory,
  });

  const comments: Array<{ body: string; path: string; line: number }> = [];

  for (const file of parsedDiff) {
    if (file.to === "/dev/null") continue;

    for (const chunk of file.chunks) {
      const prompt = createPrompt(chunk);

      const response = await chain.invoke(
        {
          input: prompt,
        },
        {
          configurable: {
            sessionId,
          },
        }
      );

      if (response.response_metadata?.tokenUsage) {
        totalTokens += response.response_metadata.tokenUsage.totalTokens;
      }

      const content = response.content as string;
      const res = content || "{}";
      const aiResponse = JSON.parse(res).reviews;

      if (aiResponse) {
        const newComments = createComment(file, aiResponse);
        if (newComments) comments.push(...newComments);
      }
    }
  }

  await client.close();

  const duration = Date.now() - startTime;
  const estimatedCost = (totalTokens / 1000) * 0.002; // GPT-3.5-turbo pricing

  console.log(`💰 Review Cost Analysis (WITH MongoDB Memory):
  - Duration: ${duration}ms
  - Total Tokens: ${totalTokens}
  - Estimated Cost: $${estimatedCost.toFixed(4)}
  - Files Processed: ${parsedDiff.length}
  - Comments Generated: ${comments.length}`);

  return comments;
}

async function analyzeCodeWithoutMemory(
  parsedDiff: File[]
): Promise<Array<{ body: string; path: string; line: number }>> {
  const startTime = Date.now();
  let totalTokens = 0;

  const model = new ChatOpenAI({
    openAIApiKey: configuration.openai.apiKey,
    modelName: configuration.openai.model,
    temperature: 0,
  });

  const comments: Array<{ body: string; path: string; line: number }> = [];

  for (const file of parsedDiff) {
    if (file.to === "/dev/null") continue;

    for (const chunk of file.chunks) {
      const prompt = createPrompt(chunk);

      const response = await model.invoke([{ role: "user", content: prompt }]);

      // Track token usage
      if (response.response_metadata?.tokenUsage) {
        totalTokens += response.response_metadata.tokenUsage.totalTokens;
      }

      const content = response.content as string;
      const res = content || "{}";
      const aiResponse = JSON.parse(res).reviews;

      if (aiResponse) {
        const newComments = createComment(file, aiResponse);
        if (newComments) comments.push(...newComments);
      }
    }
  }

  const duration = Date.now() - startTime;
  const estimatedCost = (totalTokens / 1000) * 0.002; // GPT-3.5-turbo pricing

  console.log(`💰 Review Cost Analysis (WITHOUT Memory):
  - Duration: ${duration}ms
  - Total Tokens: ${totalTokens}
  - Estimated Cost: $${estimatedCost.toFixed(4)}
  - Files Processed: ${parsedDiff.length}
  - Comments Generated: ${comments.length}`);

  return comments;
}
