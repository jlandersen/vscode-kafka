import * as vscode from "vscode";

/**
 * The sort options for topics.
 */
export enum TopicSortOption {
    name = "name",
    partitions = "partitions",
}

/**
 * The initial consumer offset for new consumer groups.
 * Applies when a consumer group has no committed offsets.
 */
export type InitialConsumerOffset = "latest" | "earliest";

const DEFAULT_PRODUCER_LOCALE = 'en';
const DEFAULT_TOPIC_FILTER = ['__consumer_offsets', '__transaction_state', '_schemas'];
const DEFAULT_CONSUMER_FILTER:string[] = [];

export interface WorkspaceSettings extends vscode.Disposable {
    consumerOffset: InitialConsumerOffset;
    topicSortOption: TopicSortOption;
    producerFakerJSEnabled: boolean;
    producerFakerJSLocale: string;
}

class VsCodeWorkspaceSettings implements WorkspaceSettings {
    private static instance: VsCodeWorkspaceSettings;

    private configurationChangeHandlerDisposable: vscode.Disposable;

    private _onDidChangeSettings = new vscode.EventEmitter<undefined>();
    public onDidChangeSettings: vscode.Event<undefined> = this._onDidChangeSettings.event;

    public consumerOffset: InitialConsumerOffset = "latest";
    public topicSortOption: TopicSortOption = TopicSortOption.name;
    public producerFakerJSEnabled = true;
    public producerFakerJSLocale = DEFAULT_PRODUCER_LOCALE;
    public topicFilters = DEFAULT_TOPIC_FILTER;
    public consumerFilters = DEFAULT_CONSUMER_FILTER;

    private constructor() {
        this.configurationChangeHandlerDisposable = vscode.workspace.onDidChangeConfiguration(
            (e: vscode.ConfigurationChangeEvent) => {
            if (!e.affectsConfiguration("kafka")) {
                return;
            }

            this.reload();
            this._onDidChangeSettings.fire(undefined);
        });

        this.reload();
    }

    private reload(): void {
        const configuration = vscode.workspace.getConfiguration("kafka");
        this.consumerOffset = configuration.get<InitialConsumerOffset>("consumers.offset", "latest");
        this.topicSortOption = configuration.get<TopicSortOption>("explorer.topics.sort", TopicSortOption.name);
        this.producerFakerJSEnabled = configuration.get<boolean>("producers.fakerjs.enabled", true);
        this.producerFakerJSLocale = configuration.get<string>("producers.fakerjs.locale", DEFAULT_PRODUCER_LOCALE);
        this.topicFilters = configuration.get<string[]>("explorer.topics.filter", DEFAULT_TOPIC_FILTER);
        this.consumerFilters = configuration.get<string[]>("explorer.consumers.filter", DEFAULT_CONSUMER_FILTER);
    }

    dispose(): void {
        this._onDidChangeSettings.dispose();
        this.configurationChangeHandlerDisposable.dispose();
    }

    static getInstance(): VsCodeWorkspaceSettings {
        if (!VsCodeWorkspaceSettings.instance) {
            VsCodeWorkspaceSettings.instance = new VsCodeWorkspaceSettings();
        }

        return VsCodeWorkspaceSettings.instance;
    }
}

export const getWorkspaceSettings = (): VsCodeWorkspaceSettings => VsCodeWorkspaceSettings.getInstance();
