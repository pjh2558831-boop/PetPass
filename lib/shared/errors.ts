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
