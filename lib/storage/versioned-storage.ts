import type { ZodType } from "zod";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface VersionedEnvelope {
  version: number;
  data: unknown;
}

type Migration = (value: unknown) => unknown;

function getBrowserStorage(): StorageLike | null {
  return typeof window === "undefined" ? null : window.localStorage;
}

export function readVersionedValue<T>(
  key: string,
  schema: ZodType<T>,
  options: {
    version: number;
    migrations?: Record<number, Migration>;
    storage?: StorageLike | null;
  },
): T | null {
  const storage = options.storage === undefined ? getBrowserStorage() : options.storage;
  if (!storage) return null;

  try {
    const raw = storage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw) as VersionedEnvelope;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof parsed.version !== "number" ||
      !("data" in parsed)
    ) {
      storage.removeItem(key);
      return null;
    }

    let data = parsed.data;
    let version = parsed.version;

    while (version < options.version) {
      const migrate = options.migrations?.[version];
      if (!migrate) {
        storage.removeItem(key);
        return null;
      }
      data = migrate(data);
      version += 1;
    }

    if (version !== options.version) {
      storage.removeItem(key);
      return null;
    }

    const result = schema.safeParse(data);
    if (!result.success) {
      storage.removeItem(key);
      return null;
    }
    return result.data;
  } catch {
    storage.removeItem(key);
    return null;
  }
}

export function writeVersionedValue<T>(
  key: string,
  value: T,
  schema: ZodType<T>,
  options: { version: number; storage?: StorageLike | null },
): boolean {
  const storage = options.storage === undefined ? getBrowserStorage() : options.storage;
  if (!storage) return false;

  const result = schema.safeParse(value);
  if (!result.success) return false;

  try {
    storage.setItem(
      key,
      JSON.stringify({ version: options.version, data: result.data }),
    );
    return true;
  } catch {
    return false;
  }
}
