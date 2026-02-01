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
    // Create a mock extension context for testing
    // In a real VS Code extension test, we should get this from the activated extension,
    // but due to module isolation, we create a minimal version here
    
    // Create a simple in-memory storage for testing
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

    // Try to get the real secrets API if available
    let secrets: vscode.SecretStorage | undefined;
    try {
        // Try to access secrets from the activated extension
        const extension = vscode.extensions.getExtension("jeppeandersen.vscode-kafka");
        if (extension?.isActive) {
            // The extension should have initialized its own Context/SecretsStorage
            // We're just ensuring the test module context has access
            const { Context } = await import('../../context');
            const { SecretsStorage } = await import('../../settings/secretsStorage');
            
            // Check if already initialized
            if (Context.current) {
                try {
                    SecretsStorage.getInstance();
                    return; // Already initialized, nothing to do
                } catch (e) {
                    // Context exists but SecretsStorage not initialized
                }
            }
        }
    } catch (e) {
        // Extension not available or not activated
    }

    // If we get here, we need to initialize manually
    // Create a minimal ExtensionContext-like object
    const mockContext = {
        globalState,
        workspaceState: globalState, // Use same mock for workspace state
        secrets: undefined, // Will use fallback storage
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

    // Initialize Context and SecretsStorage in the test module's context
    const { Context } = await import('../../context');
    const { SecretsStorage } = await import('../../settings/secretsStorage');
    
    if (!Context.current) {
        Context.register(mockContext);
    }
    
    try {
        SecretsStorage.getInstance();
    } catch (e) {
        // Not initialized, so initialize it
        SecretsStorage.initialize(secrets, globalState);
    }
}
