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
    { key: "scram-sha-512", label: "SASL/SCRAM-512" },
    { key: "oauthbearer", label: "SASL/OAUTHBEARER" },
    { key: "aws", label: "AWS MSK IAM" }
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
// OAUTHBEARER fields
const CLUSTER_OAUTH_TOKEN_ENDPOINT_FIELD = "saslOptions.oauthTokenEndpoint";
const CLUSTER_OAUTH_CLIENT_ID_FIELD = "saslOptions.oauthClientId";
const CLUSTER_OAUTH_CLIENT_SECRET_FIELD = "saslOptions.oauthClientSecret";
// AWS MSK IAM fields
const CLUSTER_AWS_REGION_FIELD = "saslOptions.awsRegion";
const CLUSTER_AWS_ACCESS_KEY_ID_FIELD = "saslOptions.awsAccessKeyId";
const CLUSTER_AWS_SECRET_ACCESS_KEY_FIELD = "saslOptions.awsSecretAccessKey";
const CLUSTER_AWS_SESSION_TOKEN_FIELD = "saslOptions.awsSessionToken";
// SSL fields
const CLUSTER_SSL_FIELD = "ssl";
const CLUSTER_SSL_CA_FIELD = "ssl.ca";
const CLUSTER_SSL_KEY_FIELD = "ssl.key";
const CLUSTER_SSL_CERT_FIELD = "ssl.cert";
const CLUSTER_SSL_PASSPHRASE_FIELD = "ssl.passphrase";
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
                // Username/Password fields (for plain, scram-sha-256, scram-sha-512)
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
                },
                // OAUTHBEARER fields
                {
                    id: CLUSTER_OAUTH_TOKEN_ENDPOINT_FIELD,
                    label: "Token Endpoint:",
                    initialValue: `${cluster?.saslOption?.oauthTokenEndpoint || ''}`,
                    type: "textbox",
                    placeholder: 'https://auth.example.com/oauth/token'
                },
                {
                    id: CLUSTER_OAUTH_CLIENT_ID_FIELD,
                    label: "Client ID:",
                    initialValue: `${cluster?.saslOption?.oauthClientId || ''}`,
                    type: "textbox",
                    placeholder: 'OAuth client identifier'
                },
                {
                    id: CLUSTER_OAUTH_CLIENT_SECRET_FIELD,
                    label: "Client Secret:",
                    initialValue: `${cluster?.saslOption?.oauthClientSecret || ''}`,
                    type: "password"
                },
                // AWS MSK IAM fields
                {
                    id: CLUSTER_AWS_REGION_FIELD,
                    label: "AWS Region:",
                    initialValue: `${cluster?.saslOption?.awsRegion || ''}`,
                    type: "textbox",
                    placeholder: 'us-east-1'
                },
                {
                    id: CLUSTER_AWS_ACCESS_KEY_ID_FIELD,
                    label: "Access Key ID:",
                    initialValue: `${cluster?.saslOption?.awsAccessKeyId || ''}`,
                    type: "textbox",
                    placeholder: 'AKIAIOSFODNN7EXAMPLE'
                },
                {
                    id: CLUSTER_AWS_SECRET_ACCESS_KEY_FIELD,
                    label: "Secret Access Key:",
                    initialValue: `${cluster?.saslOption?.awsSecretAccessKey || ''}`,
                    type: "password"
                },
                {
                    id: CLUSTER_AWS_SESSION_TOKEN_FIELD,
                    label: "Session Token:",
                    description: "Optional. Required when using temporary credentials.",
                    initialValue: `${cluster?.saslOption?.awsSessionToken || ''}`,
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
                    id: CLUSTER_SSL_PASSPHRASE_FIELD,
                    label: "Passphrase:",
                    description: "Optional. Passphrase for encrypted private key.",
                    initialValue: `${tlsConnectionOptions?.passphrase || ''}`,
                    type: "password"
                },
                {
                    id: CLUSTER_SSL_REJECT_UNAUTHORIZED_FIELD,
                    label: "Reject Unauthorized Certificates",
                    description: "When disabled, accepts self-signed certificates and hostname mismatches. Use only for development!",
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

        // 3. Determine which auth mechanism is selected
        const mechanism = parameters[CLUSTER_SASL_MECHANISM_FIELD];
        const isUsernamePasswordAuth = mechanism === 'plain' || mechanism === 'scram-sha-256' || mechanism === 'scram-sha-512';
        const isOAuthAuth = mechanism === 'oauthbearer';
        const isAwsAuth = mechanism === 'aws';
        const saslEnabled = mechanism && mechanism !== 'none';

        function isSSLEnabled(data: any) {
            return (data[CLUSTER_SSL_FIELD] === true || data[CLUSTER_SSL_FIELD] === 'true');
        }

        const sslEnabled = isSSLEnabled(parameters);

        // 4. Validate fields based on selected mechanism
        if (isUsernamePasswordAuth) {
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
        }

        if (isOAuthAuth) {
            const tokenEndpoint = parameters[CLUSTER_OAUTH_TOKEN_ENDPOINT_FIELD];
            if (!tokenEndpoint || tokenEndpoint.trim() === '') {
                diagnostics.push(
                    {
                        template: {
                            id: CLUSTER_OAUTH_TOKEN_ENDPOINT_FIELD,
                            content: 'Token endpoint is required for OAUTHBEARER authentication.'
                        },
                        severity: SEVERITY.ERROR
                    }
                );
            } else if (!isValidUrl(tokenEndpoint)) {
                diagnostics.push(
                    {
                        template: {
                            id: CLUSTER_OAUTH_TOKEN_ENDPOINT_FIELD,
                            content: 'Token endpoint must be a valid URL.'
                        },
                        severity: SEVERITY.ERROR
                    }
                );
            }

            const clientId = parameters[CLUSTER_OAUTH_CLIENT_ID_FIELD];
            if (!clientId || clientId.trim() === '') {
                diagnostics.push(
                    {
                        template: {
                            id: CLUSTER_OAUTH_CLIENT_ID_FIELD,
                            content: 'Client ID is required for OAUTHBEARER authentication.'
                        },
                        severity: SEVERITY.ERROR
                    }
                );
            }

            const clientSecret = parameters[CLUSTER_OAUTH_CLIENT_SECRET_FIELD];
            if (!clientSecret || clientSecret.trim() === '') {
                diagnostics.push(
                    {
                        template: {
                            id: CLUSTER_OAUTH_CLIENT_SECRET_FIELD,
                            content: 'Client Secret is required for OAUTHBEARER authentication.'
                        },
                        severity: SEVERITY.ERROR
                    }
                );
            }
        }

        if (isAwsAuth) {
            const region = parameters[CLUSTER_AWS_REGION_FIELD];
            if (!region || region.trim() === '') {
                diagnostics.push(
                    {
                        template: {
                            id: CLUSTER_AWS_REGION_FIELD,
                            content: 'AWS Region is required for AWS MSK IAM authentication.'
                        },
                        severity: SEVERITY.ERROR
                    }
                );
            }

            const accessKeyId = parameters[CLUSTER_AWS_ACCESS_KEY_ID_FIELD];
            if (!accessKeyId || accessKeyId.trim() === '') {
                diagnostics.push(
                    {
                        template: {
                            id: CLUSTER_AWS_ACCESS_KEY_ID_FIELD,
                            content: 'Access Key ID is required for AWS MSK IAM authentication.'
                        },
                        severity: SEVERITY.ERROR
                    }
                );
            }

            const secretAccessKey = parameters[CLUSTER_AWS_SECRET_ACCESS_KEY_FIELD];
            if (!secretAccessKey || secretAccessKey.trim() === '') {
                diagnostics.push(
                    {
                        template: {
                            id: CLUSTER_AWS_SECRET_ACCESS_KEY_FIELD,
                            content: 'Secret Access Key is required for AWS MSK IAM authentication.'
                        },
                        severity: SEVERITY.ERROR
                    }
                );
            }
        }

        // 5. Warn about SSL when authentication is enabled
        if (saslEnabled && !sslEnabled) {
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

        // 6. Validate certificate files
        validateCertificateFile(parameters, CLUSTER_SSL_CA_FIELD, diagnostics);
        validateCertificateFile(parameters, CLUSTER_SSL_KEY_FIELD, diagnostics);
        validateCertificateFile(parameters, CLUSTER_SSL_CERT_FIELD, diagnostics);

        // 7. Manage enabled state for auth fields based on mechanism
        // Username/Password fields
        fieldRefresh.set(CLUSTER_SASL_USERNAME_FIELD, { enabled: isUsernamePasswordAuth });
        fieldRefresh.set(CLUSTER_SASL_PASSWORD_FIELD, { enabled: isUsernamePasswordAuth });

        // OAUTHBEARER fields
        fieldRefresh.set(CLUSTER_OAUTH_TOKEN_ENDPOINT_FIELD, { enabled: isOAuthAuth });
        fieldRefresh.set(CLUSTER_OAUTH_CLIENT_ID_FIELD, { enabled: isOAuthAuth });
        fieldRefresh.set(CLUSTER_OAUTH_CLIENT_SECRET_FIELD, { enabled: isOAuthAuth });

        // AWS fields
        fieldRefresh.set(CLUSTER_AWS_REGION_FIELD, { enabled: isAwsAuth });
        fieldRefresh.set(CLUSTER_AWS_ACCESS_KEY_ID_FIELD, { enabled: isAwsAuth });
        fieldRefresh.set(CLUSTER_AWS_SECRET_ACCESS_KEY_FIELD, { enabled: isAwsAuth });
        fieldRefresh.set(CLUSTER_AWS_SESSION_TOKEN_FIELD, { enabled: isAwsAuth });

        // SSL fields
        fieldRefresh.set(CLUSTER_SSL_CA_FIELD, { enabled: sslEnabled });
        fieldRefresh.set(CLUSTER_SSL_KEY_FIELD, { enabled: sslEnabled });
        fieldRefresh.set(CLUSTER_SSL_CERT_FIELD, { enabled: sslEnabled });
        fieldRefresh.set(CLUSTER_SSL_PASSPHRASE_FIELD, { enabled: sslEnabled });
        fieldRefresh.set(CLUSTER_SSL_REJECT_UNAUTHORIZED_FIELD, { enabled: sslEnabled });

        return { items: diagnostics, fieldRefresh };
    };
}

/**
 * Validates if a string is a valid URL.
 */
function isValidUrl(urlString: string): boolean {
    try {
        new URL(urlString);
        return true;
    } catch {
        return false;
    }
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
    const mechanism = data[CLUSTER_SASL_MECHANISM_FIELD];
    if (!mechanism || mechanism === 'none') {
        return undefined;
    }

    const saslOption: SaslOption = { mechanism: mechanism as SaslMechanism };

    // Username/Password for plain, scram-sha-256, scram-sha-512
    if (mechanism === 'plain' || mechanism === 'scram-sha-256' || mechanism === 'scram-sha-512') {
        saslOption.username = data[CLUSTER_SASL_USERNAME_FIELD];
        saslOption.password = data[CLUSTER_SASL_PASSWORD_FIELD];
    }

    // OAUTHBEARER fields
    if (mechanism === 'oauthbearer') {
        saslOption.oauthTokenEndpoint = data[CLUSTER_OAUTH_TOKEN_ENDPOINT_FIELD];
        saslOption.oauthClientId = data[CLUSTER_OAUTH_CLIENT_ID_FIELD];
        saslOption.oauthClientSecret = data[CLUSTER_OAUTH_CLIENT_SECRET_FIELD];
    }

    // AWS MSK IAM fields
    if (mechanism === 'aws') {
        saslOption.awsRegion = data[CLUSTER_AWS_REGION_FIELD];
        saslOption.awsAccessKeyId = data[CLUSTER_AWS_ACCESS_KEY_ID_FIELD];
        saslOption.awsSecretAccessKey = data[CLUSTER_AWS_SECRET_ACCESS_KEY_FIELD];
        saslOption.awsSessionToken = data[CLUSTER_AWS_SESSION_TOKEN_FIELD] || undefined;
    }

    return saslOption;
}

function createSsl(data: any): SslOption | boolean {
    // First check if SSL is enabled
    const sslEnabled = data[CLUSTER_SSL_FIELD] === true || data[CLUSTER_SSL_FIELD] === 'true';
    
    if (!sslEnabled) {
        return false;
    }
    
    const ca = data[CLUSTER_SSL_CA_FIELD];
    const key = data[CLUSTER_SSL_KEY_FIELD];
    const cert = data[CLUSTER_SSL_CERT_FIELD];
    const passphrase = data[CLUSTER_SSL_PASSPHRASE_FIELD];
    const rejectUnauthorized = data[CLUSTER_SSL_REJECT_UNAUTHORIZED_FIELD];
    
    // If any SSL certificate option is configured, return SslOption object
    if (ca || key || cert || passphrase) {
        const sslOption: SslOption = {
            ca,
            key,
            cert,
            passphrase
        };
        
        // Only set rejectUnauthorized if explicitly set to false
        // (defaults to true if undefined, which is secure by default)
        if (rejectUnauthorized === false || rejectUnauthorized === 'false') {
            sslOption.rejectUnauthorized = false;
        }
        
        return sslOption;
    }
    
    // SSL enabled but no certificate options - check rejectUnauthorized
    if (rejectUnauthorized === false || rejectUnauthorized === 'false') {
        return { rejectUnauthorized: false };
    }
    
    // Simple SSL enabled (use default certificates)
    return true;
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
