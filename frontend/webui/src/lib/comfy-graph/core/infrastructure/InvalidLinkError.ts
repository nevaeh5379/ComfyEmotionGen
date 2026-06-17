
export class InvalidLinkError extends Error {
  constructor(
    message = 'Attempted to access a link that was invalid.',
    cause?: Error
  ) {
    super(message, { cause })
    this.name = 'InvalidLinkError'
  }
}
