// Supplied infrastructure; see docs/walkthrough/02_READ_THE_SERVER.md (project root).
// fn is passed as a function, not called while routes are registered. Return a new
// Express handler, run fn inside the promise chain, and forward throws/rejections
// to next(error). This wrapper neither formats success JSON nor retries a write.
export function asyncHandler(fn) {
  return (req, res, next) =>
    Promise.resolve()
      .then(() => fn(req, res, next))
      .catch(next);
}
