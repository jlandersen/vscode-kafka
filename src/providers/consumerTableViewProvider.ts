import * as vscode from "vscode";
import { ConsumedRecord, Consumer, ConsumerCollection } from "../client";
import { ClusterSettings } from "../settings/clusters";
import { WorkspaceSettings } from "../settings";
import { ConsumerSession, ConsumerSessionMessage } from "./consumerSession";

const DEFAULT_BUFFER_SIZE = 5000;
const RENDER_THROTTLE_MS = 50;

type WebviewCommand =
    | "GetMessages"
    | "GetMessagesCount"
    | "Pause"
    | "Resume"
    | "SearchMessages"
    | "ClearMessages"
    | "PreviewMessage"
    | "ExportMessages";

interface WebviewRequest {
    command: WebviewCommand;
    page?: number;
    pageSize?: number;
    query?: string;
    messageId?: number;
}

export class ConsumerTableViewProvider implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private consumerDisposables: vscode.Disposable[] = [];
    private session: ConsumerSession | undefined;
    private consumer: Consumer | undefined;
    private activeConsumerUri: string | undefined;
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
            this.panel.webview.onDidReceiveMessage((message: WebviewRequest) => {
                this.handleWebviewMessage(message);
            })
        );
    }

    private bindConsumer(consumer: Consumer, consumerUri: string): void {
        this.disposeConsumerListeners();

        this.consumer = consumer;
        this.activeConsumerUri = consumerUri;
        this.session = new ConsumerSession(this.getConfiguredBufferSize());
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
            return;
        }

        this.scheduleRender();
    }

    private handleWebviewMessage(message: WebviewRequest): void {
        if (!this.session) {
            return;
        }

        switch (message.command) {
            case "GetMessages":
                this.session.setPagination(message.page, message.pageSize);
                this.sendMessages();
                this.sendViewerState();
                break;
            case "GetMessagesCount":
                this.sendCounts();
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
                break;
            case "ClearMessages":
                this.session.clear();
                this.sendMessages();
                this.sendViewerState();
                break;
            case "PreviewMessage":
                if (message.messageId === undefined) {
                    return;
                }
                this.sendPreview(message.messageId);
                break;
            case "ExportMessages":
                this.exportToCSV();
                break;
        }
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
    }

    private sendConsumerInfo(): void {
        if (!this.consumer || !this.panel) {
            return;
        }

        const clusterName = this.clusterSettings.get(this.consumer.clusterId)?.name;
        this.panel.webview.postMessage({
            command: "ConsumerInfo",
            data: {
                cluster: clusterName || this.consumer.options.bootstrap,
                bootstrap: this.consumer.options.bootstrap,
                consumerGroupId: this.consumer.options.consumerGroupId,
                topic: this.consumer.options.topicId,
                fromOffset: this.consumer.options.fromOffset,
                partitions: this.consumer.options.partitions
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

        .controls input,
        .controls select {
            background: var(--input-bg);
            color: var(--input-fg);
            border: 1px solid var(--border);
            border-radius: 3px;
            padding: 4px 8px;
            min-width: 160px;
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
            height: calc(100vh - 140px);
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

        const rowsEl = document.getElementById("rows");
        const searchEl = document.getElementById("search");
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

        let state = {
            streamState: "running",
            page: 1,
            pageSize: 100,
            totalPages: 1,
            totalMessages: 0,
            filteredMessages: 0,
            maxBufferSize: 0,
            searchQuery: ""
        };
        let searchDebounce;

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

        function updateStatus() {
            pageInfoEl.textContent = "Page " + state.page + " / " + state.totalPages;
            prevEl.disabled = state.page <= 1;
            nextEl.disabled = state.page >= state.totalPages;
            pauseResumeEl.textContent = state.streamState === "paused" ? "Resume" : "Pause";

            const total = state.totalMessages || 0;
            const filtered = state.filteredMessages || 0;
            const buffer = state.maxBufferSize || 0;
            countsEl.textContent = "Messages: " + filtered + "/" + total + " (buffer " + buffer + ")";

            if (state.streamState === "error") {
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
                    updateStatus();
                    break;
                }
                case "MessagesCount": {
                    state.totalMessages = message.data.total;
                    state.filteredMessages = message.data.filtered;
                    updateStatus();
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

        post("GetMessagesCount");
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
