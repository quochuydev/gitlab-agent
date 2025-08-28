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
  const client = new MongoClient(configuration.mongodbUrl, {
    driverInfo: {
      name: "langchainjs",
    },
  });
  await client.connect();

  const collection = client.db("langchain").collection("memory");

  const memory = new BufferMemory({
    chatHistory: new MongoDBChatMessageHistory({
      collection,
      sessionId,
    }),
  });

  const model = new ChatOpenAI({
    model: "gpt-3.5-turbo",
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

      const content = response.content as string;
      const res = content || "{}";
      const aiResponse = JSON.parse(res).reviews;

      if (aiResponse) {
        const newComments = createComment(file, aiResponse);
        if (newComments) comments.push(...newComments);
      }
    }
  }

  return comments;
}
