import { Client } from "../client";
import { CreateTopicCommandHandler } from "./createTopicCommandHandler";

const waitUntilConnected = async (client: Client, handler: { execute(): Promise<void>; }) => {
    await client.connect();
    return handler.execute();
};

export { CreateTopicCommandHandler, waitUntilConnected };
