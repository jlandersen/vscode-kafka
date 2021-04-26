import { Client } from "./client";

/**
 * @see https://kafka.apache.org/documentation/#brokerconfigs
 */
export namespace BrokerConfigs {

    /**
    * @see https://kafka.apache.org/documentation/#brokerconfigs_default.replication.factor
    */
    export const DEFAULT_REPLICATION_FACTOR = 'default.replication.factor';

    /**
     * @see https://kafka.apache.org/documentation/#brokerconfigs_offsets.topic.replication.factor
     */
    export const OFFSETS_TOPIC_REPLICATION_FACTOR = 'offsets.topic.replication.factor';

    /**
     * @see https://kafka.apache.org/documentation/#brokerconfigs_auto.create.topics.enable
     */
    export const AUTO_CREATE_TOPIC_ENABLE = 'auto.create.topics.enable';

    export interface AutoCreateTopicResult {
        type: "enabled" | "disabled" | "unknown";
        error?: any;
    }

    export async function getAutoCreateTopicEnabled(client: Client): Promise<AutoCreateTopicResult> {
        try {
            const brokers = await client?.getBrokers();

            if (brokers) {
                for (let i = 0; i < brokers.length; i++) {
                    const configs = await client?.getBrokerConfigs(brokers[i].id);
                    const config = configs?.find(ce => ce.configName === BrokerConfigs.AUTO_CREATE_TOPIC_ENABLE);
                    if (config) {
                        const type = config.configValue === 'true' ? "enabled" : "disabled";
                        return { type };
                    }
                }
            }

            return { type: "unknown" };
        }
        catch (error) {
            return { type: "unknown", error };
        }
    }
}