import * as vscode from "vscode";

/**
 * The sort options for topics.
 */
export enum TopicSortOption {
    Name = "name",
    Partitions = "partitions",
}

/**
 * The supported SASL mechanisms for authentication.
 */
export type SaslMechanism = "plain";

/**
 * The initial consumer offset for new consumer groups.
 * Applies when a consumer group has no committed offsets.
 */
export type InitialConsumerOffset = "latest" | "earliest";

export interface SaslOption {
    mechanism: SaslMechanism;
    username?: string;
    password?: string;
}

export interface Settings extends vscode.Disposable {
    host: string;
    consumerOffset: InitialConsumerOffset;
    topicSortOption: TopicSortOption;
    sasl?: SaslOption;
}

class KafkaWorkspaceSettings implements Settings {
    private static instance: KafkaWorkspaceSettings;

    private configurationChangeHandlerDisposable: vscode.Disposable;

    private _onDidChangeSettings = new vscode.EventEmitter<undefined>();
    public onDidChangeSettings: vscode.Event<undefined> = this._onDidChangeSettings.event;

    public host = "";
    public consumerOffset: InitialConsumerOffset = "latest";
    public topicSortOption: TopicSortOption = TopicSortOption.Name;
    public sasl?: SaslOption;

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
        this.host = configuration.get<string>("hosts", "");
        this.consumerOffset = configuration.get<InitialConsumerOffset>("consumers.offset", "latest");
        this.topicSortOption = configuration.get<TopicSortOption>("explorer.topics.sort", TopicSortOption.Name);

        const saslMechanism = configuration.get<"plain" | "none">("sasl.mechanism", "none");
        const username = configuration.get<string | undefined>("sasl.username");
        const password = configuration.get<string | undefined>("sasl.password");

        if (saslMechanism !== "none") {
            this.sasl = {
                mechanism: saslMechanism,
                username,
                password,
            };
        } else {
            this.sasl = undefined;
        }
    }

    dispose(): void {
        this._onDidChangeSettings.dispose();
        this.configurationChangeHandlerDisposable.dispose();
    }

    static getInstance(): KafkaWorkspaceSettings {
        if (!KafkaWorkspaceSettings.instance) {
            KafkaWorkspaceSettings.instance = new KafkaWorkspaceSettings();
        }

        return KafkaWorkspaceSettings.instance;
    }
}

export const getSettings = (): KafkaWorkspaceSettings => KafkaWorkspaceSettings.getInstance();
export const createSettings = (): KafkaWorkspaceSettings => KafkaWorkspaceSettings.getInstance();
