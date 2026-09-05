import type { ZodType, ZodTypeDef } from "zod";

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
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

export function readVersionedValue<T>(
  key: string,
  schema: ZodType<T, ZodTypeDef, unknown>,
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
      return null;
    }

    let data = parsed.data;
    let version = parsed.version;

    while (version < options.version) {
      const migrate = options.migrations?.[version];
      if (!migrate) {
        return null;
      }
      data = migrate(data);
      version += 1;
    }

    if (version !== options.version) {
      return null;
    }

    const result = schema.safeParse(data);
    if (!result.success) {
      return null;
    }
    return result.data;
  } catch {
    return null;
  }
}

export function writeVersionedValue<T>(
  key: string,
  value: T,
  schema: ZodType<T, ZodTypeDef, unknown>,
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
