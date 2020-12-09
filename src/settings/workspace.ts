import * as vscode from "vscode";

/**
 * The sort options for topics.
 */
export enum TopicSortOption {
    Name = "name",
    Partitions = "partitions",
}

/**
 * The initial consumer offset for new consumer groups.
 * Applies when a consumer group has no committed offsets.
 */
export type InitialConsumerOffset = "latest" | "earliest";

const DEFAULT_PRODUCER_LOCALE = 'en';

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
    public topicSortOption: TopicSortOption = TopicSortOption.Name;
    public producerFakerJSEnabled = true;
    public producerFakerJSLocale = DEFAULT_PRODUCER_LOCALE;

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
        this.topicSortOption = configuration.get<TopicSortOption>("explorer.topics.sort", TopicSortOption.Name);
        this.producerFakerJSEnabled = configuration.get<boolean>("producers.fakerjs.enabled", true);
        this.producerFakerJSLocale = configuration.get<string>("producers.fakerjs.locale", DEFAULT_PRODUCER_LOCALE);
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
