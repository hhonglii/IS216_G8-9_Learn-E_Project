// The last middleware in app.js: turns any error a route throws into the
// { error: { code, message, details } } body every API reply uses.
import { HttpError, sendError } from "../utils/httpError.js";

// Express identifies error middleware by all FOUR parameters; preserve this signature.
// Expected errors expose only deliberately safe fields; unexpected errors use a
// generic response so implementation details stay server-side.
export function errorHandler(error, req, res, next) {
  // Once a response has started, sending another JSON body would be invalid.
  if (res.headersSent) return next(error);
  // The JSON parser can reject input before a product controller is reached.
  // Match parser error types, not words in arbitrary exception messages.
  if (error.type === "entity.parse.failed") {
    return sendError(res, 400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  if (error.type === "entity.too.large") {
    return sendError(res, 413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
  }
  if (error instanceof HttpError) {
    return sendError(res, error.status, error.code, error.message, error.details);
  }
  return sendError(res, 500, "INTERNAL_ERROR", "An unexpected error occurred.");
}
