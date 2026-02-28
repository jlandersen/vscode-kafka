import { Cluster } from "../client";

export type SchemaType = "AVRO" | "PROTOBUF" | "JSON";

export interface SchemaRegistryAuth {
    username: string;
    password?: string;
}

export interface SchemaRegistryTls {
    ca?: string;
    cert?: string;
    key?: string;
    passphrase?: string;
    rejectUnauthorized?: boolean;
}

export interface SchemaRegistryConnection {
    url: string;
    namingStrategy?: "TopicNameStrategy" | "RecordNameStrategy" | "TopicRecordNameStrategy";
    auth?: SchemaRegistryAuth;
    tls?: SchemaRegistryTls;
}

export interface SchemaRegistry {
    id: string;
    name: string;
    connection: SchemaRegistryConnection;
}

export interface SchemaRegistryRef {
    id: string;
    name: string;
    clusterId: string;
    clusterName: string;
    connection: SchemaRegistryConnection;
}

export interface SubjectSummary {
    name: string;
}

export interface VersionSummary {
    subject: string;
    version: number;
}

export interface SchemaReference {
    name: string;
    subject: string;
    version: number;
}

export interface SchemaVersionDetail {
    subject: string;
    version: number;
    schemaType: SchemaType;
    schema: string;
    id: number;
    references: SchemaReference[];
}

export interface SchemaRegistryProvider {
    listSubjects(registryRef: SchemaRegistryRef): Promise<SubjectSummary[]>;
    listSubjectVersions(registryRef: SchemaRegistryRef, subject: string): Promise<VersionSummary[]>;
    getSchemaVersion(registryRef: SchemaRegistryRef, subject: string, version: number | "latest"): Promise<SchemaVersionDetail>;
}

export interface SchemaRegistryProviderFactory {
    getProvider(registryRef: SchemaRegistryRef | undefined): SchemaRegistryProvider | undefined;
    getRegistryRef(cluster: Cluster): Promise<SchemaRegistryRef | undefined>;
}
