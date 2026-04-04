// ============================================================
// AI Router — decides which provider handles each request
//
// Rules:
// 1. Ollama (local Gemma 4) is ALWAYS the primary provider
// 2. External API is ONLY used when:
//    a. Student has configured an API key
//    b. The request is tagged as "heavy research"
//    c. Ollama is unavailable (fallback)
// 3. Embeddings always go through Ollama (local, no data leaves)
// ============================================================

import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  EmbeddingResponse,
  ModelSize,
} from "./provider";
import { OllamaProvider } from "./ollama";
import { ExternalProvider } from "./external";
import { retrieveApiKey, hasApiKey } from "./keys";

export type RequestIntent = "chat" | "research" | "exercise" | "extraction" | "assessment";

export class AIRouter {
  private ollama: OllamaProvider;
  private external: ExternalProvider | null = null;
  private userId: string;

  constructor(userId: string, ollamaHost?: string, model?: ModelSize) {
    this.userId = userId;
    this.ollama = new OllamaProvider(ollamaHost, model);
  }

  /**
   * Unlock external provider with passphrase.
   * Called when student wants to use external API for a session.
   */
  unlockExternal(
    provider: "anthropic" | "openai" | "google",
    passphrase: string
  ): boolean {
    const key = retrieveApiKey(this.userId, provider, passphrase);
    if (!key) return false;
    this.external = new ExternalProvider(provider, key);
    return true;
  }

  /**
   * Check if external provider is available.
   */
  hasExternal(): boolean {
    return this.external !== null;
  }

  /**
   * Route a chat request to the appropriate provider.
   *
   * - "research" intent → external if available, else ollama
   * - everything else → ollama always
   */
  async chat(
    messages: ChatMessage[],
    options?: ChatOptions & { intent?: RequestIntent }
  ): Promise<ChatResponse> {
    const intent = options?.intent ?? "chat";

    // Heavy research goes to external if available
    if (intent === "research" && this.external) {
      try {
        return await this.external.chat(messages, options);
      } catch {
        // Fallback to local
        return this.ollama.chat(messages, options);
      }
    }

    // Everything else is local
    try {
      return await this.ollama.chat(messages, options);
    } catch {
      // If ollama is down and we have external, use it
      if (this.external) {
        return this.external.chat(messages, options);
      }
      throw new Error("No AI provider available. Is Ollama running?");
    }
  }

  /**
   * Stream chat — always local (latency matters for UX).
   */
  chatStream(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncIterable<ChatResponse> {
    return this.ollama.chatStream(messages, options);
  }

  /**
   * Embeddings — ALWAYS local. No data leaves the machine.
   */
  async embed(text: string): Promise<EmbeddingResponse> {
    return this.ollama.embed(text);
  }

  /**
   * Check overall availability.
   */
  async isAvailable(): Promise<{ ollama: boolean; external: boolean }> {
    const ollamaOk = await this.ollama.isAvailable();
    const externalOk = this.external ? await this.external.isAvailable() : false;
    return { ollama: ollamaOk, external: externalOk };
  }

  /**
   * Get the Ollama provider directly (for model management).
   */
  getOllama(): OllamaProvider {
    return this.ollama;
  }
}
