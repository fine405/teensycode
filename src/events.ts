import { tool, type Tool } from "ai";

export type LifecycleEvent =
  | "session_start"
  | "tool_call"
  | "tool_result"
  | "session_before_compact"
  | "session_shutdown";

export type EventData = Record<string, any>;
export type EventResult = {
  block?: boolean;
  reason?: string;
  modify?: EventData;
} | void;

type EventHandler = (data: EventData) => EventResult | Promise<EventResult>;

export interface EventEmission<T extends EventData> {
  data: T;
  results: Exclude<EventResult, void>[];
  blocked: boolean;
  reason?: string;
}

export interface EventBus {
  on(event: LifecycleEvent, handler: EventHandler): void;
  emit<T extends EventData>(
    event: LifecycleEvent,
    data: T,
  ): Promise<EventEmission<T>>;
}

export function createEventBus(): EventBus {
  const handlers = new Map<LifecycleEvent, EventHandler[]>();

  return {
    on(event, handler) {
      const existing = handlers.get(event) ?? [];
      existing.push(handler);
      handlers.set(event, existing);
    },
    async emit(event, initialData) {
      let data = initialData;
      const results: Exclude<EventResult, void>[] = [];

      for (const handler of handlers.get(event) ?? []) {
        const result = await handler(data);
        if (!result) continue;

        results.push(result);
        if (result.modify) {
          data = { ...data, ...result.modify };
        }
        if (result.block) {
          return {
            data,
            results,
            blocked: true,
            reason: result.reason ?? "Blocked by an extension.",
          };
        }
      }

      return { data, results, blocked: false };
    },
  };
}

export function wrapToolWithEvents(
  toolName: string,
  base: Tool,
  events: EventBus,
): Tool {
  if (!base.execute) throw new Error("Cannot wrap a tool without execute");

  return tool({
    description: base.description,
    inputSchema: base.inputSchema,
    execute: async (input, options) => {
      const call = await events.emit("tool_call", { toolName, input });
      if (call.blocked) return `Blocked: ${call.reason}`;

      const result = await base.execute!(call.data.input, options);
      const completed = await events.emit("tool_result", {
        toolName,
        input: call.data.input,
        result,
      });

      return completed.blocked
        ? `Blocked: ${completed.reason}`
        : completed.data.result;
    },
  });
}
