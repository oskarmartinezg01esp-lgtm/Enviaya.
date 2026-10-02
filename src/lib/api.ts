import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { AppError, toErrorMessage } from "@/lib/errors";

type Handler<C> = (req: NextRequest, ctx: C) => Promise<Response | unknown>;

/**
 * Envoltorio para route handlers: respuestas JSON homogéneas, errores tipados
 * y protección CSRF básica (Origin debe coincidir con Host en métodos mutables).
 */
export function apiRoute<C = unknown>(handler: Handler<C>) {
  return async (req: NextRequest, ctx: C) => {
    try {
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        const origin = req.headers.get("origin");
        const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
        if (origin && host && new URL(origin).host !== host) {
          throw new AppError("FORBIDDEN", "Origen no permitido.");
        }
      }
      const result = await handler(req, ctx);
      if (result instanceof Response) return result;
      return NextResponse.json(result ?? { ok: true });
    } catch (err) {
      if (err instanceof ZodError) {
        return NextResponse.json({ error: err.issues[0]?.message ?? "Datos no válidos", code: "VALIDATION" }, { status: 400 });
      }
      if (err instanceof AppError) {
        return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
      }
      console.error("[api]", err);
      return NextResponse.json({ error: toErrorMessage(err), code: "INTERNAL" }, { status: 500 });
    }
  };
}

export async function readJson<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AppError("VALIDATION", "JSON no válido.");
  }
}
