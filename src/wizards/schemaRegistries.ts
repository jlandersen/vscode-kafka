/* eslint-disable @typescript-eslint/naming-convention */
import * as vscode from "vscode";
import {
    BUTTONS,
    FieldDefinitionState,
    PerformFinishResponse,
    SEVERITY,
    UPDATE_TITLE,
    ValidatorResponseItem,
    WebviewWizard,
    WizardDefinition,
    WizardPageFieldDefinition,
    WizardPageSectionDefinition
} from "@redhat-developer/vscode-wizard";

import { ExplorerRefreshTarget } from "../explorer";
import { SchemaRegistry } from "../schema-registry";
import { SchemaRegistrySettings } from "../settings";
import { validateFile } from "./validators";

const REGISTRY_FORM_PAGE = "schema-registry-form-page";

const REGISTRY_NAME_FIELD = "name";
const REGISTRY_URL_FIELD = "connection.url";
const REGISTRY_NAMING_STRATEGY_FIELD = "connection.namingStrategy";
const REGISTRY_AUTH_USERNAME_FIELD = "connection.auth.username";
const REGISTRY_AUTH_PASSWORD_FIELD = "connection.auth.password";
const REGISTRY_TLS_CA_FIELD = "connection.tls.ca";
const REGISTRY_TLS_CERT_FIELD = "connection.tls.cert";
const REGISTRY_TLS_KEY_FIELD = "connection.tls.key";
const REGISTRY_TLS_PASSPHRASE_FIELD = "connection.tls.passphrase";
const REGISTRY_TLS_REJECT_UNAUTHORIZED_FIELD = "connection.tls.rejectUnauthorized";

interface ValidationContext {
    schemaRegistrySettings: SchemaRegistrySettings;
    currentSchemaRegistry?: SchemaRegistry;
}

interface NamingStrategyOption {
    id: "TopicNameStrategy" | "RecordNameStrategy" | "TopicRecordNameStrategy";
    name: string;
}

const namingStrategies: NamingStrategyOption[] = [
    { id: "TopicNameStrategy", name: "TopicNameStrategy" },
    { id: "RecordNameStrategy", name: "RecordNameStrategy" },
    { id: "TopicRecordNameStrategy", name: "TopicRecordNameStrategy" }
];

export function openSchemaRegistryForm(
    schemaRegistry: SchemaRegistry | undefined,
    schemaRegistrySettings: SchemaRegistrySettings,
    explorer: ExplorerRefreshTarget,
    context: vscode.ExtensionContext
): void {
    const wizardDef: WizardDefinition = {
        title: schemaRegistry ? `Edit Schema Registry - ${schemaRegistry.name}` : "New Schema Registry",
        showDirtyState: true,
        hideWizardHeader: true,
        pages: [
            {
                id: REGISTRY_FORM_PAGE,
                hideWizardPageHeader: true,
                fields: createFields(schemaRegistry),
                validator: createValidator({ schemaRegistrySettings, currentSchemaRegistry: schemaRegistry })
            }
        ],
        buttons: [{ id: BUTTONS.FINISH, label: "Save" }],
        workflowManager: {
            async performFinish(_wizard: WebviewWizard, data: any) {
                const savedSchemaRegistry = await saveSchemaRegistry(schemaRegistry, schemaRegistrySettings, data);
                explorer.refresh();
                vscode.window.showInformationMessage(`Schema Registry '${savedSchemaRegistry.name}' saved successfully`);

                return new Promise<PerformFinishResponse | null>(resolve => {
                    resolve({
                        close: false,
                        success: true,
                        returnObject: null,
                        templates: [{ id: UPDATE_TITLE, content: `Edit Schema Registry - ${savedSchemaRegistry.name}` }]
                    });
                });
            }
        }
    };

    const wizard = new WebviewWizard(`${schemaRegistry?.id || "new-schema-registry"}`, "schema-registry", context, wizardDef, new Map<string, string>());
    wizard.open();
}

function createFields(schemaRegistry?: SchemaRegistry): (WizardPageFieldDefinition | WizardPageSectionDefinition)[] {
    const tls = schemaRegistry?.connection.tls;

    return [
        {
            id: REGISTRY_NAME_FIELD,
            label: "Name:",
            initialValue: `${schemaRegistry?.name || ""}`,
            type: "textbox",
            placeholder: "Friendly name"
        },
        {
            id: REGISTRY_URL_FIELD,
            label: "URL:",
            initialValue: `${schemaRegistry?.connection.url || ""}`,
            type: "textbox",
            placeholder: "https://registry.example.com"
        },
        {
            id: REGISTRY_NAMING_STRATEGY_FIELD,
            label: "Naming Strategy:",
            initialValue: `${schemaRegistry?.connection.namingStrategy || "TopicNameStrategy"}`,
            type: "select",
            optionProvider: {
                getItems() {
                    return namingStrategies;
                },
                getValueItem(item: NamingStrategyOption) {
                    return item.id;
                },
                getLabelItem(item: NamingStrategyOption) {
                    return item.name;
                }
            }
        },
        {
            id: "auth-section",
            label: "Authentication",
            childFields: [
                {
                    id: REGISTRY_AUTH_USERNAME_FIELD,
                    label: "Username:",
                    initialValue: `${schemaRegistry?.connection.auth?.username || ""}`,
                    type: "textbox"
                },
                {
                    id: REGISTRY_AUTH_PASSWORD_FIELD,
                    label: "Password:",
                    initialValue: `${schemaRegistry?.connection.auth?.password || ""}`,
                    type: "password"
                }
            ]
        },
        {
            id: "tls-section",
            label: "TLS",
            childFields: [
                {
                    id: REGISTRY_TLS_CA_FIELD,
                    label: "Certificate Authority:",
                    initialValue: tls?.ca,
                    type: "file-picker",
                    placeholder: "Select file in PEM format.",
                    dialogOptions: {
                        canSelectMany: false,
                        filters: {
                            All: ["*"],
                            PEM: ["pem", "crt", "cer", "key"]
                        }
                    }
                },
                {
                    id: REGISTRY_TLS_CERT_FIELD,
                    label: "Client certificate:",
                    initialValue: tls?.cert,
                    type: "file-picker",
                    placeholder: "Select file in PEM format.",
                    dialogOptions: {
                        canSelectMany: false,
                        filters: {
                            All: ["*"],
                            PEM: ["pem", "crt", "cer", "key"]
                        }
                    }
                },
                {
                    id: REGISTRY_TLS_KEY_FIELD,
                    label: "Client key:",
                    initialValue: tls?.key,
                    type: "file-picker",
                    placeholder: "Select file in PEM format.",
                    dialogOptions: {
                        canSelectMany: false,
                        filters: {
                            All: ["*"],
                            PEM: ["pem", "crt", "cer", "key"]
                        }
                    }
                },
                {
                    id: REGISTRY_TLS_PASSPHRASE_FIELD,
                    label: "Passphrase:",
                    initialValue: `${tls?.passphrase || ""}`,
                    type: "password",
                    description: "Optional. Passphrase for encrypted private key."
                },
                {
                    id: REGISTRY_TLS_REJECT_UNAUTHORIZED_FIELD,
                    label: "Reject Unauthorized Certificates",
                    initialValue: tls?.rejectUnauthorized !== false ? "true" : undefined,
                    type: "checkbox"
                }
            ]
        }
    ];
}

function createValidator(validationContext: ValidationContext) {
    return (parameters?: any) => {
        const diagnostics: ValidatorResponseItem[] = [];
        const fieldRefresh = new Map<string, FieldDefinitionState>();
        const currentSchemaRegistry = validationContext.currentSchemaRegistry;

        const allSchemaRegistries = validationContext.schemaRegistrySettings.getAll();
        const otherRegistryNames = allSchemaRegistries
            .filter(schemaRegistry => schemaRegistry.id !== currentSchemaRegistry?.id)
            .map(schemaRegistry => schemaRegistry.name.toLowerCase());

        const name = getTrimmedString(parameters[REGISTRY_NAME_FIELD]);
        if (!name) {
            diagnostics.push(buildDiagnostic(REGISTRY_NAME_FIELD, "Schema Registry name is required."));
        } else if (otherRegistryNames.includes(name.toLowerCase())) {
            diagnostics.push(buildDiagnostic(REGISTRY_NAME_FIELD, `Schema Registry '${name}' already exists.`));
        }

        const url = getTrimmedString(parameters[REGISTRY_URL_FIELD]);
        if (!url) {
            diagnostics.push(buildDiagnostic(REGISTRY_URL_FIELD, "Schema Registry URL is required."));
        } else if (!isValidUrl(url)) {
            diagnostics.push(buildDiagnostic(REGISTRY_URL_FIELD, "Schema Registry URL must be a valid URL."));
        }

        const username = getTrimmedString(parameters[REGISTRY_AUTH_USERNAME_FIELD]);
        const password = getTrimmedString(parameters[REGISTRY_AUTH_PASSWORD_FIELD]);
        if (password && !username) {
            diagnostics.push(buildDiagnostic(REGISTRY_AUTH_USERNAME_FIELD, "Username is required when password is set."));
        }
        if (username && !password && !currentSchemaRegistry?.connection.auth?.password) {
            diagnostics.push(buildDiagnostic(REGISTRY_AUTH_PASSWORD_FIELD, "Password is recommended when username is set.", SEVERITY.WARN));
        }

        validateTlsFile(parameters, REGISTRY_TLS_CA_FIELD, diagnostics);
        validateTlsFile(parameters, REGISTRY_TLS_CERT_FIELD, diagnostics);
        validateTlsFile(parameters, REGISTRY_TLS_KEY_FIELD, diagnostics);

        setFieldState(fieldRefresh, REGISTRY_AUTH_PASSWORD_FIELD, { enabled: true });

        return { items: diagnostics, fieldRefresh };
    };
}

function buildDiagnostic(fieldId: string, message: string, severity: SEVERITY = SEVERITY.ERROR): ValidatorResponseItem {
    return {
        template: {
            id: fieldId,
            content: message
        },
        severity
    };
}

function setFieldState(fieldRefresh: Map<string, FieldDefinitionState>, fieldId: string, state: FieldDefinitionState): void {
    fieldRefresh.set(fieldId, {
        ...fieldRefresh.get(fieldId),
        ...state
    });
}

function validateTlsFile(parameters: any, fieldId: string, diagnostics: ValidatorResponseItem[]): void {
    const path = getTrimmedString(parameters[fieldId]);
    if (!path) {
        return;
    }
    const validationError = validateFile(path);
    if (validationError) {
        diagnostics.push(buildDiagnostic(fieldId, validationError));
    }
}

function isValidUrl(urlString: string): boolean {
    try {
        new URL(urlString);
        return true;
    } catch {
        return false;
    }
}

function getTrimmedString(value: unknown): string {
    return typeof value === "string" ? value.trim() : "";
}

async function saveSchemaRegistry(
    currentSchemaRegistry: SchemaRegistry | undefined,
    schemaRegistrySettings: SchemaRegistrySettings,
    data: any
): Promise<SchemaRegistry> {
    const name = getTrimmedString(data[REGISTRY_NAME_FIELD]);
    const url = getTrimmedString(data[REGISTRY_URL_FIELD]);
    const username = getTrimmedString(data[REGISTRY_AUTH_USERNAME_FIELD]);
    const password = getTrimmedString(data[REGISTRY_AUTH_PASSWORD_FIELD]);

    const connection: SchemaRegistry["connection"] = {
        url,
        namingStrategy: data[REGISTRY_NAMING_STRATEGY_FIELD] || "TopicNameStrategy"
    };

    if (username) {
        connection.auth = {
            username,
            password: password || currentSchemaRegistry?.connection.auth?.password
        };
    }

    const tls = createTlsConfig(data);
    if (tls) {
        connection.tls = tls;
    }

    const schemaRegistry: SchemaRegistry = {
        id: currentSchemaRegistry?.id || createSchemaRegistryId(name),
        name,
        connection
    };

    await schemaRegistrySettings.upsert(schemaRegistry);
    return schemaRegistry;
}

function createTlsConfig(data: any): SchemaRegistry["connection"]["tls"] | undefined {
    const ca = getTrimmedString(data[REGISTRY_TLS_CA_FIELD]);
    const cert = getTrimmedString(data[REGISTRY_TLS_CERT_FIELD]);
    const key = getTrimmedString(data[REGISTRY_TLS_KEY_FIELD]);
    const passphrase = getTrimmedString(data[REGISTRY_TLS_PASSPHRASE_FIELD]);
    const rejectUnauthorized = isChecked(data[REGISTRY_TLS_REJECT_UNAUTHORIZED_FIELD]);

    if (!ca && !cert && !key && !passphrase && rejectUnauthorized) {
        return undefined;
    }

    return {
        ca: ca || undefined,
        cert: cert || undefined,
        key: key || undefined,
        passphrase: passphrase || undefined,
        rejectUnauthorized
    };
}

function isChecked(value: unknown): boolean {
    return value === true || value === "true";
}

function createSchemaRegistryId(name: string): string {
    const normalizedName = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
    const suffix = Date.now().toString(36);
    return `${normalizedName || "schema-registry"}-${suffix}`;
}
