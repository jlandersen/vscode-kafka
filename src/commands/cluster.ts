import { dump } from "js-yaml";
import { Broker, Client } from "../client";
import { BrokerItem } from "../explorer/models/brokers";
import { OutputChannelProvider } from "../providers";
import { pickBroker } from "./common";

export class DumpBrokerMetadataCommandHandler {
    constructor(private client: Client, private outputChannelProvider: OutputChannelProvider) {
    }

    async execute(broker?: BrokerItem) {
        let brokerToDump: Broker | undefined = broker ? broker.broker : await pickBroker(this.client);

        if (!brokerToDump) {
            return;
        }

        // Delete extension specific property
        brokerToDump = Object.assign({}, brokerToDump);
        delete brokerToDump.isConnected;

        const channel = this.outputChannelProvider.getChannel("Broker Metadata");
        channel.clear();
        channel.append(dump(brokerToDump));
        channel.show();
    }
}

export class DumpClusterMetadataCommandHandler {
    constructor(private client: Client, private outputChannelProvider: OutputChannelProvider) {
    }

    async execute() {
        const data = this.client.getBrokers().map((broker) => {
            // Delete extension specific property
            const sanitized = Object.assign({}, broker);
            delete sanitized.isConnected;
            return sanitized;
        });

        const channel = this.outputChannelProvider.getChannel("Cluster Metadata");
        channel.clear();
        channel.append(dump(data));
        channel.show();
    }
}
