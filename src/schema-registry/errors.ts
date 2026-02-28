export type SchemaRegistryErrorCode =
    | "not-configured"
    | "auth"
    | "tls"
    | "network"
    | "api"
    | "unexpected";

export class SchemaRegistryError extends Error {
    constructor(
        public readonly code: SchemaRegistryErrorCode,
        message: string,
        public readonly statusCode?: number,
        public readonly details?: string
    ) {
        super(message);
        this.name = "SchemaRegistryError";
    }
}

export const getSchemaRegistryErrorMessage = (error: unknown): string => {
    if (error instanceof SchemaRegistryError) {
        return error.message;
    }
    if (error instanceof Error && error.message) {
        return error.message;
    }
    if (typeof error === "string" && error) {
        return error;
    }
    return "Unknown Schema Registry error";
};

export const mapSchemaRegistryError = (error: unknown, fallbackMessage: string): SchemaRegistryError => {
    if (error instanceof SchemaRegistryError) {
        return error;
    }

    const message = error instanceof Error ? error.message : String(error || "");
    const normalized = message.toLowerCase();

    if (normalized.includes("certificate") || normalized.includes("tls") || normalized.includes("ssl")) {
        return new SchemaRegistryError("tls", "Schema Registry TLS validation failed. Check certificate settings.", undefined, message);
    }

    if (normalized.includes("unauthorized") || normalized.includes("forbidden") || normalized.includes("401") || normalized.includes("403")) {
        return new SchemaRegistryError("auth", "Schema Registry authentication failed. Check username/password.", undefined, message);
    }

    if (normalized.includes("econnrefused") || normalized.includes("enotfound") || normalized.includes("eai_again") || normalized.includes("timeout") || normalized.includes("network")) {
        return new SchemaRegistryError("network", "Schema Registry is unreachable. Check URL and connectivity.", undefined, message);
    }

    return new SchemaRegistryError("unexpected", fallbackMessage, undefined, message || undefined);
};
