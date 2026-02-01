import * as vscode from "vscode";
import { ConsumedRecord, Consumer, ConsumerCollection } from "../client";
import { ClusterSettings } from "../settings/clusters";

/**
 * Provides a table view for consumed Kafka messages.
 * Displays messages in an Excel-like table format with columns for Key, Partition, Offset, Value, and Headers.
 */
export class ConsumerTableViewProvider implements vscode.Disposable {
    private panel: vscode.WebviewPanel | undefined;
    private disposables: vscode.Disposable[] = [];
    private messages: ConsumedRecord[] = [];
    private consumer: Consumer | undefined;

    constructor(
        private readonly extensionUri: vscode.Uri,
        private consumerCollection: ConsumerCollection,
        private clusterSettings: ClusterSettings
    ) {}

    /**
     * Opens or reveals the table view for a consumer URI.
     */
    public async show(consumerUri: vscode.Uri): Promise<void> {
        const consumer = this.consumerCollection.get(consumerUri);
        
        if (!consumer) {
            vscode.window.showErrorMessage('Consumer not found');
            return;
        }
        
        this.consumer = consumer;

        // If panel already exists, reveal it
        if (this.panel) {
            this.panel.reveal(vscode.ViewColumn.Beside);
            return;
        }

        // Create and show a new webview panel
        this.panel = vscode.window.createWebviewPanel(
            'kafkaConsumerTable',
            `Kafka Consumer: ${this.consumer.options.topicId}`,
            vscode.ViewColumn.Beside,
            {
                enableScripts: true,
                retainContextWhenHidden: true,
                localResourceRoots: [this.extensionUri]
            }
        );

        // Set the HTML content
        this.panel.webview.html = this.getWebviewContent();

        // Listen for when the panel is disposed
        this.panel.onDidDispose(() => {
            this.panel = undefined;
            this.messages = [];
        }, null, this.disposables);

        // Handle messages from the webview
        this.panel.webview.onDidReceiveMessage(
            message => {
                switch (message.command) {
                    case 'clear':
                        this.messages = [];
                        this.panel?.webview.postMessage({ command: 'clear' });
                        break;
                    case 'export':
                        this.exportToCSV();
                        break;
                }
            },
            null,
            this.disposables
        );

        // Subscribe to consumer messages
        if (this.consumer) {
            this.disposables.push(
                this.consumer.onDidReceiveRecord(e => {
                    this.onMessageReceived(e.record);
                })
            );

            // Send consumer info
            this.sendConsumerInfo();
        }
    }

    /**
     * Sends consumer configuration information to the webview.
     */
    private sendConsumerInfo(): void {
        if (!this.consumer || !this.panel) {
            return;
        }

        const clusterName = this.clusterSettings.get(this.consumer.clusterId)?.name;
        const info = {
            cluster: clusterName || this.consumer.options.bootstrap,
            bootstrap: this.consumer.options.bootstrap,
            consumerGroupId: this.consumer.options.consumerGroupId,
            topic: this.consumer.options.topicId,
            fromOffset: this.consumer.options.fromOffset,
            partitions: this.consumer.options.partitions
        };

        this.panel.webview.postMessage({ command: 'consumerInfo', data: info });
    }

    /**
     * Called when a new message is received from the consumer.
     */
    private onMessageReceived(record: ConsumedRecord): void {
        if (!this.panel) {
            return;
        }

        // Add message to collection
        this.messages.push(record);

        // Send message to webview
        this.panel.webview.postMessage({ 
            command: 'newMessage', 
            data: this.formatRecord(record) 
        });
    }

    /**
     * Formats a consumed record for display in the table.
     */
    private formatRecord(record: ConsumedRecord): any {
        return {
            key: this.formatValue(record.key),
            partition: record.partition ?? '',
            offset: record.offset ?? '',
            value: this.formatValue(record.value),
            headers: record.headers ? this.formatHeaders(record.headers) : '',
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Formats a value (key or value) for display.
     */
    private formatValue(value: any): string {
        if (value === null || value === undefined) {
            return '';
        }
        if (typeof value === 'string') {
            return value;
        }
        if (Buffer.isBuffer(value)) {
            return value.toString('utf-8');
        }
        if (typeof value === 'object') {
            return JSON.stringify(value);
        }
        return String(value);
    }

    /**
     * Formats headers for display.
     */
    private formatHeaders(headers: any): string {
        if (!headers) {
            return '';
        }
        const entries = Object.entries(headers).map(([key, value]) => {
            const formattedValue = this.formatValue(value);
            return `${key}: ${formattedValue}`;
        });
        return entries.join(', ');
    }

    /**
     * Exports messages to CSV format.
     */
    private async exportToCSV(): Promise<void> {
        if (this.messages.length === 0) {
            vscode.window.showWarningMessage('No messages to export');
            return;
        }

        const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(`kafka-messages-${Date.now()}.csv`),
            filters: {
                'CSV Files': ['csv'],
                'All Files': ['*']
            }
        });

        if (!uri) {
            return;
        }

        // Create CSV content
        const headers = ['Key', 'Partition', 'Offset', 'Value', 'Headers'];
        const rows = this.messages.map(record => {
            const formatted = this.formatRecord(record);
            return [
                this.escapeCSV(formatted.key),
                formatted.partition,
                formatted.offset,
                this.escapeCSV(formatted.value),
                this.escapeCSV(formatted.headers)
            ];
        });

        const csv = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        try {
            await vscode.workspace.fs.writeFile(uri, Buffer.from(csv, 'utf-8'));
            vscode.window.showInformationMessage(`Exported ${this.messages.length} messages to ${uri.fsPath}`);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to export: ${error}`);
        }
    }

    /**
     * Escapes a value for CSV format.
     */
    private escapeCSV(value: string): string {
        if (value.includes(',') || value.includes('"') || value.includes('\n')) {
            return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
    }

    /**
     * Gets the HTML content for the webview.
     */
    private getWebviewContent(): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Kafka Consumer Table</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            font-size: var(--vscode-font-size);
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
            padding: 0;
            margin: 0;
        }
        
        .header {
            padding: 10px;
            background-color: var(--vscode-editor-background);
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            justify-content: space-between;
            align-items: center;
            position: sticky;
            top: 0;
            z-index: 100;
        }
        
        .info {
            font-size: 0.9em;
            color: var(--vscode-descriptionForeground);
        }
        
        .info-item {
            margin-right: 15px;
            display: inline-block;
        }
        
        .controls {
            display: flex;
            gap: 10px;
        }
        
        button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 5px 12px;
            cursor: pointer;
            border-radius: 2px;
            font-size: 0.9em;
        }
        
        button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        
        button:active {
            background-color: var(--vscode-button-activeBackground);
        }
        
        .table-container {
            overflow: auto;
            height: calc(100vh - 60px);
        }
        
        table {
            width: 100%;
            border-collapse: collapse;
            table-layout: fixed;
        }
        
        th, td {
            padding: 8px;
            text-align: left;
            border: 1px solid var(--vscode-panel-border);
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        
        th {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            position: sticky;
            top: 0;
            z-index: 10;
            font-weight: 600;
            cursor: pointer;
            user-select: none;
        }
        
        th:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        tr:nth-child(even) {
            background-color: var(--vscode-list-inactiveSelectionBackground);
        }
        
        tr:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        
        td {
            max-width: 300px;
        }
        
        td:hover {
            white-space: normal;
            word-wrap: break-word;
        }
        
        .col-key {
            width: 15%;
        }
        
        .col-partition {
            width: 8%;
        }
        
        .col-offset {
            width: 10%;
        }
        
        .col-value {
            width: 50%;
        }
        
        .col-headers {
            width: 17%;
        }
        
        .message-count {
            color: var(--vscode-descriptionForeground);
            font-size: 0.9em;
        }
        
        .empty-state {
            text-align: center;
            padding: 50px;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>
<body>
    <div class="header">
        <div class="info">
            <span class="info-item" id="clusterInfo"></span>
            <span class="info-item" id="topicInfo"></span>
            <span class="info-item" id="consumerGroupInfo"></span>
            <span class="message-count">Messages: <span id="messageCount">0</span></span>
        </div>
        <div class="controls">
            <button id="clearBtn">Clear</button>
            <button id="exportBtn">Export CSV</button>
        </div>
    </div>
    
    <div class="table-container">
        <table id="messageTable">
            <thead>
                <tr>
                    <th class="col-key">Key</th>
                    <th class="col-partition">Partition</th>
                    <th class="col-offset">Offset</th>
                    <th class="col-value">Value</th>
                    <th class="col-headers">Headers</th>
                </tr>
            </thead>
            <tbody id="messageBody">
                <tr class="empty-state">
                    <td colspan="5">Waiting for messages...</td>
                </tr>
            </tbody>
        </table>
    </div>
    
    <script>
        const vscode = acquireVsCodeApi();
        const messageBody = document.getElementById('messageBody');
        const messageCount = document.getElementById('messageCount');
        let messages = [];
        
        // Handle messages from extension
        window.addEventListener('message', event => {
            const message = event.data;
            
            switch (message.command) {
                case 'newMessage':
                    addMessage(message.data);
                    break;
                case 'clear':
                    clearMessages();
                    break;
                case 'consumerInfo':
                    updateConsumerInfo(message.data);
                    break;
            }
        });
        
        function addMessage(data) {
            messages.push(data);
            
            // Remove empty state if present
            const emptyState = messageBody.querySelector('.empty-state');
            if (emptyState) {
                emptyState.remove();
            }
            
            // Add new row
            const row = messageBody.insertRow(0); // Insert at top for newest first
            row.insertCell(0).textContent = data.key;
            row.insertCell(1).textContent = data.partition;
            row.insertCell(2).textContent = data.offset;
            row.insertCell(3).textContent = data.value;
            row.insertCell(4).textContent = data.headers;
            
            // Update count
            messageCount.textContent = messages.length;
        }
        
        function clearMessages() {
            messages = [];
            messageBody.innerHTML = '<tr class="empty-state"><td colspan="5">No messages</td></tr>';
            messageCount.textContent = '0';
        }
        
        function updateConsumerInfo(info) {
            document.getElementById('clusterInfo').textContent = 'Cluster: ' + info.cluster;
            document.getElementById('topicInfo').textContent = 'Topic: ' + info.topic;
            document.getElementById('consumerGroupInfo').textContent = 'Group: ' + info.consumerGroupId;
        }
        
        // Button handlers
        document.getElementById('clearBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'clear' });
        });
        
        document.getElementById('exportBtn').addEventListener('click', () => {
            vscode.postMessage({ command: 'export' });
        });
    </script>
</body>
</html>`;
    }

    public dispose(): void {
        if (this.panel) {
            this.panel.dispose();
        }
        this.disposables.forEach(d => d.dispose());
    }
}
