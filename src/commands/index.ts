import { Client } from "../client";
import { CreateTopicCommandHandler } from "./createTopicCommandHandler";

const waitUntilConnected = async (client: Client, handler: () => Promise<any>) => {
    await client.connect();
    return handler();
};

export { CreateTopicCommandHandler, waitUntilConnected };
