import * as vscode from "vscode";

export enum TopicSortOption {
    Name = "name",
    Partitions = "partitions",
}

export type SaslMechanism = "plain";

export interface SaslOption {
    mechanism: SaslMechanism;
    username?: string;
    password?: string;
}

export interface Settings extends vscode.Disposable {
    host: string;
    consumerOffset: string;
    topicSortOption: TopicSortOption;
    sasl?: SaslOption;
}

class KafkaWorkspaceSettings implements Settings {
    private static instance: KafkaWorkspaceSettings;

    private configurationChangeHandlerDisposable: vscode.Disposable;

    private _onDidChangeSettings = new vscode.EventEmitter<undefined>();
    public onDidChangeSettings: vscode.Event<undefined> = this._onDidChangeSettings.event;

    public host: string = "";
    public consumerOffset: string = "";
    public topicSortOption: TopicSortOption = TopicSortOption.Name;
    public sasl?: SaslOption;

    private constructor() {
        this.configurationChangeHandlerDisposable = vscode.workspace.onDidChangeConfiguration(
            (e: vscode.ConfigurationChangeEvent) => {
            if (!e.affectsConfiguration("kafka")) {
                return;
            }

            this.reload();
            this._onDidChangeSettings.fire();
        });

        this.reload();
    }

    private reload() {
        const configuration = vscode.workspace.getConfiguration("kafka");
        this.host = configuration.get<string>("hosts", "");
        this.consumerOffset = configuration.get<string>("consumers.offset", "latest");
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

    dispose() {
        this._onDidChangeSettings.dispose();
        this.configurationChangeHandlerDisposable.dispose();
    }

    static getInstance() {
        if (!KafkaWorkspaceSettings.instance) {
            KafkaWorkspaceSettings.instance = new KafkaWorkspaceSettings();
        }

        return KafkaWorkspaceSettings.instance;
    }
}

export const getSettings = () => KafkaWorkspaceSettings.getInstance();
export const createSettings = () => KafkaWorkspaceSettings.getInstance();
