declare module "jks-js" {
    export interface PemEntry {
        cert?: string;
        key?: string;
        ca?: string;
    }

    export function toPem(keystore: Buffer, keystorePassword: string, pemPassword?: string): Record<string, PemEntry>;
}
