/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import { WebviewWizard, WizardDefinition, SEVERITY, UPDATE_TITLE, WizardPageFieldDefinition, WizardPageSectionDefinition, BUTTONS, PerformFinishResponse, IWizardPage, ValidatorResponseItem, FieldDefinitionState } from "@redhat-developer/vscode-wizard";
import { ClientAccessor, Cluster, SaslMechanism, SaslOption, SslOption } from "../client";
import { ClusterSettings, SchemaRegistrySettings } from "../settings";
import { validateAuthentificationUserName, validateBroker, validateClusterName, validateFile } from "./validators";
import { KafkaExplorer } from "../explorer";
import { ClusterProvider, defaultClusterProviderId, getClusterProviders } from "../kafka-extensions/registry";
import { showErrorMessage } from "./multiStepInput";
import { SaveClusterCommandHandler } from "../commands";

export function openClusterWizard(
    clusterSettings: ClusterSettings,
    schemaRegistrySettings: SchemaRegistrySettings,
    clientAccessor: ClientAccessor,
    explorer: KafkaExplorer,
    context: vscode.ExtensionContext
) {
    const providers = getClusterProviders();
    if (providers.length === 1) {
        return openClusterForm(undefined, clusterSettings, schemaRegistrySettings, clientAccessor, explorer, context);
    }
    const wiz: WebviewWizard = createClusterWizard(providers, clusterSettings, schemaRegistrySettings, clientAccessor, explorer, context);
    wiz.open();
}

export function openClusterForm(
    cluster: Cluster | undefined,
    clusterSettings: ClusterSettings,
    schemaRegistrySettings: SchemaRegistrySettings,
    clientAccessor: ClientAccessor,
    explorer: KafkaExplorer,
    context: vscode.ExtensionContext
) {
    const wiz: WebviewWizard = createEditClusterForm(cluster, clusterSettings, schemaRegistrySettings, clientAccessor, explorer, context);
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
    currentClusterName?: string;
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
const CLUSTER_SASL_JAAS_CONFIG_FIELD = "saslOptions.jaasConfig";
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
const CLUSTER_SSL_TRUSTSTORE_FIELD = "ssl.truststore";
const CLUSTER_SSL_TRUSTSTORE_PASSWORD_FIELD = "ssl.truststorePassword";
const CLUSTER_SSL_REJECT_UNAUTHORIZED_FIELD = "ssl.rejectUnauthorized";
const CLUSTER_SSL_SERVER_NAME_FIELD = "ssl.serverName";
// Schema Registry fields
const CLUSTER_SCHEMA_REGISTRY_ID_FIELD = "schemaRegistryId";

// --- Wizard page ID
const CLUSTER_PROVIDER_PAGE = 'cluster-provider-page';
const CLUSTER_FORM_PAGE = 'cluster-form-page';

function createClusterWizard(
    providers: ClusterProvider[],
    clusterSettings: ClusterSettings,
    schemaRegistrySettings: SchemaRegistrySettings,
    clientAccessor: ClientAccessor,
    explorer: KafkaExplorer,
    context: vscode.ExtensionContext
): WebviewWizard {
    const validationContext = {
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
                fields: createFields(schemaRegistrySettings),
                validator: createValidator(validationContext),
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
                    openClusterForm(cluster, clusterSettings, schemaRegistrySettings, clientAccessor, explorer, context);
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

function createEditClusterForm(
    cluster: Cluster | undefined,
    clusterSettings: ClusterSettings,
    schemaRegistrySettings: SchemaRegistrySettings,
    clientAccessor: ClientAccessor,
    explorer: KafkaExplorer,
    context: vscode.ExtensionContext
): WebviewWizard {
    const validationContext = {
        clusterSettings: clusterSettings,
        wizard: null,
        currentClusterName: cluster?.name
    } as ValidationContext;

    const clusterWizardDef: WizardDefinition = {
        title: cluster ? `Edit Cluster - ${cluster.name}` : 'New Cluster',
        showDirtyState: true,
        hideWizardHeader: true,
        pages: [
            {
                id: `cluster-form-page'}`,
                hideWizardPageHeader: true,
                fields: createFields(schemaRegistrySettings, cluster),
                validator: createValidator(validationContext)
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
    validationContext.wizard = wizard;
    return wizard;
}

function createFields(schemaRegistrySettings: SchemaRegistrySettings, cluster?: Cluster): (WizardPageFieldDefinition | WizardPageSectionDefinition)[] {
    const tlsConnectionOptions: SslOption | undefined = <SslOption>cluster?.ssl;
    const schemaRegistryOptions = [
        { id: "", name: "None" },
        ...schemaRegistrySettings.getAll().map(schemaRegistry => ({ id: schemaRegistry.id, name: schemaRegistry.name }))
    ];
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
                    id: CLUSTER_SASL_JAAS_CONFIG_FIELD,
                    label: "JAAS Config:",
                    type: "textbox",
                    placeholder: 'org.apache.kafka.common.security.scram.ScramLoginModule required username="user" password="pass";',
                    description: "Optional. Parsed live to auto-select mechanism and fill SASL fields."
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
                    id: CLUSTER_SSL_TRUSTSTORE_FIELD,
                    label: "Truststore (JKS):",
                    initialValue: tlsConnectionOptions?.truststore,
                    type: "file-picker",
                    placeholder: "Select truststore in JKS format.",
                    dialogOptions: {
                        canSelectMany: false,
                        filters: {
                            'All': ['*'],
                            'JKS': ['jks']
                        }
                    }
                },
                {
                    id: CLUSTER_SSL_TRUSTSTORE_PASSWORD_FIELD,
                    label: "Truststore password:",
                    description: "Required when truststore is configured.",
                    initialValue: `${tlsConnectionOptions?.truststorePassword || ''}`,
                    type: "password"
                },
                {
                    id: CLUSTER_SSL_REJECT_UNAUTHORIZED_FIELD,
                    label: "Reject Unauthorized Certificates",
                    description: "When disabled, accepts self-signed certificates and hostname mismatches. Use only for development!",
                    initialValue: tlsConnectionOptions?.rejectUnauthorized !== false ? 'true' : undefined,
                    type: "checkbox"
                },
                {
                    id: CLUSTER_SSL_SERVER_NAME_FIELD,
                    label: "Use Server Name Indication (SNI)",
                    description: "Send the broker hostname during the TLS handshake. Enable when connecting through a proxy or load balancer.",
                    initialValue: tlsConnectionOptions?.serverName ? 'true' : undefined,
                    type: "checkbox"
                }
            ]
        },
        {
            id: 'schema-registry-section',
            label: 'Schema Registry',
            childFields: [
                {
                    id: CLUSTER_SCHEMA_REGISTRY_ID_FIELD,
                    label: "Registry:",
                    initialValue: `${cluster?.schemaRegistryId || ''}`,
                    type: "select",
                    optionProvider: {
                        getItems() {
                            return schemaRegistryOptions;
                        },
                        getValueItem(item: { id: string; name: string }) {
                            return item.id;
                        },
                        getLabelItem(item: { id: string; name: string }) {
                            return item.name;
                        }
                    }
                }
            ]
        }
    ];
}

function createValidator(validationContext: ValidationContext) {
    return (parameters?: any) => {
        const currentClusterName = validationContext.currentClusterName;
        const diagnostics: Array<ValidatorResponseItem> = [];
        const fieldRefresh = new Map<string, FieldDefinitionState>();

        // 1. Validate cluster name
        const clusterSettings = validationContext.clusterSettings;
        const existingClusterNames = clusterSettings.getAll()
            .filter(c => currentClusterName === undefined || c.name !== currentClusterName)
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
        let mechanism = parameters[CLUSTER_SASL_MECHANISM_FIELD];
        const jaasConfig = parameters[CLUSTER_SASL_JAAS_CONFIG_FIELD];
        const jaasOptions = parseJaasConfigOptions(jaasConfig);
        const inferredMechanism = inferMechanismFromJaasConfig(jaasConfig, jaasOptions);
        if (inferredMechanism && (!mechanism || mechanism === 'none')) {
            mechanism = inferredMechanism;
            parameters[CLUSTER_SASL_MECHANISM_FIELD] = inferredMechanism;
            setFieldState(fieldRefresh, CLUSTER_SASL_MECHANISM_FIELD, { forceRefresh: true });
        }

        const { isUsernamePasswordAuth, isOAuthAuth, isAwsAuth, isJaasCompatibleAuth } = getAuthFieldState(mechanism);
        const saslEnabled = mechanism && mechanism !== 'none';

        applyJaasAutofill(parameters, mechanism, jaasOptions, fieldRefresh);

        function isSSLEnabled(data: any) {
            return (data[CLUSTER_SSL_FIELD] === true || data[CLUSTER_SSL_FIELD] === 'true');
        }

        const sslEnabled = isSSLEnabled(parameters);

        // 4. Validate fields based on selected mechanism
        if (isUsernamePasswordAuth) {
            const username = parameters[CLUSTER_SASL_USERNAME_FIELD] || jaasOptions.username;
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
            const tokenEndpoint = parameters[CLUSTER_OAUTH_TOKEN_ENDPOINT_FIELD] || jaasOptions["oauth.token.endpoint.uri"];
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

            const clientId = parameters[CLUSTER_OAUTH_CLIENT_ID_FIELD] || jaasOptions["oauth.client.id"];
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

            const clientSecret = parameters[CLUSTER_OAUTH_CLIENT_SECRET_FIELD] || jaasOptions["oauth.client.secret"];
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
        validateCertificateFile(parameters, CLUSTER_SSL_TRUSTSTORE_FIELD, diagnostics);

        if (parameters[CLUSTER_SSL_TRUSTSTORE_FIELD] && !parameters[CLUSTER_SSL_TRUSTSTORE_PASSWORD_FIELD]) {
            diagnostics.push(
                {
                    template: {
                        id: CLUSTER_SSL_TRUSTSTORE_PASSWORD_FIELD,
                        content: 'Truststore password is required when a truststore is configured.'
                    },
                    severity: SEVERITY.ERROR
                }
            );
        }

        // 7. Manage enabled state for auth fields based on mechanism
        setFieldState(fieldRefresh, CLUSTER_SASL_JAAS_CONFIG_FIELD, { enabled: isJaasCompatibleAuth });

        // Username/Password fields
        setFieldState(fieldRefresh, CLUSTER_SASL_USERNAME_FIELD, { enabled: isUsernamePasswordAuth });
        setFieldState(fieldRefresh, CLUSTER_SASL_PASSWORD_FIELD, { enabled: isUsernamePasswordAuth });

        // OAUTHBEARER fields
        setFieldState(fieldRefresh, CLUSTER_OAUTH_TOKEN_ENDPOINT_FIELD, { enabled: isOAuthAuth });
        setFieldState(fieldRefresh, CLUSTER_OAUTH_CLIENT_ID_FIELD, { enabled: isOAuthAuth });
        setFieldState(fieldRefresh, CLUSTER_OAUTH_CLIENT_SECRET_FIELD, { enabled: isOAuthAuth });

        // AWS fields
        setFieldState(fieldRefresh, CLUSTER_AWS_REGION_FIELD, { enabled: isAwsAuth });
        setFieldState(fieldRefresh, CLUSTER_AWS_ACCESS_KEY_ID_FIELD, { enabled: isAwsAuth });
        setFieldState(fieldRefresh, CLUSTER_AWS_SECRET_ACCESS_KEY_FIELD, { enabled: isAwsAuth });
        setFieldState(fieldRefresh, CLUSTER_AWS_SESSION_TOKEN_FIELD, { enabled: isAwsAuth });

        // SSL fields
        setFieldState(fieldRefresh, CLUSTER_SSL_CA_FIELD, { enabled: sslEnabled });
        setFieldState(fieldRefresh, CLUSTER_SSL_KEY_FIELD, { enabled: sslEnabled });
        setFieldState(fieldRefresh, CLUSTER_SSL_CERT_FIELD, { enabled: sslEnabled });
        setFieldState(fieldRefresh, CLUSTER_SSL_PASSPHRASE_FIELD, { enabled: sslEnabled });
        setFieldState(fieldRefresh, CLUSTER_SSL_TRUSTSTORE_FIELD, { enabled: sslEnabled });
        setFieldState(fieldRefresh, CLUSTER_SSL_TRUSTSTORE_PASSWORD_FIELD, { enabled: sslEnabled });
        setFieldState(fieldRefresh, CLUSTER_SSL_REJECT_UNAUTHORIZED_FIELD, { enabled: sslEnabled });
        setFieldState(fieldRefresh, CLUSTER_SSL_SERVER_NAME_FIELD, { enabled: sslEnabled });

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
    cluster.schemaRegistryId = data[CLUSTER_SCHEMA_REGISTRY_ID_FIELD] || undefined;
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
    const jaasOptions = parseJaasConfigOptions(data[CLUSTER_SASL_JAAS_CONFIG_FIELD]);

    // Username/Password for plain, scram-sha-256, scram-sha-512
    if (mechanism === 'plain' || mechanism === 'scram-sha-256' || mechanism === 'scram-sha-512') {
        saslOption.username = data[CLUSTER_SASL_USERNAME_FIELD] || jaasOptions.username;
        saslOption.password = data[CLUSTER_SASL_PASSWORD_FIELD] || jaasOptions.password;
    }

    // OAUTHBEARER fields
    if (mechanism === 'oauthbearer') {
        saslOption.oauthTokenEndpoint = data[CLUSTER_OAUTH_TOKEN_ENDPOINT_FIELD] || jaasOptions["oauth.token.endpoint.uri"];
        saslOption.oauthClientId = data[CLUSTER_OAUTH_CLIENT_ID_FIELD] || jaasOptions["oauth.client.id"];
        saslOption.oauthClientSecret = data[CLUSTER_OAUTH_CLIENT_SECRET_FIELD] || jaasOptions["oauth.client.secret"];
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
    const truststore = data[CLUSTER_SSL_TRUSTSTORE_FIELD];
    const truststorePassword = data[CLUSTER_SSL_TRUSTSTORE_PASSWORD_FIELD];
    const rejectUnauthorized = data[CLUSTER_SSL_REJECT_UNAUTHORIZED_FIELD];
    const serverName = data[CLUSTER_SSL_SERVER_NAME_FIELD] === true || data[CLUSTER_SSL_SERVER_NAME_FIELD] === 'true';
    
    // If any SSL certificate option is configured, return SslOption object
    if (ca || key || cert || passphrase || truststore || truststorePassword || serverName) {
        const sslOption: SslOption = {
            ca,
            key,
            cert,
            passphrase,
            truststore,
            truststorePassword
        };
        
        // Only set rejectUnauthorized if explicitly set to false
        // (defaults to true if undefined, which is secure by default)
        if (rejectUnauthorized === false || rejectUnauthorized === 'false') {
            sslOption.rejectUnauthorized = false;
        }

        if (serverName) {
            sslOption.serverName = true;
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

function parseJaasConfigOptions(jaasConfig?: string): Record<string, string> {
    if (!jaasConfig) {
        return {};
    }

    const options: Record<string, string> = {};
    const optionRegex = /([A-Za-z0-9._-]+)\s*=\s*("(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s;]+)/g;

    for (const match of jaasConfig.matchAll(optionRegex)) {
        const key = match[1];
        let value = match[2];
        if (!key || !value) {
            continue;
        }

        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }

        value = value
            .replace(/\\"/g, '"')
            .replace(/\\'/g, "'")
            .replace(/\\\\/g, "\\");

        options[key] = value;
    }

    return options;
}

function inferMechanismFromJaasConfig(jaasConfig: string | undefined, jaasOptions: Record<string, string>): SaslMechanism | undefined {
    if (!jaasConfig || jaasConfig.trim().length === 0) {
        return undefined;
    }

    const lowerJaasConfig = jaasConfig.toLowerCase();

    if (lowerJaasConfig.includes('oauthbearerloginmodule') ||
        jaasOptions["oauth.token.endpoint.uri"] ||
        jaasOptions["oauth.client.id"] ||
        jaasOptions["oauth.client.secret"]) {
        return 'oauthbearer';
    }

    if (lowerJaasConfig.includes('plainloginmodule')) {
        return 'plain';
    }

    if (lowerJaasConfig.includes('scram-sha-512')) {
        return 'scram-sha-512';
    }

    if (lowerJaasConfig.includes('scram-sha-256') || lowerJaasConfig.includes('scramloginmodule')) {
        return 'scram-sha-256';
    }

    return undefined;
}

function getAuthFieldState(mechanism: string | undefined) {
    const isUsernamePasswordAuth = mechanism === 'plain' || mechanism === 'scram-sha-256' || mechanism === 'scram-sha-512';
    const isOAuthAuth = mechanism === 'oauthbearer';
    const isAwsAuth = mechanism === 'aws';
    const isJaasCompatibleAuth = !isAwsAuth;

    return {
        isUsernamePasswordAuth,
        isOAuthAuth,
        isAwsAuth,
        isJaasCompatibleAuth
    };
}

export const __clusterWizardTestHooks = {
    parseJaasConfigOptions,
    inferMechanismFromJaasConfig,
    getAuthFieldState,
    createSsl
};

function applyJaasAutofill(
    parameters: any,
    mechanism: string,
    jaasOptions: Record<string, string>,
    fieldRefresh: Map<string, FieldDefinitionState>
) {
    if (!jaasOptions || Object.keys(jaasOptions).length === 0) {
        return;
    }

    if (mechanism === 'plain' || mechanism === 'scram-sha-256' || mechanism === 'scram-sha-512') {
        autofillField(parameters, fieldRefresh, CLUSTER_SASL_USERNAME_FIELD, jaasOptions.username);
        autofillField(parameters, fieldRefresh, CLUSTER_SASL_PASSWORD_FIELD, jaasOptions.password);
    }

    if (mechanism === 'oauthbearer') {
        autofillField(parameters, fieldRefresh, CLUSTER_OAUTH_TOKEN_ENDPOINT_FIELD, jaasOptions["oauth.token.endpoint.uri"]);
        autofillField(parameters, fieldRefresh, CLUSTER_OAUTH_CLIENT_ID_FIELD, jaasOptions["oauth.client.id"]);
        autofillField(parameters, fieldRefresh, CLUSTER_OAUTH_CLIENT_SECRET_FIELD, jaasOptions["oauth.client.secret"]);
    }
}

function autofillField(
    parameters: any,
    fieldRefresh: Map<string, FieldDefinitionState>,
    fieldId: string,
    value?: string
) {
    if (!value || parameters[fieldId]) {
        return;
    }
    parameters[fieldId] = value;
    setFieldState(fieldRefresh, fieldId, { forceRefresh: true });
}

function setFieldState(
    fieldRefresh: Map<string, FieldDefinitionState>,
    fieldId: string,
    state: FieldDefinitionState
) {
    const existing = fieldRefresh.get(fieldId) || {};
    fieldRefresh.set(fieldId, {
        ...existing,
        ...state
    });
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
