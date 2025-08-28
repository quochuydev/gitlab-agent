import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { RunnableWithMessageHistory } from "@langchain/core/runnables";
import { MongoDBChatMessageHistory } from "@langchain/mongodb";
import { ChatOpenAI } from "@langchain/openai";
import { MongoClient } from "mongodb";
import { toAppError } from "../utils/errors";
import { configuration } from "../configuration";
import { logger } from "../utils/logger";

const mongoClient = new MongoClient(
  `${configuration.mongodbUrl}/?retryWrites=true&w=majority&appName=ai-agent`
);

const chatModel = new ChatOpenAI({
  openAIApiKey: configuration.openai.apiKey,
  modelName: configuration.openai.model,
  temperature: 0.2,
  maxTokens: 700,
});

const prompt = ChatPromptTemplate.fromMessages([
  ["system", "{system_message}"],
  new MessagesPlaceholder("history"),
  ["human", "{input}"],
]);

const chainWithHistory = new RunnableWithMessageHistory({
  runnable: prompt.pipe(chatModel),
  getMessageHistory: (sessionId) => {
    return new MongoDBChatMessageHistory({
      collection: mongoClient!.db("chat_history").collection("sessions"),
      sessionId,
    });
  },
  inputMessagesKey: "input",
  historyMessagesKey: "history",
});

export async function getAIResponse(
  promptText: string,
  sessionId?: string
): Promise<Array<{
  lineNumber: string;
  reviewComment: string;
}> | null> {
  try {
    await mongoClient.connect();

    const response = await chainWithHistory.invoke(
      {
        input: promptText,
      },
      {
        configurable: {
          sessionId,
        },
      }
    );

    const content = response.content as string;
    const res = content || "{}";

    return JSON.parse(res).reviews;
  } catch (err: unknown) {
    const error = toAppError(err);
    logger.error({ err: error }, "Error from LangChain with MongoDB memory");
    return null;
  } finally {
    await mongoClient.close();
  }
}
