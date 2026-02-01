import * as vscode from "vscode";

/**
 * Types of secrets that can be stored for a cluster.
 */
export type SecretType = 'password' | 'oauthClientSecret' | 'awsSecretAccessKey' | 'awsSessionToken';

/**
 * Manager for securely storing sensitive cluster credentials using VS Code's SecretStorage API.
 * Passwords are stored in the OS-level keychain (macOS Keychain, Windows Credential Manager, Linux Secret Service).
 * 
 * Falls back to Memento storage in environments that don't support SecretStorage (e.g., Eclipse Theia).
 */
export class SecretsStorage {
    private static instance: SecretsStorage;
    private readonly secrets?: vscode.SecretStorage;
    private readonly fallbackStorage?: vscode.Memento;
    private readonly isUsingFallback: boolean;
    
    private constructor(secrets: vscode.SecretStorage | undefined, fallbackStorage: vscode.Memento) {
        this.secrets = secrets;
        this.fallbackStorage = fallbackStorage;
        this.isUsingFallback = !secrets;
        
        if (this.isUsingFallback) {
            console.warn('SecretStorage API not available. Using fallback storage for credentials. Passwords will be stored less securely.');
        }
    }

    static getInstance(): SecretsStorage {
        if (!SecretsStorage.instance) {
            throw new Error("SecretsStorage not initialized. Call SecretsStorage.initialize() first.");
        }
        return SecretsStorage.instance;
    }

    static initialize(secrets: vscode.SecretStorage | undefined, fallbackStorage: vscode.Memento): void {
        SecretsStorage.instance = new SecretsStorage(secrets, fallbackStorage);
    }

    /**
     * Returns true if the extension is running in an environment without SecretStorage support.
     */
    isInFallbackMode(): boolean {
        return this.isUsingFallback;
    }

    /**
     * Stores a password for a cluster.
     * @param clusterId The cluster ID
     * @param password The password to store
     */
    async storePassword(clusterId: string, password: string): Promise<void> {
        return this.storeSecret(clusterId, 'password', password);
    }

    /**
     * Retrieves a password for a cluster.
     * @param clusterId The cluster ID
     * @returns The password, or undefined if not found
     */
    async getPassword(clusterId: string): Promise<string | undefined> {
        return this.getSecret(clusterId, 'password');
    }

    /**
     * Deletes a password for a cluster.
     * @param clusterId The cluster ID
     */
    async deletePassword(clusterId: string): Promise<void> {
        return this.deleteSecret(clusterId, 'password');
    }

    /**
     * Stores a secret value for a cluster.
     * @param clusterId The cluster ID
     * @param secretType The type of secret
     * @param value The secret value to store
     */
    async storeSecret(clusterId: string, secretType: SecretType, value: string): Promise<void> {
        const key = this.getSecretKey(clusterId, secretType);
        
        if (this.secrets) {
            await this.secrets.store(key, value);
        } else {
            await this.fallbackStorage!.update(key, value);
        }
    }

    /**
     * Retrieves a secret value for a cluster.
     * @param clusterId The cluster ID
     * @param secretType The type of secret
     * @returns The secret value, or undefined if not found
     */
    async getSecret(clusterId: string, secretType: SecretType): Promise<string | undefined> {
        const key = this.getSecretKey(clusterId, secretType);
        
        if (this.secrets) {
            return await this.secrets.get(key);
        } else {
            return this.fallbackStorage!.get<string>(key);
        }
    }

    /**
     * Deletes a secret value for a cluster.
     * @param clusterId The cluster ID
     * @param secretType The type of secret
     */
    async deleteSecret(clusterId: string, secretType: SecretType): Promise<void> {
        const key = this.getSecretKey(clusterId, secretType);
        
        if (this.secrets) {
            await this.secrets.delete(key);
        } else {
            await this.fallbackStorage!.update(key, undefined);
        }
    }

    /**
     * Deletes all secrets for a cluster.
     * @param clusterId The cluster ID
     */
    async deleteAllSecrets(clusterId: string): Promise<void> {
        const secretTypes: SecretType[] = ['password', 'oauthClientSecret', 'awsSecretAccessKey', 'awsSessionToken'];
        await Promise.all(secretTypes.map(type => this.deleteSecret(clusterId, type)));
    }

    /**
     * Deletes all passwords for all clusters (useful for cleanup/testing).
     * Note: This requires knowing all cluster IDs since SecretStorage doesn't support listing all keys.
     * @param clusterIds Array of cluster IDs
     */
    async deleteAllPasswords(clusterIds: string[]): Promise<void> {
        await Promise.all(clusterIds.map(id => this.deleteAllSecrets(id)));
    }

    private getSecretKey(clusterId: string, secretType: SecretType): string {
        return `kafka.cluster.${clusterId}.${secretType}`;
    }
}
