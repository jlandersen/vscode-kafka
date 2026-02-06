/**
 * Test setup utilities for integration tests.
 * 
 * Provides helpers to initialize Context and SecretsStorage in the test environment.
 */

import * as vscode from 'vscode';

/**
 * Initializes Context and SecretsStorage for testing.
 * This must be called before any code that depends on these singletons.
 * 
 * Note: In the test environment, the extension runs in a separate module context,
 * so we need to explicitly initialize these in the test's module context.
 */
export async function initializeTestEnvironment(): Promise<void> {
    const storage = new Map<string, any>();
    const globalState = {
        keys: () => Array.from(storage.keys()),
        get: <T>(key: string, defaultValue?: T) => storage.has(key) ? storage.get(key) : defaultValue,
        update: async (key: string, value: any) => {
            if (value === undefined) {
                storage.delete(key);
            } else {
                storage.set(key, value);
            }
        },
        setKeysForSync: (keys: readonly string[]) => { }
    } as vscode.Memento;

    let secrets: vscode.SecretStorage | undefined;
    try {
        const extension = vscode.extensions.getExtension("jeppeandersen.vscode-kafka");
        if (extension?.isActive) {
            const { Context } = await import('../../context');
            const { SecretsStorage } = await import('../../settings/secretsStorage');
            
            if (Context.current) {
                try {
                    SecretsStorage.getInstance();
                    return;
                } catch (e) {
                }
            }
        }
    } catch (e) {
    }

    const mockContext = {
        globalState,
        workspaceState: globalState,
        secrets: undefined,
        subscriptions: [],
        extensionPath: '',
        storagePath: undefined,
        globalStoragePath: '',
        logPath: '',
        extensionUri: vscode.Uri.file(''),
        extensionMode: vscode.ExtensionMode.Test,
        asAbsolutePath: (relativePath: string) => relativePath,
        storageUri: undefined,
        globalStorageUri: vscode.Uri.file(''),
        logUri: vscode.Uri.file(''),
        extension: {} as vscode.Extension<any>,
        environmentVariableCollection: {} as any,
        languageModelAccessInformation: {} as any,
    } as unknown as vscode.ExtensionContext;

    const { Context } = await import('../../context');
    const { SecretsStorage } = await import('../../settings/secretsStorage');
    
    if (!Context.current) {
        Context.register(mockContext);
    }
    
    try {
        SecretsStorage.getInstance();
    } catch (e) {
        SecretsStorage.initialize(secrets, globalState);
    }
}
