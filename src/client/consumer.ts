import { ConsumerGroup, Message } from "kafka-node";

import * as vscode from "vscode";

import { getWorkspaceSettings, InitialConsumerOffset, ClusterSettings } from "../settings";
import { SaslOption } from "./client";

interface ConsumerOptions {
    clusterId: string;
    kafkaHost: string;
    fromOffset: InitialConsumerOffset;
    topic: string;
    sasl?: SaslOption;
}

interface RecordReceivedEvent {
    uri: vscode.Uri;
    record: Message;
}

interface ConsumerChangedStatusEvent {
    uri: vscode.Uri;
    status: "created" | "rebalancing" | "rebalanced";
}

interface ConsumerCollectionChangedEvent {
    created: vscode.Uri[];
    closed: vscode.Uri[];
}

class Consumer implements vscode.Disposable {
    private client?: ConsumerGroup;
    private onDidReceiveMessageEmitter = new vscode.EventEmitter<RecordReceivedEvent>();
    private onDidReceiveErrorEmitter = new vscode.EventEmitter<any>();
    private onDidChangeStatusEmitter = new vscode.EventEmitter<ConsumerChangedStatusEvent>();

    public onDidReceiveRecord = this.onDidReceiveMessageEmitter.event;
    public onDidReceiveError = this.onDidReceiveErrorEmitter.event;
    public onDidChangeStatus = this.onDidChangeStatusEmitter.event;

    public options: ConsumerOptions;

    constructor(public uri: vscode.Uri, clusterSettings: ClusterSettings) {
        const parsedUri = this.parseUri(uri);
        const cluster = clusterSettings.get(parsedUri.clusterId);

        if (!cluster) {
            throw new Error(`Cannot create consumer, unknown cluster ${parsedUri.clusterId}`);
        }

        const settings = getWorkspaceSettings();
        this.options = {
            clusterId: cluster.id,
            fromOffset: settings.consumerOffset,
            kafkaHost: cluster.bootstrap,
            topic: parsedUri.topic,
            sasl: cluster.saslOption,
        };
    }

    /***
     * Starts a new consumer group that subscribes to the provided topic.
     * Received messages and/or errors are emitted via events.
     */
    start(): void {
        this.client = new ConsumerGroup({
            kafkaHost: this.options.kafkaHost,
            fromOffset: this.options.fromOffset,
            sasl: this.options.sasl,
            sslOptions: this.options.sasl ? {} : undefined,
            groupId: `vscode-kafka-${this.options.clusterId}-${this.options.topic}`,
        }, [this.options.topic]);

        this.client.on("message", (message) => {
            this.onDidReceiveMessageEmitter.fire({
                uri: this.uri,
                record: message,
            });
        });

        this.client.on("rebalancing", () => {
            this.onDidChangeStatusEmitter.fire({
                uri: this.uri,
                status: "rebalancing",
            });
        });

        this.client.on("rebalanced", () => {
            this.onDidChangeStatusEmitter.fire({
                uri: this.uri,
                status: "rebalanced",
            });
        });

        this.client.on("error", (error) => {
            this.onDidReceiveErrorEmitter.fire(error);
        });
    }

    private parseUri(uri: vscode.Uri): { clusterId: string; topic: string; partition?: string} {
        const [clusterId, topic, partition] = uri.path.split("/");

        return {
            clusterId,
            topic,
            partition,
        };
    }

    dispose(): void {
        if (this.client) {
            this.client.close(true, (error) => {
                console.error(error);
            });
        }

        this.onDidReceiveErrorEmitter.dispose();
        this.onDidReceiveMessageEmitter.dispose();
    }
}

/**
 * A collection of consumers.
 */
export class ConsumerCollection implements vscode.Disposable {
    private consumers: { [id: string]: Consumer } = {};
    private disposables: vscode.Disposable[] = [];

    private onDidChangeCollectionEmitter = new vscode.EventEmitter<ConsumerCollectionChangedEvent>();
    public onDidChangeCollection = this.onDidChangeCollectionEmitter.event;

    constructor(private clusterSettings: ClusterSettings) {
    }

    /**
     * Creates a new consumer for a provided uri.
     */
    create(uri: vscode.Uri): Consumer {
        const consumer = new Consumer(uri, this.clusterSettings);
        this.consumers[uri.toString()] = consumer;
        consumer.start();

        this.onDidChangeCollectionEmitter.fire({
            created: [uri],
            closed: [],
        });

        return consumer;
    }

    /**
     * Retrieve the number of active consumers
     */
    length(): number {
        return Object.keys(this.consumers).length;
    }

    /**
     * Retrieve an existing consumer if exists.
     */
    get(uri: vscode.Uri): Consumer | null {
        if (!this.has(uri)) {
            return null;
        }

        return this.consumers[uri.toString()];
    }

    /**
     * Retrieve all consumers
     */
    getAll(): Consumer[] {
        return Object.keys(this.consumers).map((c) => this.consumers[c]);
    }

    /**
     * Closes an existing consumer if exists.
     */
    close(uri: vscode.Uri): void {
        const consumer = this.get(uri);

        if (consumer === null) {
            return;
        }

        consumer.dispose();
        delete this.consumers[uri.toString()];

        this.onDidChangeCollectionEmitter.fire({ created: [], closed: [uri]});
    }

    /**
     * Check whether a consumer exists.
     */
    has(uri: vscode.Uri): boolean {
        return this.consumers.hasOwnProperty(uri.toString());
    }

    dispose(): void {
        this.disposeConsumers();
        this.disposables.forEach((d) => d.dispose());
        this.onDidChangeCollectionEmitter.dispose();
    }

    disposeConsumers(): void {
        Object.keys(this.consumers).forEach((key) => {
            this.consumers[key].dispose();
        });

        this.consumers = {};
    }
}
