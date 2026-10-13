import "server-only";
import { APICallError, wrapLanguageModel, type LanguageModel } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createGroq } from "@ai-sdk/groq";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModelV4, LanguageModelV4Middleware } from "@ai-sdk/provider";

export interface ModelSpec {
  provider: "google" | "bayleaf" | "groq";
  modelId: string;
}

type Env = Record<string, string | undefined>;

/** The only place that names a vendor. Primary first; at most two entries. */
export function resolveModelSpecs(env: Env = process.env): ModelSpec[] {
  const specs: ModelSpec[] = [];
  if (env.GOOGLE_GENERATIVE_AI_API_KEY) {
    specs.push({ provider: "google", modelId: env.ASSISTANT_MODEL || "gemini-flash-lite-latest" });
  }
  // BayLeaf (UCSC, free, zero data retention) sits ahead of Groq; only the first two entries are used.
  if (env.BAYLEAF_API_KEY) {
    specs.push({ provider: "bayleaf", modelId: env.BAYLEAF_MODEL || "openrouter:z-ai/glm-5.3-flash" });
  }
  if (env.GROQ_API_KEY) {
    specs.push({ provider: "groq", modelId: env.ASSISTANT_FALLBACK_MODEL || "openai/gpt-oss-120b" });
  }
  // ASSISTANT_PRIMARY=bayleaf puts BayLeaf first (to try it, or to spare the Gemini quota).
  if (env.ASSISTANT_PRIMARY === "bayleaf") specs.sort((x, y) => Number(y.provider === "bayleaf") - Number(x.provider === "bayleaf"));
  return specs.slice(0, 2);
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
  if (spec.provider === "bayleaf") {
    return createOpenAICompatible({
      name: "bayleaf",
      baseURL: "https://api.bayleaf.dev/v1",
      apiKey: env.BAYLEAF_API_KEY,
    })(spec.modelId) as LanguageModelV4;
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
