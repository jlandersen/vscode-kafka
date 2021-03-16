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

}
