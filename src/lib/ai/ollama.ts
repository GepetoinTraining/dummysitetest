// ============================================================
// Ollama Provider — local Gemma 4 via ollama.cpp
//
// Primary inference engine. Student downloads model on first
// setup. Model size is selectable per device capability.
//
// Ollama REST API: http://localhost:11434/api/...
// ============================================================

import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  ChatResponse,
  ModelSize,
} from "./provider";

const DEFAULT_HOST = "http://localhost:11434";

export class OllamaProvider implements AIProvider {
  readonly name = "ollama";
  private host: string;
  private model: ModelSize;

  constructor(host?: string, model?: ModelSize) {
    this.host = host ?? DEFAULT_HOST;
    this.model = model ?? "gemma4:12b";
  }

  async isAvailable(): Promise<boolean> {
    try {
      const res = await fetch(`${this.host}/api/tags`);
      if (!res.ok) return false;
      const data = (await res.json()) as { models?: { name: string }[] };
      return data.models?.some((m) => m.name.startsWith("gemma4")) ?? false;
    } catch {
      return false;
    }
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<ChatResponse> {
    const model = options?.model ?? this.model;

    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.images ? { images: m.images } : {}),
      })),
      stream: false,
      options: {
        temperature: options?.temperature ?? 0.7,
      },
    };

    // Function calling via Ollama's tool support
    if (options?.functions && options.functions.length > 0) {
      body.tools = options.functions.map((fn) => ({
        type: "function",
        function: {
          name: fn.name,
          description: fn.description,
          parameters: fn.parameters,
        },
      }));
    }

    if (options?.format) {
      body.format = options.format;
    }

    const res = await fetch(`${this.host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`Ollama chat failed: ${res.status} ${await res.text()}`);
    }

    const data = (await res.json()) as {
      message: {
        role: string;
        content: string;
        tool_calls?: {
          function: { name: string; arguments: Record<string, unknown> };
        }[];
      };
      done: boolean;
    };

    const toolCall = data.message.tool_calls?.[0];

    return {
      content: data.message.content,
      functionCall: toolCall
        ? {
            name: toolCall.function.name,
            arguments: toolCall.function.arguments,
          }
        : undefined,
      done: data.done,
    };
  }

  async *chatStream(
    messages: ChatMessage[],
    options?: ChatOptions
  ): AsyncIterable<ChatResponse> {
    const model = options?.model ?? this.model;

    const body: Record<string, unknown> = {
      model,
      messages: messages.map((m) => ({
        role: m.role,
        content: m.content,
        ...(m.images ? { images: m.images } : {}),
      })),
      stream: true,
      options: {
        temperature: options?.temperature ?? 0.7,
      },
    };

    const res = await fetch(`${this.host}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Ollama stream failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        const data = JSON.parse(line) as {
          message: { content: string };
          done: boolean;
        };
        yield {
          content: data.message.content,
          done: data.done,
        };
      }
    }
  }

  /**
   * Pull a model from Ollama registry.
   * Called on first setup when student picks their model size.
   */
  async pullModel(model: ModelSize): Promise<AsyncIterable<PullProgress>> {
    const res = await fetch(`${this.host}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: model, stream: true }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Ollama pull failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    return {
      async *[Symbol.asyncIterator]() {
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.trim()) continue;
            yield JSON.parse(line) as PullProgress;
          }
        }
      },
    };
  }

  /**
   * List locally available models.
   */
  async listModels(): Promise<LocalModel[]> {
    const res = await fetch(`${this.host}/api/tags`);
    if (!res.ok) return [];
    const data = (await res.json()) as { models: LocalModel[] };
    return data.models ?? [];
  }
}

export interface PullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

export interface LocalModel {
  name: string;
  size: number;
  digest: string;
  modified_at: string;
}
