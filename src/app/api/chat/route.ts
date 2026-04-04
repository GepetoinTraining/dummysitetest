// ============================================================
// Chat endpoint — the trefoil in action
//
// 1. Build context (tags + pad)
// 2. Send to Gemma with function defs
// 3. If Gemma calls a function → execute → feed result back
// 4. Loop until Gemma responds with text
// 5. Record turn in ledger
// 6. Return response
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { OllamaProvider } from "@/lib/ai/ollama";
import { execute } from "@/lib/ai/executor";
import { buildSystemPrompt } from "@/lib/engine/autopilot";
import { buildTabContext, buildGeneralistContext } from "@/lib/engine/tabs";
import { toFunctionDefs } from "@/lib/engine/registry";
import { recordTurn } from "@/lib/engine/context";
import { initDb } from "@/lib/db/connection";
import type { ChatMessage } from "@/lib/ai/provider";

const MAX_TOOL_ROUNDS = 8;

export async function POST(req: NextRequest) {
  initDb();

  const body = await req.json() as {
    user_id: string;
    session_id?: string;
    discipline_id?: string;
    message: string;
    model?: string;
  };

  const { user_id, session_id, discipline_id, message, model } = body;

  // 1. Build system prompt
  const systemParts: string[] = [];

  // Base prompt with tags + pad
  const base = buildSystemPrompt({ userId: user_id, sessionId: session_id });
  systemParts.push(base);

  // Scoped or generalist context
  if (discipline_id) {
    systemParts.push(buildTabContext(user_id, discipline_id));
  } else {
    const gen = buildGeneralistContext(user_id);
    if (gen) systemParts.push(gen);
  }

  const systemPrompt = systemParts.join("\n\n");

  // 2. Build messages
  const messages: ChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: message },
  ];

  // 3. Get function defs
  const functions = toFunctionDefs();

  // 4. Chat loop — Gemma may call functions
  const ollama = new OllamaProvider(undefined, (model as "gemma4:2b" | "gemma4:4b" | "gemma4:12b" | "gemma4:27b") ?? undefined);

  let finalContent = "";
  let round = 0;

  while (round < MAX_TOOL_ROUNDS) {
    const response = await ollama.chat(messages, { functions });

    if (response.functionCall) {
      // Execute the function
      const result = execute(user_id, response.functionCall.name, response.functionCall.arguments, session_id);

      // Add assistant's tool call + result to messages
      messages.push({
        role: "assistant",
        content: `Calling ${response.functionCall.name}`,
      });
      messages.push({
        role: "system",
        content: JSON.stringify(result.result ?? result.error),
      });

      round++;
    } else {
      finalContent = response.content;
      break;
    }
  }

  if (!finalContent && round >= MAX_TOOL_ROUNDS) {
    finalContent = "I got caught in a tool loop. Could you rephrase?";
  }

  // 5. Record both turns in ledger
  recordTurn({
    userId: user_id,
    sessionId: session_id,
    role: "user",
    rawContent: message,
    mermaidSchema: "",  // Gemma fills this on next cycle if it wants
    centralIdea: message.substring(0, 120),
    tags: [],  // Gemma tags via function calls during the conversation
  });

  recordTurn({
    userId: user_id,
    sessionId: session_id,
    role: "assistant",
    rawContent: finalContent,
    mermaidSchema: "",
    centralIdea: finalContent.substring(0, 120),
    tags: [],
  });

  // 6. Return
  return NextResponse.json({
    content: finalContent,
    turns_used: round,
  });
}
