// ============================================================
// External API Provider — optional fallback for heavy research
//
// When Gemma 4 local isn't enough (complex multi-source research,
// very long context), the student can optionally provide an API
// key to a cloud provider. This adapter wraps OpenAI-compatible
// APIs (works with OpenAI, Anthropic via proxy, Google AI Studio).
// ============================================================

import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  EmbeddingResponse,
} from "./provider";

export class ExternalProvider implements AIProvider {
  readonly name: string;
  private apiKey: string;
  private baseUrl: string;
  private model: string;

  constructor(
    provider: "anthropic" | "openai" | "google",
    apiKey: string,
    model?: string
  ) {
    this.name = provider;
    this.apiKey = apiKey;

    switch (provider) {
      case "openai":
        this.baseUrl = "https://api.openai.com/v1";
        this.model = model ?? "gpt-4o";
        break;
      case "anthropic":
        this.baseUrl = "https://api.anthropic.com/v1";
        this.model = model ?? "claude-sonnet-4-20250514";
        break;
      case "google":
        this.baseUrl = "https://generativelanguage.googleapis.com/v1beta";
        this.model = model ?? "gemini-2.5-flash";
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  async isAvailable(): Promise<boolean> {
    return !!this.apiKey;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    if (this.name === "anthropic") {
      return this.chatAnthropic(messages, options);
    }
    // OpenAI-compatible (covers OpenAI + Google via compatible endpoint)
    return this.chatOpenAICompatible(messages, options);
  }

  private async chatOpenAICompatible(
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0.7,
      stream: false,
    };

    if (options?.functions) {
      body.tools = options.functions.map((fn) => ({
        type: "function",
        function: {
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters,
        },
      }));
    }

    const res = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`External API failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as {
      choices: {
        message: {
          content: string;
          tool_calls?: {
            function: { name: string; arguments: string };
          }[];
        };
      }[];
    };

    const msg = data.choices[0].message;
    const toolCall = msg.tool_calls?.[0];

    return {
      content: msg.content ?? "",
      functionCall: toolCall
        ? {
            name: toolCall.function.name,
            arguments: JSON.parse(toolCall.function.arguments),
          }
        : undefined,
      done: true,
    };
  }

  private async chatAnthropic(
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<ChatResponse> {
    const systemMsg = messages.find((m) => m.role === "system");
    const nonSystem = messages.filter((m) => m.role !== "system");

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: 4096,
      messages: nonSystem.map((m) => ({ role: m.role, content: m.content })),
      ...(systemMsg ? { system: systemMsg.content } : {}),
    };

    if (options?.functions) {
      body.tools = options.functions.map((fn) => ({
        name: fn.name,
        description: fn.description,
        input_schema: fn.parameters,
      }));
    }

    const res = await fetch(`${this.baseUrl}/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Anthropic API failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as {
      content: { type: string; text?: string; name?: string; input?: Record<string, unknown> }[];
    };

    const textBlock = data.content.find((b) => b.type === "text");
    const toolBlock = data.content.find((b) => b.type === "tool_use");

    return {
      content: textBlock?.text ?? "",
      functionCall: toolBlock
        ? { name: toolBlock.name!, arguments: toolBlock.input! }
        : undefined,
      done: true,
    };
  }

  async *chatStream(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncIterable<ChatResponse> {
    // For external providers, just yield the full response
    // Streaming can be added per-provider later
    const response = await this.chat(messages, options);
    yield response;
  }

  async embed(text: string): Promise<EmbeddingResponse> {
    if (this.name === "anthropic") {
      throw new Error("Anthropic does not support embeddings — use Ollama");
    }

    const res = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: "text-embedding-3-small",
        input: text,
      }),
    });

    if (!res.ok) {
      throw new Error(`Embedding failed: ${res.status}`);
    }

    const data = (await res.json()) as {
      data: { embedding: number[] }[];
    };

    return { embedding: data.data[0].embedding };
  }
}
