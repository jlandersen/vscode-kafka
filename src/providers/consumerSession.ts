import { ConsumedRecord } from "../client";

export type ConsumerStreamState = "running" | "paused" | "error";
export type ConsumerConsumeMode = "latest" | "earliest" | "timestamp";

export interface ConsumerSessionConsumeSettings {
    consumeMode: ConsumerConsumeMode;
    consumeTimestamp: string;
    consumedPartitions: string;
}

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
    filteredBeforeTimeRange: number;
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
    filteredBeforeTimeRange: number;
    maxBufferSize: number;
    availablePartitions: string[];
    selectedFilterPartitions: string[];
    consumeMode: ConsumerConsumeMode;
    consumeTimestamp: string;
    consumedPartitions: string;
    timeRangeStartMs?: number;
    timeRangeEndMs?: number;
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
    timestampMs: number;
    preview: Record<string, unknown>;
}

export interface ConsumerSessionHistogramBin {
    startMs: number;
    endMs: number;
    totalCount: number;
    filteredCount: number;
}

export interface ConsumerSessionHistogram {
    bins: ConsumerSessionHistogramBin[];
    minTimestampMs?: number;
    maxTimestampMs?: number;
    timeRangeStartMs?: number;
    timeRangeEndMs?: number;
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
    private selectedFilterPartitions = new Set<string>();
    private timeRangeStartMs: number | undefined;
    private timeRangeEndMs: number | undefined;
    private consumeSettings: ConsumerSessionConsumeSettings = {
        consumeMode: "latest",
        consumeTimestamp: "",
        consumedPartitions: ""
    };

    constructor(private readonly maxBufferSize: number) {}

    addRecord(record: ConsumedRecord): void {
        const timestampData = this.parseTimestamp(record.timestamp);
        this.messages.push({
            id: this.nextMessageId++,
            key: this.formatValue(record.key),
            partition: record.partition === undefined ? "" : String(record.partition),
            offset: record.offset ?? "",
            value: this.formatValue(record.value),
            headers: this.formatHeaders(record.headers),
            timestamp: timestampData.iso,
            timestampMs: timestampData.ms,
            preview: {
                topic: record.topic,
                partition: record.partition,
                offset: record.offset,
                timestamp: timestampData.iso,
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

    resetForConsumeSettings(settings: ConsumerSessionConsumeSettings): void {
        this.consumeSettings = {
            consumeMode: settings.consumeMode,
            consumeTimestamp: settings.consumeTimestamp.trim(),
            consumedPartitions: settings.consumedPartitions.trim()
        };
        this.messages = [];
        this.searchQuery = "";
        this.page = 1;
        this.streamState = "running";
        this.streamError = undefined;
        this.selectedFilterPartitions.clear();
        this.timeRangeStartMs = undefined;
        this.timeRangeEndMs = undefined;
    }

    setConsumeSettings(settings: ConsumerSessionConsumeSettings): void {
        this.consumeSettings = {
            consumeMode: settings.consumeMode,
            consumeTimestamp: settings.consumeTimestamp.trim(),
            consumedPartitions: settings.consumedPartitions.trim()
        };
    }

    setSearchQuery(query: string): void {
        this.searchQuery = query.trim();
        this.page = 1;
        this.ensureValidPage();
    }

    setPartitionFilter(partitions: string[]): void {
        this.selectedFilterPartitions = new Set(partitions.map((partition) => partition.trim()).filter((partition) => partition.length > 0));
        this.page = 1;
        this.ensureValidPage();
    }

    setTimeRangeFilter(startMs?: number, endMs?: number): void {
        if (
            startMs === undefined || endMs === undefined ||
            !Number.isFinite(startMs) ||
            !Number.isFinite(endMs)
        ) {
            this.timeRangeStartMs = undefined;
            this.timeRangeEndMs = undefined;
            this.page = 1;
            this.ensureValidPage();
            return;
        }

        const normalizedStart = Math.floor(startMs);
        const normalizedEnd = Math.floor(endMs);
        if (normalizedStart <= normalizedEnd) {
            this.timeRangeStartMs = normalizedStart;
            this.timeRangeEndMs = normalizedEnd;
        } else {
            this.timeRangeStartMs = normalizedEnd;
            this.timeRangeEndMs = normalizedStart;
        }

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
        const filteredBeforeTimeRange = this.getPartitionAndSearchFilteredMessages().length;
        const filtered = this.getFilteredMessages().length;
        return {
            total: this.messages.length,
            filtered,
            filteredBeforeTimeRange
        };
    }

    getHistogram(binCount = 60): ConsumerSessionHistogram {
        if (this.messages.length === 0) {
            return {
                bins: [],
                timeRangeStartMs: this.timeRangeStartMs,
                timeRangeEndMs: this.timeRangeEndMs
            };
        }

        const normalizedBinCount = this.normalizeHistogramBinCount(binCount);
        const minTimestampMs = this.messages.reduce((min, message) => Math.min(min, message.timestampMs), Number.POSITIVE_INFINITY);
        const maxTimestampMs = this.messages.reduce((max, message) => Math.max(max, message.timestampMs), Number.NEGATIVE_INFINITY);
        const span = Math.max(1, maxTimestampMs - minTimestampMs);
        const binSpan = span / normalizedBinCount;

        const bins: ConsumerSessionHistogramBin[] = Array.from({ length: normalizedBinCount }, (_, index) => {
            const startMs = Math.floor(minTimestampMs + (binSpan * index));
            const endMs = index === normalizedBinCount - 1
                ? maxTimestampMs
                : Math.floor(minTimestampMs + (binSpan * (index + 1)));
            return {
                startMs,
                endMs: Math.max(startMs, endMs),
                totalCount: 0,
                filteredCount: 0
            };
        });

        for (let i = 0; i < this.messages.length; i++) {
            const message = this.messages[i];
            const rawIndex = Math.floor(((message.timestampMs - minTimestampMs) / span) * normalizedBinCount);
            const index = Math.min(normalizedBinCount - 1, Math.max(0, rawIndex));
            bins[index].totalCount += 1;
            if (this.matchesPartitionAndSearchFilters(message)) {
                bins[index].filteredCount += 1;
            }
        }

        return {
            bins,
            minTimestampMs,
            maxTimestampMs,
            timeRangeStartMs: this.timeRangeStartMs,
            timeRangeEndMs: this.timeRangeEndMs
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
            filteredBeforeTimeRange: counts.filteredBeforeTimeRange,
            maxBufferSize: this.maxBufferSize,
            availablePartitions: this.getAvailablePartitions(),
            selectedFilterPartitions: Array.from(this.selectedFilterPartitions),
            consumeMode: this.consumeSettings.consumeMode,
            consumeTimestamp: this.consumeSettings.consumeTimestamp,
            consumedPartitions: this.consumeSettings.consumedPartitions,
            timeRangeStartMs: this.timeRangeStartMs,
            timeRangeEndMs: this.timeRangeEndMs
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
        return this.messages.filter((message) => this.matchesFilters(message));
    }

    private getPartitionAndSearchFilteredMessages(): StoredMessage[] {
        return this.messages.filter((message) => this.matchesPartitionAndSearchFilters(message));
    }

    private getFilteredMessagesDescending(): StoredMessage[] {
        return this.getFilteredMessages().slice().reverse();
    }

    private matchesFilters(message: StoredMessage): boolean {
        if (!this.matchesPartitionAndSearchFilters(message)) {
            return false;
        }

        if (this.timeRangeStartMs === undefined || this.timeRangeEndMs === undefined) {
            return true;
        }

        return message.timestampMs >= this.timeRangeStartMs && message.timestampMs <= this.timeRangeEndMs;
    }

    private matchesPartitionAndSearchFilters(message: StoredMessage): boolean {
        if (this.selectedFilterPartitions.size > 0 && !this.selectedFilterPartitions.has(message.partition)) {
            return false;
        }

        if (!this.searchQuery) {
            return true;
        }

        const search = this.searchQuery.toLowerCase();
        const content = `${message.key}\n${message.value}\n${message.headers}`.toLowerCase();
        return content.includes(search);
    }

    private getAvailablePartitions(): string[] {
        const partitions = new Set<string>();
        for (let i = 0; i < this.messages.length; i++) {
            const partition = this.messages[i].partition;
            if (partition.length > 0) {
                partitions.add(partition);
            }
        }

        return Array.from(partitions).sort((left, right) => Number(left) - Number(right));
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

    private normalizeHistogramBinCount(binCount: number): number {
        if (!Number.isFinite(binCount)) {
            return 60;
        }
        return Math.max(10, Math.min(120, Math.floor(binCount)));
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

    private parseTimestamp(timestamp?: string): { iso: string; ms: number } {
        if (timestamp && Number.isFinite(Number(timestamp))) {
            const asNumber = Number(timestamp);
            const asDate = new Date(asNumber);
            if (!Number.isNaN(asDate.getTime())) {
                return {
                    iso: asDate.toISOString(),
                    ms: asNumber
                };
            }
        }

        if (timestamp) {
            const parsed = Date.parse(timestamp);
            if (!Number.isNaN(parsed)) {
                return {
                    iso: new Date(parsed).toISOString(),
                    ms: parsed
                };
            }
        }

        const now = Date.now();
        return {
            iso: new Date(now).toISOString(),
            ms: now
        };
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
