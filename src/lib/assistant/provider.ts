import "server-only";
import { APICallError, wrapLanguageModel, type LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModelV4, LanguageModelV4Middleware } from "@ai-sdk/provider";

export interface ModelSpec {
  provider: "google" | "groq";
  modelId: string;
}

type Env = Record<string, string | undefined>;

/** The only place that names a vendor. Primary first; at most two entries. */
export function resolveModelSpecs(env: Env = process.env): ModelSpec[] {
  const specs: ModelSpec[] = [];
  if (env.GOOGLE_GENERATIVE_AI_API_KEY) {
    specs.push({ provider: "google", modelId: env.ASSISTANT_MODEL || "gemini-flash-latest" });
  }
  if (env.GROQ_API_KEY) {
    specs.push({ provider: "groq", modelId: env.ASSISTANT_FALLBACK_MODEL || "openai/gpt-oss-120b" });
  }
  return specs;
}

export function isFallbackError(err: unknown): boolean {
  if (!APICallError.isInstance(err)) return false;
  const status = err.statusCode;
  return status === 429 || (status !== undefined && status >= 500);
}

function createModel(spec: ModelSpec, env: Env): LanguageModelV4 {
  if (spec.provider === "google") {
    return createGoogleGenerativeAI({ apiKey: env.GOOGLE_GENERATIVE_AI_API_KEY })(spec.modelId) as LanguageModelV4;
  }
  return createGroq({ apiKey: env.GROQ_API_KEY })(spec.modelId) as LanguageModelV4;
}

/** Null when no provider is configured (the route then shows a "not set up" message). */
export function buildModel(env: Env = process.env): LanguageModel | null {
  const specs = resolveModelSpecs(env);
  if (specs.length === 0) return null;
  const primary = createModel(specs[0], env);
  if (specs.length === 1) return primary;

  const fallback = createModel(specs[1], env);
  const middleware: LanguageModelV4Middleware = {
    specificationVersion: "v4",
    // Free tiers fail with 429 before any stream byte, so one retry on the other provider is safe.
    wrapStream: async ({ doStream, params }) => {
      try {
        return await doStream();
      } catch (err) {
        if (!isFallbackError(err)) throw err;
        return fallback.doStream(params);
      }
    },
    wrapGenerate: async ({ doGenerate, params }) => {
      try {
        return await doGenerate();
      } catch (err) {
        if (!isFallbackError(err)) throw err;
        return fallback.doGenerate(params);
      }
    },
  };
  return wrapLanguageModel({ model: primary, middleware });
}
