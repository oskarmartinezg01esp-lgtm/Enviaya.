export type AppErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "UNAVAILABLE"
  | "OUT_OF_STOCK"
  | "EMPTY_CART"
  | "NO_ADDRESS"
  | "NO_PAYMENT_METHOD"
  | "CONFIRMATION_REQUIRED"
  | "INVALID_STATE"
  | "PAYMENT_FAILED"
  | "RATE_LIMITED"
  | "INTERNAL";

export class AppError extends Error {
  constructor(
    public code: AppErrorCode,
    message: string,
    public status = codeToStatus(code),
  ) {
    super(message);
    this.name = "AppError";
  }
}

function codeToStatus(code: AppErrorCode): number {
  switch (code) {
    case "UNAUTHORIZED":
      return 401;
    case "FORBIDDEN":
      return 403;
    case "NOT_FOUND":
      return 404;
    case "RATE_LIMITED":
      return 429;
    case "INTERNAL":
      return 500;
    default:
      return 400;
  }
}

export function toErrorMessage(err: unknown): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error && process.env.NODE_ENV !== "production") return err.message;
  return "Ha ocurrido un error inesperado.";
}
