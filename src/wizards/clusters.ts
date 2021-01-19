import { QuickPickItem, window } from "vscode";
import { ConnectionOptions, SaslMechanism } from "../client";
import { INPUT_TITLE } from "../constants";
import { KafkaExplorer } from "../explorer/kafkaExplorer";
import { ClusterSettings } from "../settings/clusters";
import { MultiStepInput, showErrorMessage, State } from "./multiStepInput";
import { validateBroker, validateClusterName, validateAuthentificationUserName } from "./validators";

const DEFAULT_BROKER = 'localhost:9092';

interface AddClusterState extends State, ConnectionOptions {
    name: string;
}

const DEFAULT_STEPS = 4;

export async function addClusterWizard(clusterSettings: ClusterSettings, explorer: KafkaExplorer): Promise<void> {




    const state: Partial<AddClusterState> = {
        totalSteps: DEFAULT_STEPS
    };

    async function collectInputs(state: Partial<AddClusterState>, clusterSettings: ClusterSettings) {
        await MultiStepInput.run(input => inputBrokers(input, state, clusterSettings));
    }

    async function inputBrokers(input: MultiStepInput, state: Partial<AddClusterState>, clusterSettings: ClusterSettings) {
        state.bootstrap = await input.showInputBox({
            title: INPUT_TITLE,
            step: input.getStepNumber(),
            totalSteps: state.totalSteps,
            value: state.bootstrap ? state.bootstrap : DEFAULT_BROKER,
            prompt: 'Broker(s) (localhost:9092,localhost:9093...)',
            validate: validateBroker
        });
        return (input: MultiStepInput) => inputClusterName(input, state, clusterSettings);
    }

    async function inputClusterName(input: MultiStepInput, state: Partial<AddClusterState>, clusterSettings: ClusterSettings) {
        const existingClusterNames = clusterSettings.getAll().map(cluster => cluster.name);
        state.name = await input.showInputBox({
            title: INPUT_TITLE,
            step: input.getStepNumber(),
            totalSteps: state.totalSteps,
            value: state.name || '',
            prompt: 'Friendly name',
            validationContext: existingClusterNames,
            validate: validateClusterName
        });

        return (input: MultiStepInput) => inputAuthentification(input, state);
    }

    async function inputAuthentification(input: MultiStepInput, state: Partial<AddClusterState>) {
        const authMechanisms = new Map<string, string>([
            ["SASL/PLAIN", "plain"],
            ["SASL/SCRAM-256", "scram-sha-256"],
            ["SASL/SCRAM-512", "scram-sha-512"]
        ]);
        const authOptions: QuickPickItem[] = [{ "label": "None" }]
        for (const label of authMechanisms.keys()) {
            authOptions.push({ "label": label });
        }

        const authentification = (await input.showQuickPick({
            title: INPUT_TITLE,
            step: input.getStepNumber(),
            totalSteps: state.totalSteps,
            placeholder: 'Pick authentification',
            items: authOptions,
            activeItem: authOptions[0]
        })).label;
        if (authentification) {
            if (authentification == authOptions[0].label) {
                state.totalSteps = DEFAULT_STEPS;// we're on the 4-step track
                return (input: MultiStepInput) => inputSSL(input, state);
            } else {
                state.totalSteps = DEFAULT_STEPS + 1;// we're on the 5-step track
                state.saslOption = { mechanism: authMechanisms.get(authentification) as SaslMechanism };
                return (input: MultiStepInput) => inputAuthentificationUserName(input, state);
            }
        }
        return undefined;
    }

    async function inputAuthentificationUserName(input: MultiStepInput, state: Partial<AddClusterState>) {
        if (!state.saslOption) {
            return;
        }
        state.saslOption.username = await input.showInputBox({
            title: INPUT_TITLE,
            step: input.getStepNumber(),
            totalSteps: state.totalSteps,
            value: state.saslOption?.username || '',
            prompt: ' Username',
            validate: validateAuthentificationUserName
        });

        return (input: MultiStepInput) => inputAuthentificationPassword(input, state);
    }

    async function inputAuthentificationPassword(input: MultiStepInput, state: Partial<AddClusterState>) {
        if (!state.saslOption) {
            return;
        }
        state.saslOption.password = await input.showInputBox({
            title: INPUT_TITLE,
            step: input.getStepNumber(),
            totalSteps: state.totalSteps,
            value: state.saslOption.password || '',
            prompt: ' Password',
            password: true
        });
    }

    async function inputSSL(input: MultiStepInput, state: Partial<AddClusterState>) {
        const sslOptions: QuickPickItem[] = [{ "label": "Disabled" }, { "label": "Enabled" }]
        const ssl = (await input.showQuickPick({
            title: INPUT_TITLE,
            step: input.getStepNumber(),
            totalSteps: state.totalSteps,
            placeholder: 'SSL',
            items: sslOptions,
            activeItem: sslOptions[0]
        })).label;
        if (ssl) {
            state.ssl = ssl == sslOptions[1].label;
        }
    }

    try {
        await collectInputs(state, clusterSettings);
    } catch (e) {
        showErrorMessage('Error while collecting inputs for creating cluster', e);
        return;
    }

    const addClusterState: AddClusterState = state as AddClusterState;
    const bootstrap = state.bootstrap;
    if (!bootstrap) {
        return;
    }
    const name = state.name;
    if (!name) {
        return;
    }
    const saslOption = addClusterState.saslOption;
    const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, "");
    const suffix = Buffer.from(bootstrap).toString("base64").replace(/=/g, "");

    try {
        clusterSettings.upsert({
            id: `${sanitizedName}-${suffix}`,
            bootstrap,
            name,
            saslOption,
            ssl: state.ssl
        });
        explorer.refresh();
        window.showInformationMessage(`Cluster '${name}' created successfully`);
        // Selecting the created cluster is done with TreeView#reveal
        // 1. Show the treeview of the explorer (otherwise reveal will not work)
        explorer.show();
        // 2. the reveal() call must occur within a timeout(),
        // while waiting for a fix in https://github.com/microsoft/vscode/issues/114149
        setTimeout(() => {
            explorer.selectClusterByName(name);
        }, 1000);
    }
    catch (error) {
        showErrorMessage(`Error while creating cluster`, error);
    }
}
