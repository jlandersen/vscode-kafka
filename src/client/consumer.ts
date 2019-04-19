import { ConsumerGroup, Message } from "kafka-node";

import * as vscode from "vscode";

import { getSettings, SaslOption } from "../settings";

interface ConsumerOptions {
    kafkaHost: string;
    fromOffset: "earliest" | "latest";
    topic: string;
    sasl?: SaslOption;
}

interface RecordReceivedEvent {
    uri: vscode.Uri;
    record: Message;
}

interface ConsumerChangedStatusEvent {
    uri: vscode.Uri;
    status: "created" | "rebalancing" | "rebalanced";
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

    constructor(public uri: vscode.Uri) {
        const parsedUri = this.parseUri(uri);

        const settings = getSettings();
        this.options = {
            fromOffset: "latest",
            kafkaHost: settings.host,
            topic: parsedUri.topic,
            sasl: settings.sasl,
        };
    }

    /***
     * Starts a new consumer group that subscribes to the provided topic.
     * Received messages and/or errors are emitted via events.
     */
    start() {
        this.client = new ConsumerGroup({
            kafkaHost: this.options.kafkaHost,
            fromOffset: this.options.fromOffset,
            sasl: this.options.sasl,
            groupId: "vscode-kafka-" + this.options.topic,
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

    private parseUri(uri: vscode.Uri): { topic: string, partition?: string} {
        const [topic, partition] = uri.path.split("/");

        return {
            topic,
            partition,
        };
    }

    dispose() {
        if (this.client) {
            this.client.close(true, (error) => {
                // TODO: Handle error
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
    private static instance: ConsumerCollection;
    private consumers: { [id: string]: Consumer; } = {};
    private disposables: vscode.Disposable[] = [];

    private onDidChangeCollectionEmitter = new vscode.EventEmitter<ConsumerCollectionChangedEvent>();
    public onDidChangeCollection = this.onDidChangeCollectionEmitter.event;

    constructor() {
        const settings = getSettings();
        this.disposables.push(settings.onDidChangeSettings(() => {
            this.disposeConsumers();
        }));
    }

    /**
     * Creates a new consumer for a provided uri.
     */
    create(uri: vscode.Uri) {
        const consumer = new Consumer(uri);
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
    close(uri: vscode.Uri) {
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

    dispose() {
        this.disposeConsumers();
        this.disposables.forEach((d) => d.dispose());
        this.onDidChangeCollectionEmitter.dispose();
    }

    disposeConsumers() {
        Object.keys(this.consumers).forEach((key) => {
            this.consumers[key].dispose();
        });

        this.consumers = {};

        this.onDidChangeCollectionEmitter.fire();
    }

    static getInstance() {
        if (!ConsumerCollection.instance) {
            ConsumerCollection.instance = new ConsumerCollection();
        }

        return ConsumerCollection.instance;
    }
}
