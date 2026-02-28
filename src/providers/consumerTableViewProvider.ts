import * as vscode from "vscode";
import { ConsumedRecord, Consumer, ConsumerCollection, ConsumerInfoUri, createConsumerUri, extractConsumerInfoUri, parsePartitions } from "../client";
import { ClusterSettings } from "../settings/clusters";
import { WorkspaceSettings } from "../settings";
import { ConsumerConsumeMode, ConsumerSession, ConsumerSessionConsumeSettings, ConsumerSessionMessage } from "./consumerSession";

const DEFAULT_BUFFER_SIZE = 5000;
const RENDER_THROTTLE_MS = 50;

type WebviewCommand =
    | "GetMessages"
    | "GetMessagesCount"
    | "GetHistogram"
    | "StartConsumer"
    | "StopConsumer"
    | "Pause"
    | "Resume"
    | "SearchMessages"
    | "SetPartitionFilter"
    | "SetTimeRangeFilter"
    | "ClearTimeRangeFilter"
    | "ApplyConsumeSettings"
    | "ClearMessages"
    | "PreviewMessage"
    | "ExportMessages";

type ConsumerLifecycleAction = "starting" | "stopping";

interface WebviewRequest {
    command: WebviewCommand;
    page?: number;
    pageSize?: number;
    query?: string;
    messageId?: number;
    partitions?: string[];
    consumeMode?: ConsumerConsumeMode;
    consumeTimestamp?: string;
    consumedPartitions?: string;
    startMs?: number;
    endMs?: number;
    binCount?: number;
}

export class ConsumerTableViewProvider implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private consumerDisposables: vscode.Disposable[] = [];
    private session: ConsumerSession | undefined;
    private consumer: Consumer | undefined;
    private activeConsumerUri: string | undefined;
    private activeConsumerInfo: ConsumerInfoUri | undefined;
    private lifecycleAction: ConsumerLifecycleAction | undefined;
    private renderTimer: NodeJS.Timeout | undefined;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private readonly consumerCollection: ConsumerCollection,
        private readonly clusterSettings: ClusterSettings,
        private readonly workspaceSettings: WorkspaceSettings
    ) {}

    public async show(consumerUri: vscode.Uri): Promise<void> {
        const consumer = this.consumerCollection.get(consumerUri);
        if (!consumer) {
            vscode.window.showErrorMessage("Consumer not found");
            return;
        }

        if (!this.panel) {
            this.createPanel();
        }

        this.panel?.reveal(vscode.ViewColumn.Beside);

        if (this.activeConsumerUri === consumerUri.toString()) {
            this.sendConsumerInfo();
            this.renderNow();
            return;
        }

        this.bindConsumer(consumer, consumerUri.toString());
        this.sendConsumerInfo();
        this.renderNow();
    }

    private createPanel(): void {
        this.panel = vscode.window.createWebviewPanel(
            "kafkaConsumerTable",
            "Kafka Consumer",
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this.extensionUri]
            }
        );

        this.panel.webview.html = this.getWebviewContent();

        this.disposables.push(
            this.panel.onDidDispose(() => {
                this.panel = undefined;
                this.activeConsumerUri = undefined;
                this.activeConsumerInfo = undefined;
                this.consumer = undefined;
                this.session = undefined;
                this.clearRenderTimer();
                this.disposeConsumerListeners();
            }),
            this.panel.onDidChangeViewState((event) => {
                if (event.webviewPanel.visible) {
                    this.renderNow();
                }
            }),
            this.consumerCollection.onDidChangeCollection(() => {
                this.handleCollectionChanged();
            }),
            this.panel.webview.onDidReceiveMessage((message: WebviewRequest) => {
                void this.handleWebviewMessage(message);
            })
        );
    }

    private bindConsumer(consumer: Consumer, consumerUri: string): void {
        this.disposeConsumerListeners();

        this.consumer = consumer;
        this.activeConsumerUri = consumerUri;
        this.activeConsumerInfo = extractConsumerInfoUri(consumer.uri);
        this.session = new ConsumerSession(this.getConfiguredBufferSize());
        this.session.setConsumeSettings(this.getConsumeSettingsFromConsumer(consumer));
        this.panel!.title = `Kafka Consumer: ${consumer.options.topicId}`;

        this.consumerDisposables.push(
            consumer.onDidReceiveRecord((event) => {
                this.onRecord(event.record);
            }),
            consumer.onDidReceiveError((error) => {
                this.session?.setError(error);
                this.renderNow();
            })
        );
    }

    private onRecord(record: ConsumedRecord): void {
        if (!this.session) {
            return;
        }

        this.session.addRecord(record);

        const streamState = this.session.getState().streamState;
        if (streamState === "paused") {
            this.sendViewerState();
            this.sendCounts();
            this.sendHistogram();
            return;
        }

        this.scheduleRender();
    }

    private async handleWebviewMessage(message: WebviewRequest): Promise<void> {
        if (!this.session) {
            return;
        }

        switch (message.command) {
            case "StartConsumer":
                await this.startActiveConsumer();
                break;
            case "StopConsumer":
                await this.stopActiveConsumer();
                break;
            case "GetMessages":
                this.session.setPagination(message.page, message.pageSize);
                this.sendMessages();
                this.sendViewerState();
                break;
            case "GetMessagesCount":
                this.sendCounts();
                break;
            case "GetHistogram":
                this.sendHistogram(message.binCount);
                break;
            case "Pause":
                this.session.pause();
                this.sendViewerState();
                break;
            case "Resume":
                this.session.resume();
                this.renderNow();
                break;
            case "SearchMessages":
                this.session.setSearchQuery(message.query || "");
                this.sendMessages();
                this.sendViewerState();
                this.sendCounts();
                this.sendHistogram();
                break;
            case "SetPartitionFilter":
                this.session.setPartitionFilter(message.partitions || []);
                this.sendMessages();
                this.sendViewerState();
                this.sendCounts();
                this.sendHistogram();
                break;
            case "SetTimeRangeFilter":
                this.session.setTimeRangeFilter(message.startMs, message.endMs);
                this.sendMessages();
                this.sendViewerState();
                this.sendCounts();
                this.sendHistogram();
                break;
            case "ClearTimeRangeFilter":
                this.session.setTimeRangeFilter(undefined, undefined);
                this.sendMessages();
                this.sendViewerState();
                this.sendCounts();
                this.sendHistogram();
                break;
            case "ApplyConsumeSettings":
                await this.applyConsumeSettings(message);
                break;
            case "ClearMessages":
                this.session.clear();
                this.sendMessages();
                this.sendViewerState();
                this.sendCounts();
                this.sendHistogram();
                break;
            case "PreviewMessage":
                if (message.messageId === undefined) {
                    return;
                }
                this.sendPreview(message.messageId);
                break;
            case "ExportMessages":
                await this.exportToCSV();
                break;
        }
    }

    private getConsumeSettingsFromConsumer(consumer: Consumer): ConsumerSessionConsumeSettings {
        const uriInfo = extractConsumerInfoUri(consumer.uri);
        const consumeTimestamp = this.formatTimestampForDisplay(consumer.options.fromTimestamp);
        let consumeMode: ConsumerConsumeMode = "latest";
        if (consumeTimestamp.length > 0) {
            consumeMode = "timestamp";
        } else if (consumer.options.fromOffset === "earliest") {
            consumeMode = "earliest";
        }

        return {
            consumeMode,
            consumeTimestamp,
            consumedPartitions: uriInfo.partitions || ""
        };
    }

    private async applyConsumeSettings(message: WebviewRequest): Promise<void> {
        if (!this.session || !this.activeConsumerInfo || !this.activeConsumerUri) {
            return;
        }

        const consumeMode = message.consumeMode || "latest";
        const consumedPartitions = (message.consumedPartitions || "").trim();
        const consumeTimestampInput = (message.consumeTimestamp || "").trim();
        const consumeTimestamp = consumeMode === "timestamp"
            ? this.normalizeTimestampInput(consumeTimestampInput)
            : undefined;

        if (consumeMode === "timestamp" && !consumeTimestamp) {
            vscode.window.showErrorMessage("Invalid timestamp. Use ISO-8601 or epoch milliseconds.");
            return;
        }

        if (consumedPartitions.length > 0) {
            try {
                parsePartitions(consumedPartitions);
            } catch (error) {
                vscode.window.showErrorMessage(`Invalid partitions: ${error instanceof Error ? error.message : error}`);
                return;
            }
        }

        const currentSettings = this.session.getState();
        const nextSettings: ConsumerSessionConsumeSettings = {
            consumeMode,
            consumeTimestamp: consumeMode === "timestamp" ? consumeTimestampInput : "",
            consumedPartitions
        };

        if (
            currentSettings.consumeMode === nextSettings.consumeMode &&
            currentSettings.consumeTimestamp === nextSettings.consumeTimestamp &&
            currentSettings.consumedPartitions === nextSettings.consumedPartitions
        ) {
            this.session.setConsumeSettings(nextSettings);
            this.sendViewerState();
            return;
        }

        const currentUri = vscode.Uri.parse(this.activeConsumerUri);
        const currentInfo = this.activeConsumerInfo;
        const nextInfo = {
            ...currentInfo,
            fromOffset: consumeMode === "earliest" ? "earliest" : "latest",
            fromTimestamp: consumeMode === "timestamp" ? consumeTimestamp : undefined,
            partitions: consumedPartitions.length > 0 ? consumedPartitions : undefined
        };
        const nextUri = createConsumerUri(nextInfo);

        try {
            this.activeConsumerInfo = nextInfo;
            this.activeConsumerUri = nextUri.toString();
            this.session?.resetForConsumeSettings(nextSettings);

            if (this.consumer) {
                await this.consumerCollection.close(currentUri);
                this.consumer = undefined;
                const nextConsumer = await this.consumerCollection.create(nextUri);
                if (this.consumer === undefined) {
                    this.bindConsumer(nextConsumer, nextUri.toString());
                }
            }

            this.sendConsumerInfo();
            this.renderNow();
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to apply consume settings: ${error}`);
        }
    }

    private handleCollectionChanged(): void {
        if (!this.activeConsumerUri) {
            return;
        }

        const activeUri = vscode.Uri.parse(this.activeConsumerUri);
        const activeConsumer = this.consumerCollection.get(activeUri);

        if (!activeConsumer && this.consumer) {
            this.disposeConsumerListeners();
            this.consumer = undefined;
            this.sendConsumerInfo();
            this.sendViewerState();
            return;
        }

        if (activeConsumer && !this.consumer) {
            this.bindConsumer(activeConsumer, this.activeConsumerUri);
            this.sendConsumerInfo();
            this.renderNow();
            return;
        }

        this.sendConsumerInfo();
    }

    private async startActiveConsumer(): Promise<void> {
        if (!this.activeConsumerInfo || !this.activeConsumerUri || this.consumer) {
            return;
        }

        const nextUri = createConsumerUri(this.activeConsumerInfo);
        this.lifecycleAction = "starting";
        this.sendConsumerInfo();

        try {
            const nextConsumer = await this.consumerCollection.create(nextUri);
            if (this.consumer === undefined) {
                this.bindConsumer(nextConsumer, nextUri.toString());
            }
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to start consumer: ${error}`);
        } finally {
            this.lifecycleAction = undefined;
            this.sendConsumerInfo();
            this.renderNow();
        }
    }

    private async stopActiveConsumer(): Promise<void> {
        if (!this.activeConsumerUri || !this.consumer) {
            return;
        }

        const currentUri = vscode.Uri.parse(this.activeConsumerUri);
        this.lifecycleAction = "stopping";
        this.sendConsumerInfo();
        try {
            await this.consumerCollection.close(currentUri);
            this.disposeConsumerListeners();
            this.consumer = undefined;
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to stop consumer: ${error}`);
        } finally {
            this.lifecycleAction = undefined;
            this.sendConsumerInfo();
            this.sendViewerState();
        }
    }

    private normalizeTimestampInput(value: string): string | undefined {
        if (!value) {
            return undefined;
        }

        if (/^\\d+$/.test(value)) {
            return value;
        }

        const asDate = Date.parse(value);
        if (Number.isNaN(asDate)) {
            return undefined;
        }
        return String(asDate);
    }

    private formatTimestampForDisplay(value: string | undefined): string {
        if (!value || !/^\\d+$/.test(value)) {
            return value || "";
        }
        const timestamp = Number(value);
        const asDate = new Date(timestamp);
        if (Number.isNaN(asDate.getTime())) {
            return value;
        }
        return asDate.toISOString();
    }

    private scheduleRender(): void {
        if (this.renderTimer) {
            return;
        }

        this.renderTimer = setTimeout(() => {
            this.renderTimer = undefined;
            this.renderNow();
        }, RENDER_THROTTLE_MS);
    }

    private renderNow(): void {
        this.clearRenderTimer();
        this.sendMessages();
        this.sendViewerState();
        this.sendCounts();
        this.sendHistogram();
    }

    private sendConsumerInfo(): void {
        if (!this.panel || !this.activeConsumerInfo) {
            return;
        }

        const activeUri = this.activeConsumerUri ? vscode.Uri.parse(this.activeConsumerUri) : undefined;
        const activeConsumer = activeUri ? this.consumerCollection.get(activeUri) : null;
        const clusterName = this.clusterSettings.get(this.activeConsumerInfo.clusterId)?.name;
        this.panel.webview.postMessage({
            command: "ConsumerInfo",
            data: {
                cluster: clusterName || activeConsumer?.options.bootstrap || this.activeConsumerInfo.clusterId,
                bootstrap: activeConsumer?.options.bootstrap || "",
                consumerGroupId: this.activeConsumerInfo.consumerGroupId,
                topic: this.activeConsumerInfo.topicId,
                fromOffset: this.activeConsumerInfo.fromOffset,
                fromTimestamp: this.activeConsumerInfo.fromTimestamp,
                partitions: this.activeConsumerInfo.partitions,
                running: activeConsumer !== null,
                lifecycleAction: this.lifecycleAction
            }
        });
    }

    private sendMessages(): void {
        if (!this.panel || !this.session) {
            return;
        }

        const page = this.session.getMessages();
        this.panel.webview.postMessage({
            command: "Messages",
            data: page
        });
    }

    private sendViewerState(): void {
        if (!this.panel || !this.session) {
            return;
        }

        this.panel.webview.postMessage({
            command: "ViewerState",
            data: this.session.getState()
        });
    }

    private sendCounts(): void {
        if (!this.panel || !this.session) {
            return;
        }

        this.panel.webview.postMessage({
            command: "MessagesCount",
            data: this.session.getCounts()
        });
    }

    private sendHistogram(binCount?: number): void {
        if (!this.panel || !this.session) {
            return;
        }

        this.panel.webview.postMessage({
            command: "Histogram",
            data: this.session.getHistogram(binCount)
        });
    }

    private sendPreview(messageId: number): void {
        if (!this.panel || !this.session) {
            return;
        }

        const preview = this.session.getPreviewMessage(messageId);
        this.panel.webview.postMessage({
            command: "PreviewMessage",
            data: preview
                ? { found: true, message: preview }
                : { found: false }
        });
    }

    private async exportToCSV(): Promise<void> {
        if (!this.session) {
            return;
        }

        const messages = this.session.getExportMessages();
        if (messages.length === 0) {
            vscode.window.showWarningMessage("No messages to export");
            return;
        }

        const csvFilesFilter = "CSV Files";
        const allFilesFilter = "All Files";
        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`kafka-messages-${Date.now()}.csv`),
            filters: {
                [csvFilesFilter]: ["csv"],
                [allFilesFilter]: ["*"]
            }
        });

        if (!uri) {
            return;
        }

        const csv = this.toCsv(messages);
        try {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(csv, "utf-8"));
            vscode.window.showInformationMessage(`Exported ${messages.length} messages to ${uri.fsPath}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export messages: ${error}`);
        }
    }

    private toCsv(messages: ConsumerSessionMessage[]): string {
        const header = ["Timestamp", "Key", "Partition", "Offset", "Value", "Headers"];
        const rows = messages.map((message) => [
            this.escapeCsv(message.timestamp),
            this.escapeCsv(message.key),
            this.escapeCsv(message.partition),
            this.escapeCsv(message.offset),
            this.escapeCsv(message.value),
            this.escapeCsv(message.headers)
        ]);
        return [header.join(","), ...rows.map((row) => row.join(","))].join("\n");
    }

    private escapeCsv(value: string): string {
        if (value.includes(",") || value.includes("\"") || value.includes("\n")) {
            return `"${value.replace(/\"/g, '""')}"`;
        }
        return value;
    }

    private getConfiguredBufferSize(): number {
        const configured = this.workspaceSettings.consumerMessageViewerMaxBufferSize;
        if (!Number.isFinite(configured) || configured < 1) {
            return DEFAULT_BUFFER_SIZE;
        }
        return Math.floor(configured);
    }

    private clearRenderTimer(): void {
        if (!this.renderTimer) {
            return;
        }
        clearTimeout(this.renderTimer);
        this.renderTimer = undefined;
    }

    private disposeConsumerListeners(): void {
        this.consumerDisposables.forEach((disposable) => disposable.dispose());
        this.consumerDisposables = [];
    }

    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kafka Message Viewer</title>
    <style>
        :root {
            --border: var(--vscode-panel-border);
            --bg: var(--vscode-editor-background);
            --fg: var(--vscode-foreground);
            --muted: var(--vscode-descriptionForeground);
            --btn-bg: var(--vscode-button-background);
            --btn-fg: var(--vscode-button-foreground);
            --btn-hover: var(--vscode-button-hoverBackground);
            --input-bg: var(--vscode-input-background);
            --input-fg: var(--vscode-input-foreground);
            --hist-total: var(--vscode-editorLineNumber-foreground);
            --hist-filtered: var(--vscode-charts-blue);
            --hist-selection: var(--vscode-editor-selectionBackground);
            --hist-selection-border: var(--vscode-focusBorder);
        }

        body {
            margin: 0;
            color: var(--fg);
            background: var(--bg);
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
        }

        .header {
            border-bottom: 1px solid var(--border);
            padding: 10px;
            display: flex;
            flex-direction: column;
            gap: 10px;
            position: sticky;
            top: 0;
            background: var(--bg);
            z-index: 100;
        }

        .metadata {
            display: flex;
            flex-wrap: wrap;
            gap: 12px;
            color: var(--muted);
            font-size: 12px;
        }

        .controls {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
        }

        .controls .section {
            display: inline-flex;
            align-items: center;
            gap: 6px;
        }

        .controls input,
        .controls select {
            background: var(--input-bg);
            color: var(--input-fg);
            border: 1px solid var(--border);
            border-radius: 3px;
            padding: 4px 8px;
            min-width: 160px;
        }

        #partitionFilter {
            min-width: 120px;
            min-height: 84px;
            padding: 4px;
        }

        button {
            border: none;
            border-radius: 3px;
            background: var(--btn-bg);
            color: var(--btn-fg);
            padding: 5px 12px;
            cursor: pointer;
        }

        button:hover {
            background: var(--btn-hover);
        }

        button:disabled {
            opacity: 0.5;
            cursor: default;
        }

        .table-wrap {
            overflow: auto;
            height: calc(100vh - 340px);
        }

        .histogram-wrap {
            border-top: 1px solid var(--border);
            border-bottom: 1px solid var(--border);
            padding: 8px 10px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .histogram-header {
            display: flex;
            align-items: center;
            gap: 10px;
        }

        #timeRangeLabel {
            flex: 1;
        }

        #histogramCanvas {
            width: 100%;
            height: 84px;
            border: 1px solid var(--border);
            background: var(--vscode-editorWidget-background);
        }

        table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }

        th,
        td {
            border: 1px solid var(--border);
            padding: 6px 8px;
            text-align: left;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        th {
            position: sticky;
            top: 0;
            background: var(--vscode-editor-inactiveSelectionBackground);
            z-index: 2;
        }

        tbody tr:hover {
            background: var(--vscode-list-hoverBackground);
            cursor: pointer;
        }

        .empty {
            text-align: center;
            color: var(--muted);
            padding: 28px;
        }

        .pagination {
            margin-left: auto;
            display: inline-flex;
            gap: 6px;
            align-items: center;
        }

        .status {
            color: var(--muted);
            font-size: 12px;
        }

        .preview {
            border-top: 1px solid var(--border);
            padding: 10px;
            height: 180px;
            overflow: auto;
            background: var(--vscode-editorWidget-background);
        }

        pre {
            margin: 0;
            white-space: pre-wrap;
            word-break: break-word;
            font-family: var(--vscode-editor-font-family);
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="metadata">
            <span id="cluster"></span>
            <span id="topic"></span>
            <span id="group"></span>
            <span id="counts"></span>
            <span id="status" class="status"></span>
        </div>
        <div class="controls">
            <input id="search" type="text" placeholder="Search key, value, headers" />
            <button id="startStop">Stop Consumer</button>
            <button id="pauseResume">Pause</button>
            <button id="clear">Clear</button>
            <button id="export">Export CSV</button>
            <label for="pageSize">Page size</label>
            <select id="pageSize">
                <option value="50">50</option>
                <option value="100" selected>100</option>
                <option value="250">250</option>
                <option value="500">500</option>
            </select>
            <div class="pagination">
                <button id="prev">Prev</button>
                <span id="pageInfo"></span>
                <button id="next">Next</button>
            </div>
        </div>
        <div class="controls">
            <div class="section">
                <label for="consumeMode">Consume mode</label>
                <select id="consumeMode">
                    <option value="latest">Latest</option>
                    <option value="earliest">From beginning</option>
                    <option value="timestamp">From timestamp</option>
                </select>
                <input id="consumeTimestamp" type="text" placeholder="ISO-8601 or epoch ms" />
            </div>
            <div class="section">
                <label for="consumedPartitions">Consumed partitions</label>
                <input id="consumedPartitions" type="text" placeholder="all or e.g. 0,2-4" />
                <button id="applyConsumeSettings">Apply</button>
            </div>
            <div class="section">
                <label for="partitionFilter">Filtered partitions</label>
                <select id="partitionFilter" multiple></select>
            </div>
        </div>
    </div>
    <div class="histogram-wrap">
        <div class="histogram-header">
            <strong>Time Range</strong>
            <span id="timeRangeLabel" class="status">All buffered messages</span>
            <button id="clearTimeRange" disabled>Clear Range</button>
        </div>
        <canvas id="histogramCanvas" aria-label="Message timestamp histogram"></canvas>
    </div>
    <div class="table-wrap">
        <table>
            <thead>
                <tr>
                    <th style="width: 16%">Timestamp</th>
                    <th style="width: 14%">Key</th>
                    <th style="width: 8%">Partition</th>
                    <th style="width: 10%">Offset</th>
                    <th style="width: 36%">Value</th>
                    <th style="width: 16%">Headers</th>
                </tr>
            </thead>
            <tbody id="rows">
                <tr><td colspan="6" class="empty">Waiting for messages...</td></tr>
            </tbody>
        </table>
    </div>
    <div class="preview">
        <pre id="preview">Select a message row to preview.</pre>
    </div>

    <script>
        const vscode = acquireVsCodeApi();
        const HISTOGRAM_BIN_COUNT = 60;

        const rowsEl = document.getElementById("rows");
        const searchEl = document.getElementById("search");
        const startStopEl = document.getElementById("startStop");
        const pauseResumeEl = document.getElementById("pauseResume");
        const clearEl = document.getElementById("clear");
        const exportEl = document.getElementById("export");
        const prevEl = document.getElementById("prev");
        const nextEl = document.getElementById("next");
        const pageInfoEl = document.getElementById("pageInfo");
        const pageSizeEl = document.getElementById("pageSize");
        const countsEl = document.getElementById("counts");
        const statusEl = document.getElementById("status");
        const previewEl = document.getElementById("preview");
        const consumeModeEl = document.getElementById("consumeMode");
        const consumeTimestampEl = document.getElementById("consumeTimestamp");
        const consumedPartitionsEl = document.getElementById("consumedPartitions");
        const applyConsumeSettingsEl = document.getElementById("applyConsumeSettings");
        const partitionFilterEl = document.getElementById("partitionFilter");
        const histogramCanvasEl = document.getElementById("histogramCanvas");
        const timeRangeLabelEl = document.getElementById("timeRangeLabel");
        const clearTimeRangeEl = document.getElementById("clearTimeRange");

        let state = {
            streamState: "running",
            page: 1,
            pageSize: 100,
            totalPages: 1,
            totalMessages: 0,
            filteredMessages: 0,
            filteredBeforeTimeRange: 0,
            maxBufferSize: 0,
            searchQuery: "",
            availablePartitions: [],
            selectedFilterPartitions: [],
            consumeMode: "latest",
            consumeTimestamp: "",
            consumedPartitions: "",
            timeRangeStartMs: undefined,
            timeRangeEndMs: undefined,
            consumerRunning: true,
            lifecycleAction: undefined
        };
        let histogram = {
            bins: [],
            minTimestampMs: undefined,
            maxTimestampMs: undefined
        };
        let searchDebounce;
        let brushStartX;
        let brushCurrentX;
        let brushing = false;

        function post(command, payload = {}) {
            vscode.postMessage({ command, ...payload });
        }

        function requestPage(page) {
            post("GetMessages", { page, pageSize: Number(pageSizeEl.value) });
        }

        function renderRows(messages) {
            if (!messages.length) {
                rowsEl.innerHTML = '<tr><td colspan="6" class="empty">No messages for current filters.</td></tr>';
                return;
            }

            rowsEl.innerHTML = "";
            for (const message of messages) {
                const row = document.createElement("tr");
                row.dataset.messageId = String(message.id);
                row.innerHTML = [
                    message.timestamp,
                    message.key,
                    message.partition,
                    message.offset,
                    message.value,
                    message.headers
                ].map((value) => "<td>" + escapeHtml(value) + "</td>").join("");
                row.addEventListener("click", () => {
                    post("PreviewMessage", { messageId: message.id });
                });
                rowsEl.appendChild(row);
            }
        }

        function renderPartitionFilter() {
            const selected = new Set(state.selectedFilterPartitions || []);
            const availablePartitions = state.availablePartitions || [];

            partitionFilterEl.innerHTML = "";
            for (const partition of availablePartitions) {
                const option = document.createElement("option");
                option.value = partition;
                option.textContent = partition;
                option.selected = selected.has(partition);
                partitionFilterEl.appendChild(option);
            }
        }

        function updateConsumeInputs() {
            consumeModeEl.value = state.consumeMode || "latest";
            consumeTimestampEl.value = state.consumeTimestamp || "";
            consumedPartitionsEl.value = state.consumedPartitions || "";
            consumeTimestampEl.disabled = consumeModeEl.value !== "timestamp";
        }

        function formatTime(value) {
            const asNumber = Number(value);
            if (!Number.isFinite(asNumber)) {
                return "";
            }
            const date = new Date(asNumber);
            if (Number.isNaN(date.getTime())) {
                return String(value);
            }
            return date.toISOString();
        }

        function hasTimeRangeFilter() {
            return Number.isFinite(state.timeRangeStartMs) && Number.isFinite(state.timeRangeEndMs);
        }

        function updateTimeRangeLabel() {
            if (!hasTimeRangeFilter()) {
                timeRangeLabelEl.textContent = "All buffered messages";
                clearTimeRangeEl.disabled = true;
                return;
            }

            const start = formatTime(state.timeRangeStartMs);
            const end = formatTime(state.timeRangeEndMs);
            timeRangeLabelEl.textContent = "From " + start + " to " + end;
            clearTimeRangeEl.disabled = false;
        }

        function getCanvasSize() {
            const rect = histogramCanvasEl.getBoundingClientRect();
            const width = Math.max(1, Math.floor(rect.width));
            const height = Math.max(1, Math.floor(rect.height));
            return { width, height };
        }

        function getHistogramRange() {
            if (!Number.isFinite(histogram.minTimestampMs) || !Number.isFinite(histogram.maxTimestampMs)) {
                return undefined;
            }
            return {
                minTimestampMs: Number(histogram.minTimestampMs),
                maxTimestampMs: Number(histogram.maxTimestampMs)
            };
        }

        function clamp(value, min, max) {
            return Math.min(Math.max(value, min), max);
        }

        function getSelectionPixels(width) {
            if (brushing && Number.isFinite(brushStartX) && Number.isFinite(brushCurrentX)) {
                return {
                    left: clamp(Math.min(brushStartX, brushCurrentX), 0, width),
                    right: clamp(Math.max(brushStartX, brushCurrentX), 0, width)
                };
            }

            if (!hasTimeRangeFilter()) {
                return undefined;
            }

            const range = getHistogramRange();
            if (!range) {
                return undefined;
            }

            const span = Math.max(1, range.maxTimestampMs - range.minTimestampMs);
            const start = clamp((state.timeRangeStartMs - range.minTimestampMs) / span, 0, 1);
            const end = clamp((state.timeRangeEndMs - range.minTimestampMs) / span, 0, 1);
            return {
                left: Math.floor(Math.min(start, end) * width),
                right: Math.ceil(Math.max(start, end) * width)
            };
        }

        function renderHistogram() {
            const context = histogramCanvasEl.getContext("2d");
            if (!context) {
                return;
            }

            const size = getCanvasSize();
            const dpr = window.devicePixelRatio || 1;
            const targetWidth = Math.floor(size.width * dpr);
            const targetHeight = Math.floor(size.height * dpr);
            if (histogramCanvasEl.width !== targetWidth || histogramCanvasEl.height !== targetHeight) {
                histogramCanvasEl.width = targetWidth;
                histogramCanvasEl.height = targetHeight;
            }

            context.setTransform(dpr, 0, 0, dpr, 0, 0);
            context.clearRect(0, 0, size.width, size.height);

            const bins = Array.isArray(histogram.bins) ? histogram.bins : [];
            if (!bins.length) {
                context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--muted");
                context.font = "12px " + getComputedStyle(document.body).fontFamily;
                context.fillText("No buffered messages yet", 10, Math.max(18, Math.floor(size.height / 2)));
                return;
            }

            const style = getComputedStyle(document.documentElement);
            const totalColor = style.getPropertyValue("--hist-total");
            const filteredColor = style.getPropertyValue("--hist-filtered");
            const selectionColor = style.getPropertyValue("--hist-selection");
            const selectionBorderColor = style.getPropertyValue("--hist-selection-border");

            const maxTotal = Math.max(1, ...bins.map((bin) => Number(bin.totalCount) || 0));
            const maxFiltered = Math.max(1, ...bins.map((bin) => Number(bin.filteredCount) || 0));
            const binWidth = size.width / bins.length;

            for (let i = 0; i < bins.length; i++) {
                const bin = bins[i];
                const x = Math.floor(i * binWidth);
                const width = Math.max(1, Math.ceil(((i + 1) * binWidth) - x) - 1);
                const totalHeight = Math.round(((Number(bin.totalCount) || 0) / maxTotal) * size.height);
                const filteredHeight = Math.round(((Number(bin.filteredCount) || 0) / maxFiltered) * size.height);

                context.fillStyle = totalColor;
                context.globalAlpha = 0.4;
                context.fillRect(x, size.height - totalHeight, width, totalHeight);

                context.fillStyle = filteredColor;
                context.globalAlpha = 0.9;
                context.fillRect(x, size.height - filteredHeight, width, filteredHeight);
            }

            context.globalAlpha = 1;
            const selection = getSelectionPixels(size.width);
            if (selection && selection.right > selection.left) {
                context.fillStyle = selectionColor;
                context.globalAlpha = 0.35;
                context.fillRect(selection.left, 0, selection.right - selection.left, size.height);
                context.globalAlpha = 1;
                context.strokeStyle = selectionBorderColor;
                context.strokeRect(selection.left + 0.5, 0.5, Math.max(1, selection.right - selection.left - 1), Math.max(1, size.height - 1));
            }
        }

        function getRelativeX(event) {
            const rect = histogramCanvasEl.getBoundingClientRect();
            return clamp(event.clientX - rect.left, 0, rect.width);
        }

        function applyBrushSelection() {
            const range = getHistogramRange();
            const size = getCanvasSize();
            if (!range || !Number.isFinite(brushStartX) || !Number.isFinite(brushCurrentX) || size.width <= 0) {
                return;
            }

            const left = Math.min(brushStartX, brushCurrentX);
            const right = Math.max(brushStartX, brushCurrentX);
            if (Math.abs(right - left) < 2) {
                return;
            }

            const span = Math.max(1, range.maxTimestampMs - range.minTimestampMs);
            const startMs = Math.floor(range.minTimestampMs + ((left / size.width) * span));
            const endMs = Math.ceil(range.minTimestampMs + ((right / size.width) * span));
            post("SetTimeRangeFilter", { startMs, endMs });
        }

        function updateStatus() {
            const lifecycleInProgress = state.lifecycleAction === "starting" || state.lifecycleAction === "stopping";
            pageInfoEl.textContent = "Page " + state.page + " / " + state.totalPages;
            prevEl.disabled = state.page <= 1;
            nextEl.disabled = state.page >= state.totalPages;
            startStopEl.textContent = state.consumerRunning ? "Stop Consumer" : "Start Consumer";
            if (state.lifecycleAction === "starting") {
                startStopEl.textContent = "Starting...";
            } else if (state.lifecycleAction === "stopping") {
                startStopEl.textContent = "Stopping...";
            }
            startStopEl.disabled = lifecycleInProgress;
            pauseResumeEl.disabled = !state.consumerRunning || lifecycleInProgress;
            pauseResumeEl.textContent = state.streamState === "paused" ? "Resume" : "Pause";

            const total = state.totalMessages || 0;
            const filtered = state.filteredMessages || 0;
            const filteredBeforeTimeRange = state.filteredBeforeTimeRange || 0;
            const buffer = state.maxBufferSize || 0;
            if (hasTimeRangeFilter()) {
                countsEl.textContent = "Messages: " + filtered + "/" + total + " (time range " + filtered + "/" + filteredBeforeTimeRange + ", buffer " + buffer + ")";
            } else {
                countsEl.textContent = "Messages: " + filtered + "/" + total + " (buffer " + buffer + ")";
            }

            if (state.lifecycleAction === "starting") {
                statusEl.textContent = "Starting consumer...";
            } else if (state.lifecycleAction === "stopping") {
                statusEl.textContent = "Stopping consumer...";
            } else if (!state.consumerRunning) {
                statusEl.textContent = "Stopped";
            } else if (state.streamState === "error") {
                statusEl.textContent = "Error: " + (state.error || "unknown");
            } else {
                statusEl.textContent = state.streamState === "paused" ? "Paused" : "Running";
            }
        }

        function escapeHtml(value) {
            return String(value)
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/\"/g, "&quot;")
                .replace(/'/g, "&#039;");
        }

        window.addEventListener("message", (event) => {
            const message = event.data;

            switch (message.command) {
                case "ConsumerInfo": {
                    document.getElementById("cluster").textContent = "Cluster: " + message.data.cluster;
                    document.getElementById("topic").textContent = "Topic: " + message.data.topic;
                    document.getElementById("group").textContent = "Group: " + message.data.consumerGroupId;
                    state.consumerRunning = Boolean(message.data.running);
                    state.lifecycleAction = message.data.lifecycleAction;
                    updateStatus();
                    break;
                }
                case "Messages": {
                    state.page = message.data.page;
                    state.pageSize = message.data.pageSize;
                    state.totalPages = message.data.totalPages;
                    renderRows(message.data.messages);
                    updateStatus();
                    break;
                }
                case "ViewerState": {
                    state = { ...state, ...message.data };
                    if (searchEl.value !== state.searchQuery) {
                        searchEl.value = state.searchQuery || "";
                    }
                    pageSizeEl.value = String(state.pageSize || 100);
                    renderPartitionFilter();
                    updateConsumeInputs();
                    updateTimeRangeLabel();
                    updateStatus();
                    renderHistogram();
                    break;
                }
                case "MessagesCount": {
                    state.totalMessages = message.data.total;
                    state.filteredMessages = message.data.filtered;
                    state.filteredBeforeTimeRange = message.data.filteredBeforeTimeRange;
                    updateStatus();
                    break;
                }
                case "Histogram": {
                    histogram = {
                        bins: message.data.bins || [],
                        minTimestampMs: message.data.minTimestampMs,
                        maxTimestampMs: message.data.maxTimestampMs
                    };
                    renderHistogram();
                    break;
                }
                case "PreviewMessage": {
                    if (!message.data || !message.data.found) {
                        previewEl.textContent = "Message not found.";
                        break;
                    }
                    previewEl.textContent = JSON.stringify(message.data.message, null, 2);
                    break;
                }
            }
        });

        searchEl.addEventListener("input", () => {
            clearTimeout(searchDebounce);
            searchDebounce = setTimeout(() => {
                post("SearchMessages", { query: searchEl.value });
            }, 180);
        });

        pauseResumeEl.addEventListener("click", () => {
            const command = state.streamState === "paused" ? "Resume" : "Pause";
            post(command);
        });

        startStopEl.addEventListener("click", () => {
            post(state.consumerRunning ? "StopConsumer" : "StartConsumer");
        });

        clearEl.addEventListener("click", () => {
            post("ClearMessages");
            previewEl.textContent = "Select a message row to preview.";
        });

        exportEl.addEventListener("click", () => {
            post("ExportMessages");
        });

        prevEl.addEventListener("click", () => {
            requestPage(Math.max(1, state.page - 1));
        });

        nextEl.addEventListener("click", () => {
            requestPage(Math.min(state.totalPages, state.page + 1));
        });

        pageSizeEl.addEventListener("change", () => {
            requestPage(1);
        });

        partitionFilterEl.addEventListener("change", () => {
            const partitions = Array.from(partitionFilterEl.selectedOptions).map((option) => option.value);
            post("SetPartitionFilter", { partitions });
        });

        histogramCanvasEl.addEventListener("mousedown", (event) => {
            if (!Array.isArray(histogram.bins) || histogram.bins.length === 0) {
                return;
            }
            brushing = true;
            brushStartX = getRelativeX(event);
            brushCurrentX = brushStartX;
            renderHistogram();
        });

        histogramCanvasEl.addEventListener("mousemove", (event) => {
            if (!brushing) {
                return;
            }
            brushCurrentX = getRelativeX(event);
            renderHistogram();
        });

        window.addEventListener("mouseup", () => {
            if (!brushing) {
                return;
            }
            brushing = false;
            applyBrushSelection();
            brushStartX = undefined;
            brushCurrentX = undefined;
            renderHistogram();
        });

        clearTimeRangeEl.addEventListener("click", () => {
            post("ClearTimeRangeFilter");
        });

        consumeModeEl.addEventListener("change", () => {
            consumeTimestampEl.disabled = consumeModeEl.value !== "timestamp";
        });

        applyConsumeSettingsEl.addEventListener("click", () => {
            post("ApplyConsumeSettings", {
                consumeMode: consumeModeEl.value,
                consumeTimestamp: consumeTimestampEl.value,
                consumedPartitions: consumedPartitionsEl.value
            });
            previewEl.textContent = "Select a message row to preview.";
        });

        window.addEventListener("resize", () => {
            renderHistogram();
        });

        post("GetMessagesCount");
        post("GetHistogram", { binCount: HISTOGRAM_BIN_COUNT });
        requestPage(1);
    </script>
</body>
</html>`;
    }

    public dispose(): void {
        this.clearRenderTimer();
        this.disposeConsumerListeners();
        if (this.panel) {
            this.panel.dispose();
        }
        this.disposables.forEach((disposable) => disposable.dispose());
        this.disposables = [];
    }
}
