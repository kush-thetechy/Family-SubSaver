/** Thrown when an import was already saved earlier (same idempotency key). Not a failure. */
export class AlreadyImportedError extends Error {
  constructor() {
    super("This item was already added from an earlier import.");
    this.name = "AlreadyImportedError";
  }
}
