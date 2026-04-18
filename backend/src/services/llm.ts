import OpenAI from "openai";
import { config } from "../../config";
import prompt from "../utils/prompt.txt";
import { db } from "../db";
import * as dockerService from "./docker";
import * as fileService from "./file";

const isAnthropic = config.aiSdk.baseUrl?.includes("anthropic.com");

const openai = new OpenAI({
  apiKey: config.aiSdk.apiKey,
  baseURL: config.aiSdk.baseUrl || "https://api.openai.com/v1",
  defaultHeaders: isAnthropic
    ? { "anthropic-version": "2023-06-01" }
    : undefined,
});

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  attachments?: Attachment[];
}

export interface Attachment {
  type: "image" | "document";
  data: string;
  name: string;
  mimeType: string;
  size: number;
}

export interface ChatSession {
  id: string;
  userId: string;
  containerId: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

// --- SQLite helpers ---

type SessionRow = {
  id: string;
  userId: string;
  containerId: string;
  messages: string;
  createdAt: string;
  updatedAt: string;
};

function rowToSession(row: SessionRow): ChatSession {
  return { ...row, messages: JSON.parse(row.messages) };
}

function dbGet(userId: string, containerId: string): ChatSession | undefined {
  const row = db
    .query<SessionRow, [string, string]>(
      "SELECT * FROM sessions WHERE userId = ? AND containerId = ? ORDER BY createdAt DESC LIMIT 1"
    )
    .get(userId, containerId);
  return row ? rowToSession(row) : undefined;
}

function dbGetById(sessionId: string): ChatSession | undefined {
  const row = db
    .query<SessionRow, string>("SELECT * FROM sessions WHERE id = ?")
    .get(sessionId);
  return row ? rowToSession(row) : undefined;
}

function dbSave(session: ChatSession): void {
  db.run(
    "INSERT OR REPLACE INTO sessions (id, userId, containerId, messages, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?)",
    [
      session.id,
      session.userId,
      session.containerId,
      JSON.stringify(session.messages),
      session.createdAt,
      session.updatedAt,
    ]
  );
}

// --- Public session API ---

export async function createChatSession(
  userId: string,
  containerId: string
): Promise<ChatSession> {
  const session: ChatSession = {
    id: `${containerId}-${Date.now()}`,
    userId,
    containerId,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  dbSave(session);
  return session;
}

export function getChatSession(sessionId: string): ChatSession | undefined {
  return dbGetById(sessionId);
}

export function getOrCreateChatSession(
  userId: string,
  containerId: string
): ChatSession {
  const existing = dbGet(userId, containerId);
  if (existing) return existing;

  const session: ChatSession = {
    id: `${containerId}-${Date.now()}`,
    userId,
    containerId,
    messages: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  dbSave(session);
  return session;
}

function buildMessageContent(
  message: string,
  attachments: Attachment[] = []
): any[] {
  const content: any[] = [{ type: "text", text: message }];

  for (const attachment of attachments) {
    if (attachment.type === "image") {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:${attachment.mimeType};base64,${attachment.data}`,
        },
      });
    } else if (attachment.type === "document") {
      const decodedText = Buffer.from(attachment.data, "base64").toString(
        "utf-8"
      );
      content.push({
        type: "text",
        text: `\n\nDocument "${attachment.name}" content:\n${decodedText}`,
      });
    }
  }

  return content;
}

export async function sendMessage(
  userId: string,
  containerId: string,
  userMessage: string,
  attachments: Attachment[] = []
): Promise<{ userMessage: Message; assistantMessage: Message }> {
  const session = getOrCreateChatSession(userId, containerId);

  const userMsg: Message = {
    id: `user-${Date.now()}`,
    role: "user",
    content: userMessage,
    timestamp: new Date().toISOString(),
    attachments: attachments.length > 0 ? attachments : undefined,
  };

  session.messages.push(userMsg);

  const fileContentTree = await fileService.getFileContentTree(
    dockerService.docker,
    containerId
  );

  const codeContext = JSON.stringify(fileContentTree, null, 2);

  const systemPrompt = `${prompt}

Current codebase structure and content:
${codeContext}`;

  const openaiMessages = [
    { role: "system" as const, content: systemPrompt },
    ...session.messages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content:
        msg.role === "user" && msg.attachments
          ? buildMessageContent(msg.content, msg.attachments)
          : msg.content,
    })),
  ];

  const completion = await openai.chat.completions.create({
    model: config.aiSdk.model,
    messages: openaiMessages,
    //@ts-ignore
    temperature: config.aiSdk.temperature,
  });

  const assistantContent =
    completion.choices[0]?.message?.content ||
    "Sorry, I could not generate a response.";

  const assistantMsg: Message = {
    id: `assistant-${Date.now()}`,
    role: "assistant",
    content: assistantContent,
    timestamp: new Date().toISOString(),
  };

  session.messages.push(assistantMsg);
  session.updatedAt = new Date().toISOString();
  dbSave(session);

  return { userMessage: userMsg, assistantMessage: assistantMsg };
}

export async function* sendMessageStream(
  userId: string,
  containerId: string,
  userMessage: string,
  attachments: Attachment[] = []
): AsyncGenerator<{ type: "user" | "assistant" | "done"; data: any }> {
  const session = getOrCreateChatSession(userId, containerId);

  const userMsg: Message = {
    id: `user-${Date.now()}`,
    role: "user",
    content: userMessage,
    timestamp: new Date().toISOString(),
    attachments: attachments.length > 0 ? attachments : undefined,
  };

  session.messages.push(userMsg);
  yield { type: "user", data: userMsg };

  const fileContentTree = await fileService.getFileContentTree(
    dockerService.docker,
    containerId
  );

  const codeContext = JSON.stringify(fileContentTree, null, 2);

  const systemPrompt = `${prompt}

Current codebase structure and content:
${codeContext}`;

  const openaiMessages = [
    { role: "system" as const, content: systemPrompt },
    ...session.messages.map((msg) => ({
      role: msg.role as "user" | "assistant",
      content:
        msg.role === "user" && msg.attachments
          ? buildMessageContent(msg.content, msg.attachments)
          : msg.content,
    })),
  ];

  const assistantId = `assistant-${Date.now()}`;
  let assistantContent = "";

  const stream = await openai.chat.completions.create({
    model: config.aiSdk.model,
    messages: openaiMessages,
    //@ts-ignore
    temperature: config.aiSdk.temperature,
    stream: true,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta;
    if (delta?.content) {
      assistantContent += delta.content;
      yield {
        type: "assistant",
        data: {
          id: assistantId,
          role: "assistant",
          content: assistantContent,
          timestamp: new Date().toISOString(),
        },
      };
    }
  }

  const finalAssistantMsg: Message = {
    id: assistantId,
    role: "assistant",
    content: assistantContent,
    timestamp: new Date().toISOString(),
  };

  session.messages.push(finalAssistantMsg);
  session.updatedAt = new Date().toISOString();
  dbSave(session);

  yield { type: "done", data: finalAssistantMsg };
}
