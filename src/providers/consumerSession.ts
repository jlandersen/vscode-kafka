import { ConsumedRecord } from "../client";

export type ConsumerStreamState = "running" | "paused" | "error";

export interface ConsumerSessionMessage {
    id: number;
    key: string;
    partition: string;
    offset: string;
    value: string;
    headers: string;
    timestamp: string;
}

export interface ConsumerSessionCounts {
    total: number;
    filtered: number;
}

export interface ConsumerSessionState {
    streamState: ConsumerStreamState;
    error?: string;
    searchQuery: string;
    page: number;
    pageSize: number;
    totalPages: number;
    totalMessages: number;
    filteredMessages: number;
    maxBufferSize: number;
}

export interface ConsumerSessionPage {
    messages: ConsumerSessionMessage[];
    page: number;
    pageSize: number;
    totalPages: number;
}

interface StoredMessage {
    id: number;
    key: string;
    partition: string;
    offset: string;
    value: string;
    headers: string;
    timestamp: string;
    preview: Record<string, unknown>;
}

const DEFAULT_PAGE_SIZE = 100;
const MIN_PAGE_SIZE = 1;
const MAX_PAGE_SIZE = 1000;

export class ConsumerSession {
    private messages: StoredMessage[] = [];
    private nextMessageId = 1;
    private streamState: ConsumerStreamState = "running";
    private streamError: string | undefined;
    private searchQuery = "";
    private page = 1;
    private pageSize = DEFAULT_PAGE_SIZE;

    constructor(private readonly maxBufferSize: number) {}

    addRecord(record: ConsumedRecord): void {
        const timestamp = this.parseTimestamp(record.timestamp);
        this.messages.push({
            id: this.nextMessageId++,
            key: this.formatValue(record.key),
            partition: record.partition === undefined ? "" : String(record.partition),
            offset: record.offset ?? "",
            value: this.formatValue(record.value),
            headers: this.formatHeaders(record.headers),
            timestamp,
            preview: {
                topic: record.topic,
                partition: record.partition,
                offset: record.offset,
                timestamp,
                key: this.formatValue(record.key),
                value: this.formatValue(record.value),
                headers: record.headers
            }
        });
        this.enforceMaxBufferSize();
        this.ensureValidPage();
    }

    pause(): void {
        this.streamState = "paused";
    }

    resume(): void {
        this.streamState = "running";
    }

    setError(error: unknown): void {
        this.streamState = "error";
        this.streamError = this.formatError(error);
    }

    clear(): void {
        this.messages = [];
        this.page = 1;
    }

    setSearchQuery(query: string): void {
        this.searchQuery = query.trim();
        this.page = 1;
        this.ensureValidPage();
    }

    setPagination(page?: number, pageSize?: number): void {
        if (pageSize !== undefined) {
            this.pageSize = this.normalizePageSize(pageSize);
        }
        if (page !== undefined) {
            this.page = this.normalizePage(page);
        }
        this.ensureValidPage();
    }

    getCounts(): ConsumerSessionCounts {
        const filtered = this.getFilteredMessages();
        return {
            total: this.messages.length,
            filtered: filtered.length
        };
    }

    getMessages(): ConsumerSessionPage {
        const filteredDescending = this.getFilteredMessagesDescending();
        const totalPages = Math.max(1, Math.ceil(filteredDescending.length / this.pageSize));
        const page = Math.min(this.page, totalPages);
        const start = (page - 1) * this.pageSize;
        const end = start + this.pageSize;
        const pageMessages = filteredDescending
            .slice(start, end)
            .map((message) => this.toSessionMessage(message));

        return {
            messages: pageMessages,
            page,
            pageSize: this.pageSize,
            totalPages
        };
    }

    getPreviewMessage(id: number): Record<string, unknown> | undefined {
        return this.messages.find((message) => message.id === id)?.preview;
    }

    getExportMessages(): ConsumerSessionMessage[] {
        return this.getFilteredMessagesDescending().map((message) => this.toSessionMessage(message));
    }

    getState(): ConsumerSessionState {
        const counts = this.getCounts();
        const totalPages = Math.max(1, Math.ceil(counts.filtered / this.pageSize));
        const page = Math.min(this.page, totalPages);
        return {
            streamState: this.streamState,
            error: this.streamError,
            searchQuery: this.searchQuery,
            page,
            pageSize: this.pageSize,
            totalPages,
            totalMessages: counts.total,
            filteredMessages: counts.filtered,
            maxBufferSize: this.maxBufferSize
        };
    }

    private enforceMaxBufferSize(): void {
        if (this.messages.length <= this.maxBufferSize) {
            return;
        }
        const overflow = this.messages.length - this.maxBufferSize;
        this.messages.splice(0, overflow);
    }

    private getFilteredMessages(): StoredMessage[] {
        if (!this.searchQuery) {
            return this.messages;
        }
        const search = this.searchQuery.toLowerCase();
        return this.messages.filter((message) => {
            const content = `${message.key}\n${message.value}\n${message.headers}`.toLowerCase();
            return content.includes(search);
        });
    }

    private getFilteredMessagesDescending(): StoredMessage[] {
        return this.getFilteredMessages().slice().reverse();
    }

    private ensureValidPage(): void {
        const filteredCount = this.getFilteredMessages().length;
        const totalPages = Math.max(1, Math.ceil(filteredCount / this.pageSize));
        this.page = Math.min(Math.max(1, this.page), totalPages);
    }

    private normalizePage(page: number): number {
        if (!Number.isFinite(page) || page < 1) {
            return 1;
        }
        return Math.floor(page);
    }

    private normalizePageSize(pageSize: number): number {
        if (!Number.isFinite(pageSize)) {
            return DEFAULT_PAGE_SIZE;
        }
        return Math.max(MIN_PAGE_SIZE, Math.min(MAX_PAGE_SIZE, Math.floor(pageSize)));
    }

    private toSessionMessage(message: StoredMessage): ConsumerSessionMessage {
        return {
            id: message.id,
            key: message.key,
            partition: message.partition,
            offset: message.offset,
            value: message.value,
            headers: message.headers,
            timestamp: message.timestamp
        };
    }

    private formatValue(value: unknown): string {
        if (value === null || value === undefined) {
            return "";
        }
        if (typeof value === "string") {
            return value;
        }
        if (Buffer.isBuffer(value)) {
            return value.toString("utf-8");
        }
        if (typeof value === "object") {
            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        }
        return String(value);
    }

    private formatHeaders(headers: unknown): string {
        if (!headers || typeof headers !== "object") {
            return "";
        }
        return Object.entries(headers)
            .map(([key, value]) => `${key}: ${this.formatValue(value)}`)
            .join(", ");
    }

    private parseTimestamp(timestamp?: string): string {
        if (timestamp && Number.isFinite(Number(timestamp))) {
            const asNumber = Number(timestamp);
            const asDate = new Date(asNumber);
            if (!Number.isNaN(asDate.getTime())) {
                return asDate.toISOString();
            }
        }
        return new Date().toISOString();
    }

    private formatError(error: unknown): string {
        if (error instanceof Error) {
            return error.message;
        }
        if (typeof error === "string") {
            return error;
        }
        return String(error);
    }
}
