"use client";

import { FormEvent, KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Bot, LoaderCircle, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";

import type { ActiveFileContext, ChatMessage } from "@/lib/ai-chat";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

interface AIChatPaneProps {
  activeFile: ActiveFileContext | null;
}

const starterPrompts = [
  "Why is this Soroban contract failing to compile?",
  "Review this function for auth or storage bugs.",
  "Explain what this active file is doing.",
];

const makeId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export function AIChatPane({ activeFile }: AIChatPaneProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [shareActiveFile, setShareActiveFile] = useState(false);
  const [providerLabel, setProviderLabel] = useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);

  const activeFileSummary = useMemo(() => {
    if (!activeFile) {
      return "No file selected";
    }

    return `${activeFile.path} · ${activeFile.language}`;
  }, [activeFile]);

  useEffect(() => {
    if (!viewportRef.current) return;
    viewportRef.current.scrollTop = viewportRef.current.scrollHeight;
  }, [messages, isStreaming]);

  const submitPrompt = async (prompt: string) => {
    const content = prompt.trim();
    if (!content || isStreaming) return;

    const nextMessages: ChatMessage[] = [
      ...messages,
      { id: makeId(), role: "user", content },
      { id: makeId(), role: "assistant", content: "" },
    ];

    setMessages(nextMessages);
    setInput("");
    setIsStreaming(true);
    setProviderLabel(null);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messages: nextMessages.filter((message) => message.role === "user" || message.content),
          activeFile: shareActiveFile ? activeFile : null,
        }),
      });

      if (!response.body) {
        throw new Error("The chat response did not include a stream.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamFailed = false;
      let hasAssistantContent = false;

      const applyAssistantChunk = (chunk: string) => {
        hasAssistantContent = true;
        setMessages((current) =>
          current.map((message, index) =>
            index === current.length - 1 && message.role === "assistant"
              ? { ...message, content: `${message.content}${chunk}` }
              : message,
          ),
        );
      };

      const handleBlock = (block: string) => {
        const eventLine = block
          .split("\n")
          .find((line) => line.startsWith("event:"));
        const eventName = eventLine?.slice(6).trim() ?? "message";
        const data = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .join("\n");

        if (!data) return;

        const parsed = JSON.parse(data) as {
          text?: string;
          message?: string;
          provider?: string;
          model?: string;
        };

        if (eventName === "token" && parsed.text) {
          applyAssistantChunk(parsed.text);
        }

        if (eventName === "meta" && parsed.provider && parsed.model) {
          setProviderLabel(`${parsed.provider} · ${parsed.model}`);
        }

        if (eventName === "error") {
          streamFailed = true;
          const message = parsed.message ?? "The AI response failed.";
          if (!hasAssistantContent) {
            setMessages((current) => current.slice(0, -1));
          }
          toast.error(message);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          handleBlock(part);
        }
      }

      if (buffer.trim()) {
        handleBlock(buffer);
      }

      if (!response.ok && !streamFailed) {
        throw new Error(`Chat request failed with status ${response.status}.`);
      }
    } catch (error) {
      setMessages((current) => {
        const lastMessage = current[current.length - 1];
        if (lastMessage?.role === "assistant" && !lastMessage.content) {
          return current.slice(0, -1);
        }
        return current;
      });
      toast.error(error instanceof Error ? error.message : "Unable to reach the AI assistant.");
    } finally {
      setIsStreaming(false);
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await submitPrompt(input);
  };

  const handleComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void submitPrompt(input);
    }
  };

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="border-b border-border px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              AI Assistant
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Soroban-focused contract help with streaming replies.
            </p>
          </div>
          <div className="rounded-full border border-primary/30 bg-primary/10 p-2 text-primary">
            <Sparkles className="h-4 w-4" />
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-border bg-background/70 px-3 py-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-medium text-foreground">Send active file context</p>
              <p className="mt-1 text-[11px] leading-4 text-muted-foreground">
                Off by default. Turn on only when you want the selected buffer sent to the configured AI provider.
              </p>
            </div>
            <Switch
              checked={shareActiveFile}
              onCheckedChange={setShareActiveFile}
              aria-label="Send active file context to AI provider"
            />
          </div>
          <p className="mt-2 truncate text-[11px] font-mono text-muted-foreground">
            Active file: {activeFileSummary}
          </p>
        </div>
      </div>

      <div ref={viewportRef} className="flex-1 overflow-y-auto">
        <div aria-live="polite" className="space-y-4 px-3 py-4">
          {messages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-background/40 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <Bot className="h-4 w-4 text-primary" />
                Ask about Soroban, Rust contracts, tests, or deployment issues
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                The assistant is primed as a senior Soroban developer and can use the active file for context when you opt in.
              </p>
              <div className="mt-4 flex flex-col gap-2">
                {starterPrompts.map((prompt) => (
                  <button
                    key={prompt}
                    type="button"
                    onClick={() => void submitPrompt(prompt)}
                    className="rounded-lg border border-border bg-card/70 px-3 py-2 text-left text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((message) => (
              <div
                key={message.id ?? `${message.role}-${message.content.length}`}
                className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[92%] rounded-2xl px-3 py-2 shadow-sm ${
                    message.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "border border-border bg-background/80 text-foreground"
                  }`}
                >
                  <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] opacity-75">
                    {message.role === "user" ? "You" : "Soroban AI"}
                  </p>
                  <p className="whitespace-pre-wrap text-xs leading-5">
                    {message.role === "assistant" && !message.content && isStreaming
                      ? "Thinking through the contract..."
                      : message.content}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="border-t border-border px-3 py-3">
        <div className="mb-2 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
          <span>{providerLabel ?? "Provider auto-selects from configured server keys"}</span>
          {shareActiveFile && activeFile ? (
            <span className="truncate font-mono text-primary">File context attached</span>
          ) : null}
        </div>
        <form onSubmit={handleSubmit} className="space-y-2">
          <Textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleComposerKeyDown}
            placeholder="Ask about compile errors, contract logic, tests, auth, or deployment..."
            className="min-h-[96px] resize-none border-border bg-background/80 text-sm"
            disabled={isStreaming}
          />
          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] leading-4 text-muted-foreground">
              Enter sends. Shift+Enter adds a new line.
            </p>
            <Button type="submit" size="sm" disabled={isStreaming || !input.trim()}>
              {isStreaming ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {isStreaming ? "Streaming" : "Send"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
