/**
 * useChat turns a non-2xx response body into error.message verbatim. Our API replies with
 * JSON { error }, so unwrap it to the plain friendly sentence before the SDK sees it.
 */
export async function friendlyErrorResponse(res: Response): Promise<Response> {
  if (res.ok) return res;
  let message = "Something went wrong. Please try again.";
  try {
    const body = (await res.json()) as { error?: unknown };
    if (typeof body.error === "string" && body.error) message = body.error;
  } catch {
    // keep the generic message
  }
  return new Response(message, { status: res.status });
}
