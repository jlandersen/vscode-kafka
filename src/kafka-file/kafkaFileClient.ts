import * as vscode from "vscode";
import { ConsumerCollection, ConsumerCollectionChangedEvent, ConsumerLaunchState } from "../client/consumer";
import { ProducerCollection, ProducerCollectionChangedEvent, ProducerLaunchState } from "../client/producer";
import { ClusterSettings } from "../settings/clusters";

import { getLanguageModelCache, LanguageModelCache } from './languageModelCache';
import { KafkaFileDocument } from "./languageservice/parser/kafkaFileParser";
import { ConsumerLaunchStateProvider, getLanguageService, LanguageService, ProducerLaunchStateProvider, SelectedClusterProvider, TopicDetail, TopicProvider } from "./languageservice/kafkaFileLanguageService";
import { runSafeAsync } from "./utils/runner";
import { ThrottledDelayer } from "./utils/async";
import { WorkspaceSettings } from "../settings";
import { ClientAccessor, isVisible, sortTopics, Topic } from "../client";
import { BrokerConfigs } from "../client/config";
import { KafkaModelProvider } from "../explorer/models/kafka";
import { ClusterItem } from "../explorer/models/cluster";
import { handleErrors, InlineCommandActivationCommandHandler } from "../commands";

class ClusterInfo {

    private allTopics?: Topic[];
    private filteredTopics?: TopicDetail[];

    private autoCreateTopicEnabled?: BrokerConfigs.AutoCreateTopicResult;

    constructor(public readonly cluster?: ClusterItem, public readonly error?: any) {
    }
    async getTopics(): Promise<TopicDetail[]> {
        if (!this.filteredTopics) {
            try {
                this.allTopics = await this.loadTopics();
            }
            catch (e) {
                this.allTopics = [];
            }
            const visibleTopics = this.allTopics
                .filter(topic => isVisible(topic));
            this.filteredTopics = sortTopics(visibleTopics);
        }
        return this.filteredTopics;
    }

    private async loadTopics(): Promise<Topic[]> {
        if (this.cluster) {
            const client = await this.cluster.getClient();
            return await client.getTopics();
        }
        return [];
    }

    async getTopic(topicId: string): Promise<TopicDetail | undefined> {
        await this.getTopics();
        const topics = this.allTopics;
        return topics?.find(topic => topic.id === topicId);
    }

    async getAutoCreateTopicEnabled(): Promise<BrokerConfigs.AutoCreateTopicResult> {
        if (this.autoCreateTopicEnabled !== undefined) {
            return this.autoCreateTopicEnabled;
        }
        this.autoCreateTopicEnabled = await this.loadAutoCreateTopicEnabled();
        return this.autoCreateTopicEnabled;
    }

    private async loadAutoCreateTopicEnabled(): Promise<BrokerConfigs.AutoCreateTopicResult> {
        if (this.cluster) {
            const client = await this.cluster.getClient();
            return await BrokerConfigs.getAutoCreateTopicEnabled(client);
        }
        return { type: "unknown" };
    }
}

class DataModelTopicProvider implements TopicProvider {

    private cache = new Map<string /* cluster id */, ClusterInfo>();

    constructor(private modelProvider: KafkaModelProvider) {
        // evict the cache when Kafka explorer is refreshed
        this.modelProvider.onDidChangeDataModel(() => this.cache.clear());
    }
    async getTopics(clusterId: string): Promise<TopicDetail[]> {
        const info = await this.getClusterInfo(clusterId);
        return info ? info.getTopics() : [];
    }

    async getTopic(clusterId: string, topicId: string): Promise<TopicDetail | undefined> {
        const info = await this.getClusterInfo(clusterId);
        return info?.getTopic(topicId);
    }

    async getAutoCreateTopicEnabled(clusterId: string): Promise<BrokerConfigs.AutoCreateTopicResult> {
        const info = await this.getClusterInfo(clusterId);
        return info ? info.getAutoCreateTopicEnabled() : { type: "unknown" };
    }

    private async getClusterInfo(clusterId: string): Promise<ClusterInfo | undefined> {
        let info = this.cache.get(clusterId);
        if (!info) {
            try {
                const model = this.modelProvider.getDataModel();
                const cluster = await model.findClusterItemById(clusterId);
                if (cluster) {
                    info = new ClusterInfo(cluster);
                    this.cache.set(clusterId, info);
                    return info;
                }
            }
            catch (e) {
                info = new ClusterInfo(undefined, e);
                this.cache.set(clusterId, info);
                return info;
            }
        }
        return info;
    }
}

export function startLanguageClient(
    clusterSettings: ClusterSettings,
    clientAccessor: ClientAccessor,
    workspaceSettings: WorkspaceSettings,
    producerCollection: ProducerCollection,
    consumerCollection: ConsumerCollection,
    modelProvider: KafkaModelProvider,
    context: vscode.ExtensionContext
): vscode.Disposable {

    // Create cache for opened text document and AST
    const openedDocuments = new Map<string, vscode.TextDocument>();
    const kafkaFileDocuments = getLanguageModelCache<KafkaFileDocument>(10, 60, document => languageService.parseKafkaFileDocument(document));

    // Create the Kafka file language service.
    const languageService = createLanguageService(clusterSettings, clientAccessor, producerCollection, consumerCollection, modelProvider);

    const documentSelector = [
        { language: "kafka", scheme: "file" },
        { language: "kafka", scheme: "untitled" },
        { language: "kafka", scheme: "kafka" },
    ];

    // Inline activation
    const inlineActivationProvider = new InlineCommandActivationCommandHandler(kafkaFileDocuments, languageService);
    context.subscriptions.push(vscode.commands.registerCommand(InlineCommandActivationCommandHandler.commandId,
        handleErrors(async () => inlineActivationProvider.execute())));

    // Code Lenses
    const codeLensProvider = new KafkaFileCodeLensProvider(kafkaFileDocuments, languageService);
    context.subscriptions.push(
        vscode.languages.registerCodeLensProvider(documentSelector, codeLensProvider));

    // Refresh the code lenses when:
    // 1. a consumer is started / stopped to refresh the status of each declared CONSUMER
    context.subscriptions.push(consumerCollection.onDidChangeCollection((e: ConsumerCollectionChangedEvent) => {
        codeLensProvider.refresh();
    }));
    // 2. a producer is started / stopped to refresh the status of each declared PRODUCER
    context.subscriptions.push(producerCollection.onDidChangeCollection((e: ProducerCollectionChangedEvent) => {
        codeLensProvider.refresh();
    }));
    // 3. a cluster is selected
    clusterSettings.onDidChangeSelected((e) => {
        codeLensProvider.refresh();
    });
    // 4. a kafka client state changed (disconnected, connected, invalid)
    clientAccessor.onDidChangeClientState(() => codeLensProvider.refresh());

    // Completion
    const completion = new KafkaFileCompletionItemProvider(kafkaFileDocuments, languageService, workspaceSettings);
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(documentSelector, completion, ':', '{', '.', '(')
    );

    // Validation
    const diagnostics = new KafkaFileDiagnostics(kafkaFileDocuments, languageService, clusterSettings, clientAccessor, modelProvider, workspaceSettings);
    context.subscriptions.push(diagnostics);

    // Hover
    const hover = new KafkaFileHoverProvider(kafkaFileDocuments, languageService);
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(documentSelector, hover)
    );

    // Open / Close document
    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(e => {
        if (e.languageId === 'kafka') {
            openedDocuments.set(e.uri.toString(), e);
            diagnostics.triggerValidate(e);
        }
    }));

    context.subscriptions.push(vscode.workspace.onDidChangeTextDocument(e => {
        if (e.document.languageId === 'kafka') {
            diagnostics.triggerValidate(e.document);
        }
    }));

    context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(e => {
        if (e.languageId === 'kafka') {
            openedDocuments.delete(e.uri.toString());
            kafkaFileDocuments.onDocumentRemoved(e);
            diagnostics.delete(e);
        }
    }));

    return {
        dispose() {
            kafkaFileDocuments.dispose();
        }
    };
}

function createLanguageService(clusterSettings: ClusterSettings, clientAccessor: ClientAccessor, producerCollection: ProducerCollection, consumerCollection: ConsumerCollection, modelProvider: KafkaModelProvider): LanguageService {
    const producerLaunchStateProvider = {
        getProducerLaunchState(uri: vscode.Uri): ProducerLaunchState {
            const producer = producerCollection.get(uri);
            return producer ? producer.state : ProducerLaunchState.idle;
        }
    } as ProducerLaunchStateProvider;

    const consumerLaunchStateProvider = {
        getConsumerLaunchState(clusterId: string, consumerGroupId: string): ConsumerLaunchState {
            const consumer = consumerCollection.getByConsumerGroupId(clusterId, consumerGroupId);
            return consumer ? consumer.state : ConsumerLaunchState.idle;
        }
    } as ConsumerLaunchStateProvider;

    const selectedClusterProvider = {
        getSelectedCluster() {
            const selected = clusterSettings.selected;
            const clusterId = selected?.id;
            const clusterState = clusterId ? clientAccessor.getState(clusterId) : undefined;
            return {
                clusterId,
                clusterName: selected?.name,
                clusterState
            };
        }
    } as SelectedClusterProvider;

    const topicProvider = new DataModelTopicProvider(modelProvider);

    return getLanguageService(producerLaunchStateProvider, consumerLaunchStateProvider, selectedClusterProvider, topicProvider);
}

export class AbstractKafkaFileFeature {

    constructor(
        private kafkaFileDocuments: LanguageModelCache<KafkaFileDocument>,
        protected readonly languageService: LanguageService
    ) { }

    getKafkaFileDocument(document: vscode.TextDocument): KafkaFileDocument {
        return this.kafkaFileDocuments.get(document);
    }

}

class KafkaFileCodeLensProvider extends AbstractKafkaFileFeature implements vscode.CodeLensProvider {

    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>();
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event;

    constructor(
        kafkaFileDocuments: LanguageModelCache<KafkaFileDocument>,
        languageService: LanguageService
    ) {
        super(kafkaFileDocuments, languageService);
    }

    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken): vscode.ProviderResult<vscode.CodeLens[]> {
        return runSafeAsync(async () => {
            const kafkaFileDocument = this.getKafkaFileDocument(document);
            return this.languageService.getCodeLenses(document, kafkaFileDocument);
        }, [], `Error while computing code lenses for ${document.uri}`, token);
    }

    refresh() {
        this._onDidChangeCodeLenses.fire();
    }
}

class KafkaFileCompletionItemProvider extends AbstractKafkaFileFeature implements vscode.CompletionItemProvider {

    constructor(
        kafkaFileDocuments: LanguageModelCache<KafkaFileDocument>,
        languageService: LanguageService,
        private workspaceSettings: WorkspaceSettings
    ) {
        super(kafkaFileDocuments, languageService);
    }

    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        return runSafeAsync(async () => {
            const kafkaFileDocument = this.getKafkaFileDocument(document);
            return this.languageService.doComplete(document, kafkaFileDocument, this.workspaceSettings.producerFakerJSEnabled, position);
        }, new vscode.CompletionList(), `Error while computing completion for ${document.uri}`, token);
    }

}

class KafkaFileDiagnostics extends AbstractKafkaFileFeature implements vscode.Disposable {

    private diagnosticCollection: vscode.DiagnosticCollection;
    private delayers?: { [key: string]: ThrottledDelayer<void> };
    producerFakerJSEnabled: boolean;

    constructor(
        kafkaFileDocuments: LanguageModelCache<KafkaFileDocument>,
        languageService: LanguageService,
        clusterSettings: ClusterSettings,
        clientAccessor: ClientAccessor,
        modelProvider: KafkaModelProvider,
        settings: WorkspaceSettings
    ) {
        super(kafkaFileDocuments, languageService);
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('kafka');
        this.delayers = Object.create(null);
        this.producerFakerJSEnabled = settings.producerFakerJSEnabled;
        // Validation refresh for opened kafka files must occured when:

        // 1) the 'producerFakerJSEnabled' settings changed to revalidate FakerJS expressions
        settings.onDidChangeSettings(() => {
            if (this.producerFakerJSEnabled !== settings.producerFakerJSEnabled) {
                this.validateAll();
                this.producerFakerJSEnabled = settings.producerFakerJSEnabled;
            }
        });
        // 2) kafka explorer is refreshed to revalidate existing topics
        modelProvider.onDidChangeDataModel(() => this.validateAll());
        // 3) cluster selection changed to revalidate existing topics
        clusterSettings.onDidChangeSelected(() => this.validateAll());
        // 4) kafka client state changed to revalidate existing topics
        clientAccessor.onDidChangeClientState(() => this.validateAll());

        // 4) when vscode is started
        this.validateAll();
    }

    /**
     * Validate all opened kafka files.
     */
    public validateAll() {
        vscode.workspace.textDocuments.forEach(this.triggerValidate, this);
    }

    delete(textDocument: vscode.TextDocument) {
        this.diagnosticCollection.delete(textDocument.uri);
    }

    public triggerValidate(textDocument: vscode.TextDocument): void {
        let trigger = () => {
            let key = textDocument.uri.toString();
            let delayer = this.delayers![key];
            if (!delayer) {
                delayer = new ThrottledDelayer<void>(250);
                this.delayers![key] = delayer;
            }
            delayer.trigger(() => this.doValidate(textDocument));
        };
        trigger();
    }

    private doValidate(document: vscode.TextDocument): Promise<void> {
        return new Promise<void>((resolve) => {
            const kafkaFileDocument = this.getKafkaFileDocument(document);
            this.languageService.doDiagnostics(document, kafkaFileDocument, this.producerFakerJSEnabled)
                .then(diagnostics => {
                    this.diagnosticCollection!.set(document.uri, diagnostics);
                    resolve();
                });
        });
    }
    dispose(): void {
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
    }
}

class KafkaFileHoverProvider extends AbstractKafkaFileFeature implements vscode.HoverProvider {
    provideHover(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): vscode.ProviderResult<vscode.Hover> {
        return runSafeAsync(async () => {
            const kafkaFileDocument = this.getKafkaFileDocument(document);
            return this.languageService.doHover(document, kafkaFileDocument, position);
        }, null, `Error while computing hover for ${document.uri}`, token);
    }

}