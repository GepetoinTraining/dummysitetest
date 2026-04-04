// ============================================================
// AI Provider Abstraction
//
// Primary: Ollama (local Gemma 4 via ollama.cpp)
// Optional: External API provider for heavy research tasks
//
// The student downloads Gemma 4 on first setup and picks the
// model size for their device. External API keys are optional
// and stored hashed — only decrypted at call time.
// ============================================================

export type ModelSize = "gemma4:2b" | "gemma4:4b" | "gemma4:12b" | "gemma4:27b";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  images?: string[]; // base64 encoded for multimodal
}

export interface FunctionDef {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatOptions {
  model?: ModelSize;
  temperature?: number;
  functions?: FunctionDef[];
  stream?: boolean;
  format?: "json";
}

export interface ChatResponse {
  content: string;
  functionCall?: {
    name: string;
    arguments: Record<string, unknown>;
  };
  done: boolean;
}

export interface EmbeddingResponse {
  embedding: number[];
}

export interface AIProvider {
  /** Chat completion (with optional function calling) */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse>;

  /** Chat completion with streaming */
  chatStream(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncIterable<ChatResponse>;

  /** Generate embeddings for lattice/vector operations */
  embed(text: string, model?: string): Promise<EmbeddingResponse>;

  /** Check if the provider is available and model is loaded */
  isAvailable(): Promise<boolean>;

  /** Get provider name for UI display */
  name: string;
}

/**
 * Provider registry — Ollama is always first, external API is fallback.
 */
export interface ProviderConfig {
  ollama: {
    host: string; // default http://localhost:11434
    model: ModelSize;
  };
  external?: {
    provider: "anthropic" | "openai" | "google";
    keyHash: string; // hashed key stored in DB
    model: string;
  };
}
