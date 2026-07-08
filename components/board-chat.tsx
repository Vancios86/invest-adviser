"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageSquare, Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  BoardChatMessage,
  BoardChatResponse,
  BoardRole,
  MarketBoardReport,
} from "@/lib/types";
import { cn } from "@/lib/utils";

const STARTER_PROMPTS = [
  "What's the market risk posture today?",
  "Which sectors show the strongest money flow?",
  "What should I watch in the headlines?",
  "Walk me through my watchlist timing scores.",
];

const MEMBER_OPTIONS: Array<{ role: BoardRole | "full"; label: string }> = [
  { role: "full", label: "Full board" },
  { role: "macro", label: "Macro" },
  { role: "sector_rotation", label: "Sectors" },
  { role: "institutional_flow", label: "Flow" },
  { role: "geopolitical", label: "News" },
  { role: "chief_strategist", label: "Strategist" },
];

type BoardChatProps = {
  report: MarketBoardReport;
};

export function BoardChat({ report }: BoardChatProps) {
  const [messages, setMessages] = useState<BoardChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [memberRole, setMemberRole] = useState<BoardRole | "full">("full");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [meta, setMeta] = useState<Pick<
    BoardChatResponse,
    "researchSymbols" | "refreshedMarket" | "llmModel"
  > | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages, isLoading]);

  async function sendMessage(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isLoading) return;

    const nextMessages: BoardChatMessage[] = [
      ...messages,
      { role: "user", content: trimmed },
    ];

    setMessages(nextMessages);
    setInput("");
    setError(null);
    setIsLoading(true);

    try {
      const response = await fetch("/api/market-board/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages,
          report,
          memberRole: memberRole === "full" ? undefined : memberRole,
        }),
      });

      const data = (await response.json()) as BoardChatResponse & { error?: string };
      if (!response.ok) {
        throw new Error(data.error ?? "Board chat failed");
      }

      setMessages((current) => [
        ...current,
        { role: "assistant", content: data.reply },
      ]);
      setMeta({
        researchSymbols: data.researchSymbols,
        refreshedMarket: data.refreshedMarket,
        llmModel: data.llmModel,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Board chat failed");
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    void sendMessage(input);
  }

  return (
    <div className="flex min-h-[420px] flex-col rounded-xl border bg-muted/10">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium">
          <MessageSquare className="size-4 text-primary" />
          Ask the board
        </div>
        <div className="flex flex-wrap gap-1">
          {MEMBER_OPTIONS.map((option) => (
            <button
              key={option.role}
              type="button"
              onClick={() => setMemberRole(option.role)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors",
                memberRole === option.role
                  ? "border-primary/40 bg-primary/10 text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Discuss the briefing, ask follow-ups, or mention a ticker (e.g.{" "}
              <span className="font-medium text-foreground">NVDA</span>,{" "}
              <span className="font-medium text-foreground">AAPL</span>) for fresh
              research pulled into the conversation.
            </p>
            <div className="flex flex-wrap gap-2">
              {STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendMessage(prompt)}
                  className="rounded-full border bg-background px-3 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={cn(
                "max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed",
                message.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "mr-auto border bg-background text-foreground",
              )}
            >
              {message.content}
            </div>
          ))
        )}

        {isLoading && (
          <div className="mr-auto flex items-center gap-2 rounded-2xl border bg-background px-3.5 py-2.5 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Board is researching...
          </div>
        )}
      </div>

      {(meta?.researchSymbols?.length || meta?.refreshedMarket) && (
        <div className="flex flex-wrap gap-2 border-t px-4 py-2 text-[11px] text-muted-foreground">
          {meta.refreshedMarket && (
            <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
              <Sparkles className="size-3" />
              Refreshed market snapshot
            </span>
          )}
          {meta.researchSymbols?.map((symbol) => (
            <span key={symbol} className="rounded-full border px-2 py-0.5">
              Research: {symbol}
            </span>
          ))}
          {meta.llmModel && (
            <span className="rounded-full border px-2 py-0.5">{meta.llmModel}</span>
          )}
        </div>
      )}

      {error && (
        <div className="border-t px-4 py-2 text-xs text-destructive">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="flex items-center gap-2 border-t p-3">
        <Input
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about the market, a sector, or a ticker..."
          disabled={isLoading}
          className="h-10"
        />
        <Button type="submit" disabled={isLoading || !input.trim()} size="icon">
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
