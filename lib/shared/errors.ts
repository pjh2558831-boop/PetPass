export class ConfigurationRequiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigurationRequiredError";
  }
}

export class ProviderResponseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProviderResponseError";
  }
}

export class ProviderHttpError extends ProviderResponseError {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(message: string, status: number, retryAfterMs: number | null = null) {
    super(message);
    this.name = "ProviderHttpError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export class ProviderTimeoutError extends ProviderResponseError {
  constructor(message: string) {
    super(message);
    this.name = "ProviderTimeoutError";
  }
}
