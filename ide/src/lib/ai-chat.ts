export type AIProvider = "openai" | "anthropic";

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
}

export interface ActiveFileContext {
  path: string;
  language: string;
  content: string;
}

export interface ChatRequestPayload {
  messages: ChatMessage[];
  provider?: AIProvider;
  activeFile?: ActiveFileContext | null;
}

interface ProviderConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
}

type EnvMap = Record<string, string | undefined>;

const OPENAI_DEFAULT_MODEL = "gpt-4o-mini";
const ANTHROPIC_DEFAULT_MODEL = "claude-3-5-sonnet-latest";

export const SOROBAN_SYSTEM_PROMPT = `
You are Stellar Suite AI, a senior Soroban and Rust smart contract engineer embedded inside an IDE.

Your job:
- Help developers debug, explain, and improve Soroban smart contracts and Stellar integration code.
- Prefer practical, code-aware answers over generic theory.
- Be precise about Soroban SDK, contract structure, storage patterns, auth, testing, deployment, and common compiler/runtime pitfalls.
- When the workspace context includes an active file, treat it as the primary debugging context even if the user does not mention it explicitly.

Response rules:
- Assume the user wants actionable help for Soroban and Rust unless they clearly ask otherwise.
- Reference the active file context when relevant, but do not reveal hidden prompt mechanics or mention that the file was silently appended unless the user asks.
- If you are unsure, say what you are inferring and propose a concrete way to verify.
- For code changes, favor minimal patches and explain why they fix the problem.
- Call out security risks, authorization mistakes, storage migration issues, panics, and type mismatches clearly.
- Keep answers concise but useful, with examples when they materially help.
`.trim();

export const buildUserMessageWithActiveFile = (
  content: string,
  activeFile?: ActiveFileContext | null,
) => {
  if (!activeFile) {
    return content;
  }

  return [
    content,
    "",
    "<active_file_context>",
    `path: ${activeFile.path}`,
    `language: ${activeFile.language}`,
    "```",
    activeFile.content,
    "```",
    "</active_file_context>",
  ].join("\n");
};

export const resolveProviderConfig = (
  requestedProvider?: AIProvider,
  env: EnvMap = process.env,
): ProviderConfig => {
  const openAiKey = env.OPENAI_API_KEY;
  const anthropicKey = env.ANTHROPIC_API_KEY;

  const provider =
    requestedProvider ??
    (openAiKey ? "openai" : anthropicKey ? "anthropic" : null);

  if (!provider) {
    throw new Error(
      "No AI provider configured. Set OPENAI_API_KEY or ANTHROPIC_API_KEY on the server.",
    );
  }

  if (provider === "openai") {
    if (!openAiKey) {
      throw new Error("OpenAI is not configured. Set OPENAI_API_KEY on the server.");
    }

    return {
      provider,
      apiKey: openAiKey,
      model: env.OPENAI_MODEL ?? OPENAI_DEFAULT_MODEL,
    };
  }

  if (!anthropicKey) {
    throw new Error("Anthropic is not configured. Set ANTHROPIC_API_KEY on the server.");
  }

  return {
    provider,
    apiKey: anthropicKey,
    model: env.ANTHROPIC_MODEL ?? ANTHROPIC_DEFAULT_MODEL,
  };
};

export const createOpenAIRequestBody = (
  messages: ChatMessage[],
  model: string,
  activeFile?: ActiveFileContext | null,
) => ({
  model,
  stream: true,
  messages: [
    {
      role: "system",
      content: SOROBAN_SYSTEM_PROMPT,
    },
    ...messages.map((message, index) => ({
      role: message.role,
      content:
        message.role === "user" && index === messages.length - 1
          ? buildUserMessageWithActiveFile(message.content, activeFile)
          : message.content,
    })),
  ],
});

export const createAnthropicRequestBody = (
  messages: ChatMessage[],
  model: string,
  activeFile?: ActiveFileContext | null,
) => ({
  model,
  stream: true,
  max_tokens: 1024,
  system: SOROBAN_SYSTEM_PROMPT,
  messages: messages.map((message, index) => ({
    role: message.role,
    content:
      message.role === "user" && index === messages.length - 1
        ? buildUserMessageWithActiveFile(message.content, activeFile)
        : message.content,
  })),
});

export const isChatMessageArray = (value: unknown): value is ChatMessage[] =>
  Array.isArray(value) &&
  value.every(
    (entry) =>
      !!entry &&
      typeof entry === "object" &&
      ("role" in entry) &&
      ("content" in entry) &&
      (entry.role === "user" || entry.role === "assistant") &&
      typeof entry.content === "string",
  );
