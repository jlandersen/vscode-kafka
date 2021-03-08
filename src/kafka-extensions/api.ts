import { KafkaConfig } from "kafkajs";
import { Cluster, ConnectionOptions } from "../client/client";
import { ClusterSettings } from "../settings/clusters";

export interface KafkaExtensionParticipant {

    getClusterProviderParticipant(clusterProviderId: string) : ClusterProviderParticipant;

}

/**
 * The kafka extension participant.
 */
export interface ClusterProviderParticipant {

    /**
     * Returns the Kafka clusters managed by this participant.
     *
     * @param clusterSettings the current cluster settings.
     */
    configureClusters(clusterSettings: ClusterSettings): Promise<Cluster[] | undefined>;

    /**
     * Create the KafkaJS client configuration from the given connection options.
     * When the participant doesn't implement this method, the KafkaJS client
     * configuration is created with the default client configuration factory from vscode-kafka.
     *
     * @param connectionOptions the Kafka connection options.
     */
    createKafkaConfig?(connectionOptions: ConnectionOptions): KafkaConfig;
}
