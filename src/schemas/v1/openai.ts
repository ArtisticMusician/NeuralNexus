import { Type, Static } from "@sinclair/typebox";

export const OpenAIChatMessageSchema = Type.Object({
    role: Type.String({ enum: ["system", "user", "assistant", "tool"] }),
    content: Type.Union([Type.String(), Type.Array(Type.Any())]),
    name: Type.Optional(Type.String())
}, { additionalProperties: true, title: "ChatMessage" }); // true for forward-compatibility with OpenAI payload

export const OpenAIChatRequestSchema = Type.Object({
    model: Type.String(),
    messages: Type.Array(OpenAIChatMessageSchema),
    temperature: Type.Optional(Type.Number()),
    max_tokens: Type.Optional(Type.Integer()),
    stream: Type.Optional(Type.Boolean()),
    stop: Type.Optional(Type.Union([Type.String(), Type.Array(Type.String())])),
    presence_penalty: Type.Optional(Type.Number()),
    frequency_penalty: Type.Optional(Type.Number())
}, { additionalProperties: true, title: "ChatRequest" }); // Proxy allows additional OpenAI options

export type OpenAIChatRequest = Static<typeof OpenAIChatRequestSchema>;
