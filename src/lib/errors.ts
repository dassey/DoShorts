/** A failure with a message that is safe to show the user. Never include secrets in `message`. */
export class GenerationError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
