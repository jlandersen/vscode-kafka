import { ProducerRecord, RecordMetadata } from "kafkajs";
import * as vscode from "vscode";
import { addQueryParameter, ClientAccessor } from ".";
import { Producer as KafkaJSProducer } from "kafkajs";


export enum ProducerLaunchState {
    idle,
    connecting,
    connected,
    sending,
    sent
}

export interface ProducerCollectionChangedEvent {
    producers: Producer[];
}

export class Producer implements vscode.Disposable {

    public state: ProducerLaunchState = ProducerLaunchState.idle;

    private producer: KafkaJSProducer | undefined;

    constructor(public uri: vscode.Uri, private clientAccessor: ClientAccessor) {

    }

    async start(): Promise<void> {
        const [clusterId] = this.uri.path.split("/");
        const client = this.clientAccessor.get(clusterId);
        this.producer = await client.producer();
        await this.producer.connect();
    }

    async send(record: ProducerRecord): Promise<RecordMetadata[] | undefined> {
        if (this.producer) {
            return this.producer.send(record);
        }
    }

    async dispose(): Promise<void> {
        if (this.producer) {
            this.producer = undefined;
        }
    }
}

/**
 * A collection of producers.
 */
export class ProducerCollection implements vscode.Disposable {

    private producers: { [id: string]: Producer } = {};

    private onDidChangeCollectionEmitter = new vscode.EventEmitter<ProducerCollectionChangedEvent>();

    public onDidChangeCollection = this.onDidChangeCollectionEmitter.event;

    constructor(private clientAccessor: ClientAccessor) {

    }
    /**
     * Creates a new producer for a provided uri.
     */
    async create(uri: vscode.Uri): Promise<Producer> {

        // Create the producer
        const producer = new Producer(uri, this.clientAccessor);
        this.producers[uri.toString()] = producer;

        // Fire an event to notify that producer is connecting
        this.changeState(producer, ProducerLaunchState.connecting);

        // Start the producer
        try {
            await producer.start();
            // Fire an event to notify that producer is connected
            this.changeState(producer, ProducerLaunchState.connected);
        }
        catch (e) {
            this.handleProducerError(producer, e);
        }

        return producer;
    }

    dispose(): void {
        this.disposeProducers();
        this.onDidChangeCollectionEmitter.dispose();
    }

    disposeProducers(): void {
        Object.keys(this.producers).forEach((key) => {
            this.producers[key].dispose();
        });

        this.producers = {};
    }

    /**
     * Retrieve the number of active producers
     */
    length(): number {
        return Object.keys(this.producers).length;
    }

    /**
     * Retrieve an existing producer if exists.
     */
    get(uri: vscode.Uri): Producer | null {
        if (!this.has(uri)) {
            return null;
        }

        return this.producers[uri.toString()];
    }

    /**
     * Retrieve all producers
     */
    getAll(): Producer[] {
        return Object.keys(this.producers).map((c) => this.producers[c]);
    }

    /**
     * Check whether a producer exists.
    */
    has(uri: vscode.Uri): boolean {
        return this.producers.hasOwnProperty(uri.toString());
    }

    async send(uri: vscode.Uri, record: ProducerRecord): Promise<void> {
        const producer = this.get(uri);

        if (producer === null) {
            return;
        }

        // Fire an event to notify that producer message is sending
        this.changeState(producer, ProducerLaunchState.sending);

        // Send messages
        try {
            await producer.send(record);
            // Fire an event to notify that producer message is sent
            this.changeState(producer, ProducerLaunchState.sent);
        }
        catch (e) {
            this.handleProducerError(producer, e);
        }
    }

    /**
     * Close an existing producer if exists.
     */
    async close(uri: vscode.Uri): Promise<void> {
        const producer = this.get(uri);

        if (producer === null) {
            return;
        }

        // Fire an event to notify that producer is none
        this.changeState(producer, ProducerLaunchState.idle);
        delete this.producers[uri.toString()];
    }

    private handleProducerError(producer: Producer, e: Error) {
        this.changeState(producer, ProducerLaunchState.idle);
        delete this.producers[producer.uri.toString()];
        throw e;
    }

    private changeState(producer: Producer, state: ProducerLaunchState) {
        producer.state = state;
        this.onDidChangeCollectionEmitter.fire({
            producers: [producer]
        });
    }
}

// ---------- Producer URI utilities

export interface ProducerInfoUri {
    clusterId: string;
    topicId?: string;
    key?: string;
    value: string;
}

const TOPIC_QUERY_PARAMETER = 'topic';
const KEY_QUERY_PARAMETER = 'key';
const VALUE_QUERY_PARAMETER = 'value';

export function createProducerUri(info: ProducerInfoUri): vscode.Uri {
    const path = `kafka:${info.clusterId}`;
    let query = '';
    query = addQueryParameter(query, TOPIC_QUERY_PARAMETER, info.topicId);
    query = addQueryParameter(query, KEY_QUERY_PARAMETER, info.key);
    query = addQueryParameter(query, VALUE_QUERY_PARAMETER, info.value);
    return vscode.Uri.parse(path + query);
}
