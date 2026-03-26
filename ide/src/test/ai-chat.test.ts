import { describe, expect, it } from "vitest";

import {
  buildUserMessageWithActiveFile,
  createAnthropicRequestBody,
  createOpenAIRequestBody,
  resolveProviderConfig,
  SOROBAN_SYSTEM_PROMPT,
} from "@/lib/ai-chat";

describe("ai chat helpers", () => {
  const activeFile = {
    path: "hello_world/lib.rs",
    language: "rust",
    content: "#[contract]\npub struct HelloWorld;",
  };

  it("appends active file context to the latest user turn", () => {
    const result = buildUserMessageWithActiveFile("Why is this failing?", activeFile);

    expect(result).toContain("Why is this failing?");
    expect(result).toContain("<active_file_context>");
    expect(result).toContain("hello_world/lib.rs");
    expect(result).toContain("#[contract]");
  });

  it("creates an OpenAI streaming payload with the Soroban system prompt", () => {
    const payload = createOpenAIRequestBody(
      [
        { role: "user", content: "Explain this file" },
        { role: "assistant", content: "Sure" },
        { role: "user", content: "Now debug it" },
      ],
      "gpt-4o-mini",
      activeFile,
    );

    expect(payload.stream).toBe(true);
    expect(payload.messages[0]).toEqual({
      role: "system",
      content: SOROBAN_SYSTEM_PROMPT,
    });
    expect(payload.messages.at(-1)?.content).toContain("hello_world/lib.rs");
    expect(payload.messages[2]?.content).toBe("Sure");
  });

  it("creates an Anthropic streaming payload with inline file context", () => {
    const payload = createAnthropicRequestBody(
      [{ role: "user", content: "Review auth" }],
      "claude-3-5-sonnet-latest",
      activeFile,
    );

    expect(payload.stream).toBe(true);
    expect(payload.system).toBe(SOROBAN_SYSTEM_PROMPT);
    expect(payload.messages[0]?.content).toContain("Review auth");
    expect(payload.messages[0]?.content).toContain("language: rust");
  });

  it("prefers OpenAI when both providers are configured and no override is passed", () => {
    const config = resolveProviderConfig(undefined, {
      OPENAI_API_KEY: "openai-key",
      ANTHROPIC_API_KEY: "anthropic-key",
    });

    expect(config.provider).toBe("openai");
    expect(config.model).toBe("gpt-4o-mini");
  });

  it("respects an Anthropic override", () => {
    const config = resolveProviderConfig("anthropic", {
      OPENAI_API_KEY: "openai-key",
      ANTHROPIC_API_KEY: "anthropic-key",
      ANTHROPIC_MODEL: "claude-custom",
    });

    expect(config).toEqual({
      provider: "anthropic",
      apiKey: "anthropic-key",
      model: "claude-custom",
    });
  });
});
