import * as assert from "assert";
import { defaultClusterProviderId, getDefaultKafkaExtensionParticipant } from "../../../kafka-extensions/registry";

suite("Kafka Extension Registry Test Suite", () => {

    test("manual provider does not override kafka client config creation", () => {
        const participant = getDefaultKafkaExtensionParticipant();
        const clusterProviderParticipant = participant.getClusterProviderParticipant(defaultClusterProviderId);

        assert.strictEqual(clusterProviderParticipant.createKafkaConfig, undefined);
    });
});
