import * as vscode from "vscode";
import { ConsumerCollection, ConsumerCollectionChangedEvent, ConsumerLaunchState } from "../client/consumer";
import { ProducerCollection, ProducerCollectionChangedEvent, ProducerLaunchState } from "../client/producer";
import { ClusterSettings } from "../settings/clusters";

import { getLanguageModelCache, LanguageModelCache } from './languageModelCache';
import { KafkaFileDocument } from "./languageservice/parser/kafkaFileParser";
import { ConsumerLaunchStateProvider, getLanguageService, LanguageService, ProducerLaunchStateProvider, SelectedClusterProvider, TopicDetail, TopicProvider } from "./languageservice/kafkaFileLanguageService";
import { runSafeAsync } from "./utils/runner";
import { TopicItem } from "../explorer";
import { KafkaModelProvider } from "../explorer/models/kafka";
import { ThrottledDelayer } from "./utils/async";

export function startLanguageClient(
    clusterSettings: ClusterSettings,
    producerCollection: ProducerCollection,
    consumerCollection: ConsumerCollection,
    modelProvider: KafkaModelProvider,
    context: vscode.ExtensionContext
): vscode.Disposable {

    // Create cache for opened text document and AST
    const openedDocuments = new Map<string, vscode.TextDocument>();
    const kafkaFileDocuments = getLanguageModelCache<KafkaFileDocument>(10, 60, document => languageService.parseKafkaFileDocument(document));

    // Create the Kafka file language service.
    const languageService = createLanguageService(clusterSettings, producerCollection, consumerCollection, modelProvider);

    const documentSelector = [
        { language: "kafka", scheme: "file" },
        { language: "kafka", scheme: "untitled" },
        { language: "kafka", scheme: "kafka" },
    ];

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

    // Completion
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(documentSelector,
            new KafkaFileCompletionItemProvider(kafkaFileDocuments, languageService),
            ':', '{', '.'));

    // Validation
    const diagnostics = new KafkaFileDiagnostics(kafkaFileDocuments, languageService);
    context.subscriptions.push(diagnostics);

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

function createLanguageService(clusterSettings: ClusterSettings, producerCollection: ProducerCollection, consumerCollection: ConsumerCollection, modelProvider: KafkaModelProvider): LanguageService {
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
            return {
                clusterId: selected?.id,
                clusterName: selected?.name,
            };
        }
    } as SelectedClusterProvider;

    const topicProvider = {
        async getTopics(clusterId: string): Promise<TopicDetail[]> {
            // Retrieve the proper cluster item from the explorer
            const model = modelProvider.getDataModel();
            const cluster = await model.findClusterItemById(clusterId);
            if (!cluster) {
                return [];
            }
            // Returns topics from the cluster
            return (await cluster.getTopics()).map(child => (<TopicItem>child).topic);
        }
    } as TopicProvider;

    return getLanguageService(producerLaunchStateProvider, consumerLaunchStateProvider, selectedClusterProvider, topicProvider);
}

class AbstractKafkaFileFeature {

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
        languageService: LanguageService
    ) {
        super(kafkaFileDocuments, languageService);
    }

    provideCompletionItems(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken, context: vscode.CompletionContext): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList> {
        return runSafeAsync(async () => {
            const kafkaFileDocument = this.getKafkaFileDocument(document);
            return this.languageService.doComplete(document, kafkaFileDocument, position);
        }, new vscode.CompletionList(), `Error while computing code lenses for ${document.uri}`, token);
    }

}

class KafkaFileDiagnostics extends AbstractKafkaFileFeature implements vscode.Disposable {

    private diagnosticCollection: vscode.DiagnosticCollection;
    private delayers?: { [key: string]: ThrottledDelayer<void> };

    constructor(
        kafkaFileDocuments: LanguageModelCache<KafkaFileDocument>,
        languageService: LanguageService
    ) {
        super(kafkaFileDocuments, languageService);
        this.diagnosticCollection = vscode.languages.createDiagnosticCollection('kafka');
        this.delayers = Object.create(null);
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
            const diagnostics = this.languageService.doDiagnostics(document, kafkaFileDocument);
            this.diagnosticCollection!.set(document.uri, diagnostics);
            resolve();
        });
    }
    dispose(): void {
        this.diagnosticCollection.clear();
        this.diagnosticCollection.dispose();
    }
}
