/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import { WebviewWizard, WizardDefinition, SEVERITY, UPDATE_TITLE, WizardPageFieldDefinition, WizardPageSectionDefinition, BUTTONS, PerformFinishResponse, IWizardPage, ValidatorResponseItem, FieldDefinitionState } from "@redhat-developer/vscode-wizard";
import { ClientAccessor, Cluster, SaslMechanism, SaslOption, SslOption } from "../client";
import { ClusterSettings } from "../settings";
import { validateAuthentificationUserName, validateBroker, validateClusterName, validateFile } from "./validators";
import { KafkaExplorer } from "../explorer";
import { ClusterProvider, defaultClusterProviderId, getClusterProviders } from "../kafka-extensions/registry";
import { showErrorMessage } from "./multiStepInput";
import { SaveClusterCommandHandler } from "../commands";

export function openClusterWizard(clusterSettings: ClusterSettings, clientAccessor: ClientAccessor, explorer: KafkaExplorer, context: vscode.ExtensionContext) {
    const providers = getClusterProviders();
    if (providers.length === 1) {
        return openClusterForm(undefined, clusterSettings, clientAccessor, explorer, context);
    }
    const wiz: WebviewWizard = createClusterWizard(providers, clusterSettings, clientAccessor, explorer, context);
    wiz.open();
}

export function openClusterForm(cluster: Cluster | undefined, clusterSettings: ClusterSettings, clientAccessor: ClientAccessor, explorer: KafkaExplorer, context: vscode.ExtensionContext) {
    const wiz: WebviewWizard = createEditClusterForm(cluster, clusterSettings, clientAccessor, explorer, context);
    wiz.open();
}

interface AuthMechanism {
    key: string,
    label: string;
}

const authMechanisms: Array<AuthMechanism> = [
    { key: "none", label: "None" },
    { key: "plain", label: "SASL/PLAIN" },
    { key: "scram-sha-256", label: "SASL/SCRAM-256" },
    { key: "scram-sha-512", label: "SASL/SCRAM-512" }
];

interface ValidationContext {
    clusterSettings: ClusterSettings;
    wizard: WebviewWizard | null;
}

// --- Wizard page fields

// Fields for Page 1:
const CLUSTER_PROVIDER_ID_FIELD = "clusterProviderId";

// Fields for Page 2:
const CLUSTER_NAME_FIELD = "name";
const CLUSTER_BOOTSTRAP_FIELD = "bootstrap";
const DEFAULT_BROKER = 'localhost:9092';

// SASL fields
const CLUSTER_SASL_MECHANISM_FIELD = "saslOptions.mechanism";
const CLUSTER_SASL_USERNAME_FIELD = "saslOptions.username";
const CLUSTER_SASL_PASSWORD_FIELD = "saslOptions.password";
// SSL fields
const CLUSTER_SSL_FIELD = "ssl";
const CLUSTER_SSL_CA_FIELD = "ssl.ca";
const CLUSTER_SSL_KEY_FIELD = "ssl.key";
const CLUSTER_SSL_CERT_FIELD = "ssl.cert";
const CLUSTER_SSL_REJECT_UNAUTHORIZED_FIELD = "ssl.rejectUnauthorized";

// --- Wizard page ID
const CLUSTER_PROVIDER_PAGE = 'cluster-provider-page';
const CLUSTER_FORM_PAGE = 'cluster-form-page';

function createClusterWizard(providers: ClusterProvider[], clusterSettings: ClusterSettings, clientAccessor: ClientAccessor, explorer: KafkaExplorer, context: vscode.ExtensionContext): WebviewWizard {
    const valiationContext = {
        clusterSettings: clusterSettings,
        wizard: null
    } as ValidationContext;

    const clusterWizardDef: WizardDefinition = {
        title: "Add New Cluster(s)",
        hideWizardHeader: true,
        pages: [
            {
                id: CLUSTER_PROVIDER_PAGE,
                hideWizardPageHeader: true,
                fields: [
                    {
                        id: CLUSTER_PROVIDER_ID_FIELD,
                        label: "Cluster provider:",
                        initialValue: `${defaultClusterProviderId}`,
                        type: "select",
                        optionProvider: {

                            getItems() {
                                return [...providers];
                            },

                            getValueItem(provider: string | ClusterProvider) {
                                return (<ClusterProvider>provider).id;
                            },

                            getLabelItem(provider: string | ClusterProvider) {
                                return (<ClusterProvider>provider).name;
                            }
                        }
                    }
                ]
            },
            {
                id: CLUSTER_FORM_PAGE,
                hideWizardPageHeader: true,
                fields: createFields(),
                validator: createValidator(valiationContext),
            }
        ],
        workflowManager: {

            getNextPage(page: IWizardPage, data: any): IWizardPage | null {
                if (page.getId() === CLUSTER_PROVIDER_PAGE) {
                    const selectedClusterProvider = getSelectedClusterProvider(data, providers);
                    if (selectedClusterProvider?.id !== defaultClusterProviderId) {
                        return null;
                    }
                    return page.getNextPage();
                }
                return null;
            },

            canFinish(wizard: WebviewWizard, data: any) {
                const page = wizard.getCurrentPage();
                if (page?.getId() === CLUSTER_PROVIDER_PAGE) {
                    const selectedClusterProvider = getSelectedClusterProvider(data, providers);
                    return (selectedClusterProvider !== undefined && selectedClusterProvider.id !== defaultClusterProviderId);
                }
                return page?.isPageComplete() || false;
            },

            async performFinish(wizard: WebviewWizard, data: any) {
                const page = wizard.getCurrentPage();
                if (page?.getId() === CLUSTER_FORM_PAGE) {
                    const cluster = createCluster(data);
                    await saveCluster(data, cluster);
                    // Open the cluster in form page
                    openClusterForm(cluster, clusterSettings, clientAccessor, explorer, context);
                } else {
                    const provider = getSelectedClusterProvider(data, providers);
                    if (provider) {
                        // Collect clusters...
                        let clusters: Cluster[] | undefined;
                        try {
                            clusters = await provider.collectClusters(clusterSettings);
                            if (!clusters || clusters.length === 0) {
                                return null;
                            }
                        }
                        catch (error) {
                            showErrorMessage("Error while collecting cluster(s)", error);
                            return null;
                        }
                        // Save clusters.
                        await saveClusters(clusters);
                    }
                }
                return null;
            }
        }
    };

    return new WebviewWizard(`new-cluster`, "cluster", context, clusterWizardDef,
        new Map<string, string>());
}

function getSelectedClusterProvider(data: any, providers: ClusterProvider[]): ClusterProvider | undefined {
    return providers.find(provider => provider.id === data[CLUSTER_PROVIDER_ID_FIELD]);
}

function createEditClusterForm(cluster: Cluster | undefined, clusterSettings: ClusterSettings, clientAccessor: ClientAccessor, explorer: KafkaExplorer, context: vscode.ExtensionContext): WebviewWizard {
    const valiationContext = {
        clusterSettings: clusterSettings,
        wizard: null
    } as ValidationContext;

    const clusterWizardDef: WizardDefinition = {
        title: cluster ? `Edit Cluster - ${cluster.name}` : 'New Cluster',
        showDirtyState: true,
        hideWizardHeader: true,
        pages: [
            {
                id: `cluster-form-page'}`,
                hideWizardPageHeader: true,
                fields: createFields(cluster),
                validator: createValidator(valiationContext)
            }
        ],
        buttons: [{
            id: BUTTONS.FINISH,
            label: "Save"
        }],
        workflowManager: {

            async performFinish(wizard: WebviewWizard, data: any) {
                if (!cluster) {
                    cluster = createCluster(data);
                }
                // Save cluster
                await saveCluster(data, cluster);

                // Update tab title
                let newTitle: string = cluster.name;
                return new Promise<PerformFinishResponse | null>((res, rej) => {
                    res({
                        close: false,
                        success: true,
                        returnObject: null,
                        templates: [
                            { id: UPDATE_TITLE, content: newTitle },
                        ]
                    });
                });
            }
        }
    };
    const wizard = new WebviewWizard(`${cluster?.id}`, "cluster", context, clusterWizardDef,
        new Map<string, string>());
    valiationContext.wizard = wizard;
    return wizard;
}

function createFields(cluster?: Cluster): (WizardPageFieldDefinition | WizardPageSectionDefinition)[] {
    const tlsConnectionOptions: SslOption | undefined = <SslOption>cluster?.ssl;
    return [
        {
            id: CLUSTER_NAME_FIELD,
            label: "Name:",
            initialValue: `${cluster?.name || ''}`,
            type: "textbox",
            placeholder: 'Friendly name'
        },
        {
            id: CLUSTER_BOOTSTRAP_FIELD,
            label: "Bootstrap server:",
            initialValue: `${cluster ? (cluster?.bootstrap || '') : DEFAULT_BROKER}`,
            type: "textbox",
            placeholder: 'Broker(s) (localhost:9092,localhost:9093...)'
        },
        {
            id: 'sasl-section',
            label: 'Authentication',
            childFields: [
                {
                    id: CLUSTER_SASL_MECHANISM_FIELD,
                    label: "Mechanism:",
                    initialValue: `${cluster?.saslOption?.mechanism || "none"}`,
                    type: "select",
                    optionProvider: {

                        getItems() {
                            return authMechanisms;
                        },

                        getValueItem(mechanism: AuthMechanism) {
                            return mechanism.key;
                        },

                        getLabelItem(mechanism: AuthMechanism) {
                            return mechanism.label;
                        }
                    }
                },
                {
                    id: CLUSTER_SASL_USERNAME_FIELD,
                    label: "Username:",
                    initialValue: `${cluster?.saslOption?.username || ''}`,
                    type: "textbox"
                },
                {
                    id: CLUSTER_SASL_PASSWORD_FIELD,
                    label: "Password:",
                    initialValue: `${cluster?.saslOption?.password || ''}`,
                    type: "password"
                }
            ]
        },
        {
            id: 'ssl-section',
            label: 'SSL',
            childFields: [
                {
                    id: CLUSTER_SSL_FIELD,
                    label: "Enable SSL",
                    initialValue: !(cluster?.ssl === undefined || cluster?.ssl === false) ? 'true' : undefined,
                    type: "checkbox"
                },
                {
                    id: CLUSTER_SSL_CA_FIELD,
                    label: "Certificate Authority:",
                    initialValue: tlsConnectionOptions?.ca,
                    type: "file-picker",
                    placeholder: "Select file in PEM format.",
                    dialogOptions: {
                        canSelectMany: false,
                        filters: {
                            'All': ['*'],
                            'PEM': ['pem', 'crt', 'cer', 'key']
                        }
                    }
                },
                {
                    id: CLUSTER_SSL_KEY_FIELD,
                    label: "Client key:",
                    initialValue: tlsConnectionOptions?.key,
                    type: "file-picker",
                    placeholder: "Select file in PEM format.",
                    dialogOptions: {
                        canSelectMany: false,
                        filters: {
                            'All': ['*'],
                            'PEM': ['pem', 'crt', 'cer', 'key']
                        }
                    }
                },
                {
                    id: CLUSTER_SSL_CERT_FIELD,
                    label: "Client certificate:",
                    initialValue: tlsConnectionOptions?.cert,
                    type: "file-picker",
                    placeholder: "Select file in PEM format.",
                    dialogOptions: {
                        canSelectMany: false,
                        filters: {
                            'All': ['*'],
                            'PEM': ['pem', 'crt', 'cer', 'key']
                        }
                    }
                },
                {
                    id: CLUSTER_SSL_REJECT_UNAUTHORIZED_FIELD,
                    label: "Reject Unauthorized Certificates",
                    description: "When disabled, accepts self-signed certificates and hostname mismatches. ⚠️ Use only for development!",
                    initialValue: tlsConnectionOptions?.rejectUnauthorized !== false ? 'true' : undefined,
                    type: "checkbox"
                }
            ]
        }
    ];
}

function createValidator(validationContext: ValidationContext) {
    return (parameters?: any) => {
        const clusterName = validationContext.wizard?.title;
        const diagnostics: Array<ValidatorResponseItem> = [];
        const fieldRefresh = new Map<string, FieldDefinitionState>();

        // 1. Validate cluster name
        const clusterSettings = validationContext.clusterSettings;
        const existingClusterNames = clusterSettings.getAll()
            .filter(c => clusterName === undefined || c.name !== clusterName)
            .map(c => c.name);
        const clustername = parameters[CLUSTER_NAME_FIELD];
        let result = validateClusterName(clustername, existingClusterNames);
        if (result) {
            diagnostics.push(
                {
                    template: {
                        id: CLUSTER_NAME_FIELD,
                        content: result
                    },
                    severity: SEVERITY.ERROR
                }
            );
        }

        // 2. Validate bootstrap broker
        const bootstrap = parameters[CLUSTER_BOOTSTRAP_FIELD];
        result = validateBroker(bootstrap);
        if (result) {
            diagnostics.push(
                {
                    template: {
                        id: CLUSTER_BOOTSTRAP_FIELD,
                        content: result
                    },
                    severity: SEVERITY.ERROR
                }
            );
        }

        // 3. Validate username if SASL is enabled
        function isSASLEnabled(data: any) {
            return data[CLUSTER_SASL_MECHANISM_FIELD] && data[CLUSTER_SASL_MECHANISM_FIELD] !== 'none';
        }

        function isSSLEnabled(data: any) {
            return (data[CLUSTER_SSL_FIELD] === true || data[CLUSTER_SSL_FIELD] === 'true');
        }

        const saslEnabled = isSASLEnabled(parameters);
        const sslEnabled = isSSLEnabled(parameters);

        if (saslEnabled) {

            const username = parameters[CLUSTER_SASL_USERNAME_FIELD];
            result = validateAuthentificationUserName(username);
            if (result) {
                diagnostics.push(
                    {
                        template: {
                            id: CLUSTER_SASL_USERNAME_FIELD,
                            content: result
                        },
                        severity: SEVERITY.ERROR
                    }
                );
            }

            // check if SSL checkbox is checked
            if (!sslEnabled) {
                diagnostics.push(
                    {
                        template: {
                            id: CLUSTER_SSL_FIELD,
                            content: 'SSL should probably be enabled since Authentication is enabled.'
                        },
                        severity: SEVERITY.WARN
                    }
                );
            }
        }

        // 4. Validate certificate files
        validateCertificateFile(parameters, CLUSTER_SSL_CA_FIELD, diagnostics);
        validateCertificateFile(parameters, CLUSTER_SSL_KEY_FIELD, diagnostics);
        validateCertificateFile(parameters, CLUSTER_SSL_CERT_FIELD, diagnostics);

        // 5. Manage enabled state for SASL and SSL fields
        fieldRefresh.set(CLUSTER_SASL_USERNAME_FIELD, { enabled: saslEnabled });
        fieldRefresh.set(CLUSTER_SASL_PASSWORD_FIELD, { enabled: saslEnabled });

        fieldRefresh.set(CLUSTER_SSL_CA_FIELD, { enabled: sslEnabled });
        fieldRefresh.set(CLUSTER_SSL_KEY_FIELD, { enabled: sslEnabled });
        fieldRefresh.set(CLUSTER_SSL_CERT_FIELD, { enabled: sslEnabled });
        fieldRefresh.set(CLUSTER_SSL_REJECT_UNAUTHORIZED_FIELD, { enabled: sslEnabled });

        return { items: diagnostics, fieldRefresh };
    };
}

async function saveCluster(data: any, cluster: Cluster) {
    cluster.name = data[CLUSTER_NAME_FIELD];
    cluster.bootstrap = data[CLUSTER_BOOTSTRAP_FIELD];
    cluster.saslOption = createSaslOption(data);
    cluster.ssl = createSsl(data);
    return saveClusters([cluster]);
}

async function saveClusters(clusters: Cluster[]) {
    return vscode.commands.executeCommand(SaveClusterCommandHandler.commandId, clusters);
}

function createSaslOption(data: any): SaslOption | undefined {
    const mechanism = data[CLUSTER_SASL_MECHANISM_FIELD] as SaslMechanism;
    if (mechanism) {
        const username = data[CLUSTER_SASL_USERNAME_FIELD];
        const password = data[CLUSTER_SASL_PASSWORD_FIELD];
        return {
            mechanism,
            username,
            password
        } as SaslOption;
    }
}

function createSsl(data: any): SslOption | boolean {
    const ca = data[CLUSTER_SSL_CA_FIELD];
    const key = data[CLUSTER_SSL_KEY_FIELD];
    const cert = data[CLUSTER_SSL_CERT_FIELD];
    const rejectUnauthorized = data[CLUSTER_SSL_REJECT_UNAUTHORIZED_FIELD];
    
    // If any SSL option is configured, return SslOption object
    if (ca || key || cert || rejectUnauthorized !== undefined) {
        const sslOption: SslOption = {
            ca,
            key,
            cert
        };
        
        // Only set rejectUnauthorized if explicitly set to false
        // (defaults to true if undefined, which is secure by default)
        if (rejectUnauthorized === false || rejectUnauthorized === 'false') {
            sslOption.rejectUnauthorized = false;
        }
        
        return sslOption;
    }
    
    return data[CLUSTER_SSL_FIELD] === true || data[CLUSTER_SSL_FIELD] === 'true';
}

function createCluster(data: any): Cluster {
    const name = data[CLUSTER_NAME_FIELD];
    const bootstrap = data[CLUSTER_BOOTSTRAP_FIELD];
    const sanitizedName = name.replace(/[^a-zA-Z0-9]/g, "");
    const suffix = Buffer.from(bootstrap).toString("base64").replace(/=/g, "");

    return {
        id: `${sanitizedName}-${suffix}`
    } as Cluster;
}

function validateCertificateFile(parameters: any, fieldId: string, diagnostics: Array<ValidatorResponseItem>) {
    const fileName = parameters[fieldId];
    if (!fileName || fileName === '') {
        return;
    }
    const result = validateFile(fileName);
    if (result) {
        diagnostics.push(
            {
                template: {
                    id: fieldId,
                    content: result
                },
                severity: SEVERITY.ERROR
            }
        );
    }
}
