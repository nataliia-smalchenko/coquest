"use client";

import { Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/types/run";

interface ChatPanelProps {
  messages: ChatMessage[];
  myPlayerId: string;
  onSend: (message: string) => void;
}

export default function ChatPanel({
  messages,
  myPlayerId,
  onSend,
}: ChatPanelProps) {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: messages triggers the scroll, bottomRef is intentionally not listed
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend(trimmed);
    setText("");
  };

  return (
    <div className="flex flex-col h-full bg-gray-900">
      <div className="flex-1 overflow-y-auto p-3 space-y-2 min-h-0">
        {messages.length === 0 && (
          <p className="text-center text-gray-500 text-xs mt-4">
            Поки що немає повідомлень
          </p>
        )}
        {messages.map((msg) => {
          const isMe = msg.player_id === myPlayerId;
          return (
            <div
              key={`${msg.player_id}-${msg.timestamp}`}
              className={`flex items-start gap-2 ${isMe ? "flex-row-reverse" : ""}`}
            >
              <div
                className="w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-white text-xs font-bold"
                style={{ backgroundColor: "#6366f1" }}
              >
                {msg.display_name.charAt(0).toUpperCase()}
              </div>
              <div
                className={`max-w-[75%] flex flex-col ${isMe ? "items-end" : "items-start"}`}
              >
                {!isMe && (
                  <span className="text-xs text-gray-400 mb-0.5">
                    {msg.display_name}
                  </span>
                )}
                <div
                  className={`px-3 py-1.5 rounded-2xl text-sm ${
                    isMe
                      ? "bg-blue-600 text-white rounded-tr-sm"
                      : "bg-gray-700 text-gray-100 rounded-tl-sm"
                  }`}
                >
                  {msg.message}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form
        onSubmit={handleSubmit}
        className="p-3 border-t border-gray-700 flex gap-2 flex-shrink-0"
      >
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder="Повідомлення..."
          className="flex-1 bg-gray-700 text-white text-sm rounded-lg px-3 py-2 outline-none placeholder-gray-500 focus:ring-1 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={!text.trim()}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white p-2 rounded-lg transition-colors flex-shrink-0"
        >
          <Send size={16} />
        </button>
      </form>
    </div>
  );
}
