import * as vscode from "vscode";

export interface Settings extends vscode.Disposable {
    host: string;
    consumerOffset: string;
}

class KafkaWorkspaceSettings implements Settings {
    private static instance: KafkaWorkspaceSettings;

    private configurationChangeHandlerDisposable: vscode.Disposable;

    private _onDidChangeSettings = new vscode.EventEmitter<undefined>();
    public onDidChangeSettings: vscode.Event<undefined> = this._onDidChangeSettings.event;

    public host: string = "";
    public consumerOffset: string = "";

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
