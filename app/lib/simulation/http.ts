export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
/** Same-origin check against the host the browser actually called (req.url may say "localhost" in dev or behind a proxy). */
export function isSameOrigin(req: Request) {
  if (req.headers.get("sec-fetch-site") === "cross-site") return false;
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  try {
    return new URL(origin).host === (host || new URL(req.url).host);
  } catch {
    return false;
  }
}
export function checkOrigin(req: Request) {
  if (!isSameOrigin(req)) throw new HttpError(403, "Origine refusée");
}
export async function body(req: Request): Promise<Record<string, unknown>> {
  checkOrigin(req);
  const maxBytes = 160000;
  if (Number(req.headers.get("content-length")) > maxBytes)
    throw new HttpError(413, "Requête trop volumineuse");
  if (!req.body) throw new HttpError(400, "Objet JSON requis");
  const reader = req.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0,
    text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new HttpError(413, "Requête trop volumineuse");
      }
      text += decoder.decode(value, { stream: true });
    }
    text += decoder.decode();
  } finally {
    reader.releaseLock();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new HttpError(400, "JSON invalide");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new HttpError(400, "Objet JSON requis");
  return parsed as Record<string, unknown>;
}
