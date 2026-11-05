// Expected failure value shared by controllers and the final error middleware.
// Constructing/throwing this object does not itself send an HTTP response.
// status is numeric HTTP status; code is a stable label; message is user-readable.
// details must be safe to expose: no credentials, raw database errors or answer keys.
export class HttpError extends Error {
  constructor(status, code, message, details = null) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

// Sends the same { error: { code, message, details } } body the error
// middleware sends for an HttpError, for handlers that answer directly.
export function sendError(res, status, code, message, details = null) {
  return res.status(status).json({ error: { code, message, details } });
}
