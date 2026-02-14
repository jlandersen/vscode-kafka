import * as assert from "assert";
import { __clusterWizardTestHooks } from "../../../wizards/clusters";

suite("Cluster Wizard JAAS Test Suite", () => {
    test("enables JAAS input when mechanism is none", () => {
        const state = __clusterWizardTestHooks.getAuthFieldState("none");
        assert.strictEqual(state.isJaasCompatibleAuth, true);
    });

    test("disables JAAS input for AWS mechanism", () => {
        const state = __clusterWizardTestHooks.getAuthFieldState("aws");
        assert.strictEqual(state.isJaasCompatibleAuth, false);
    });

    test("infers plain mechanism from JAAS module", () => {
        const jaasConfig = "org.apache.kafka.common.security.plain.PlainLoginModule required username=\"alice\" password=\"secret\";";
        const options = __clusterWizardTestHooks.parseJaasConfigOptions(jaasConfig);
        const mechanism = __clusterWizardTestHooks.inferMechanismFromJaasConfig(jaasConfig, options);
        assert.strictEqual(mechanism, "plain");
    });

    test("infers oauthbearer mechanism from JAAS options", () => {
        const jaasConfig = "org.apache.kafka.common.security.oauthbearer.OAuthBearerLoginModule required oauth.token.endpoint.uri=\"https://auth.example.com/token\" oauth.client.id=\"client\" oauth.client.secret=\"secret\";";
        const options = __clusterWizardTestHooks.parseJaasConfigOptions(jaasConfig);
        const mechanism = __clusterWizardTestHooks.inferMechanismFromJaasConfig(jaasConfig, options);
        assert.strictEqual(mechanism, "oauthbearer");
    });

    test("infers scram-sha-512 mechanism from JAAS hint", () => {
        const jaasConfig = "org.apache.kafka.common.security.scram.ScramLoginModule required mechanism=\"SCRAM-SHA-512\" username=\"alice\" password=\"secret\";";
        const options = __clusterWizardTestHooks.parseJaasConfigOptions(jaasConfig);
        const mechanism = __clusterWizardTestHooks.inferMechanismFromJaasConfig(jaasConfig, options);
        assert.strictEqual(mechanism, "scram-sha-512");
    });

    test("creates SSL options with truststore fields", () => {
        const data: Record<string, unknown> = { ssl: true };
        data["ssl.truststore"] = "/tmp/truststore.jks";
        data["ssl.truststorePassword"] = "changeit";

        const ssl = __clusterWizardTestHooks.createSsl(data);

        assert.strictEqual((ssl as { truststore?: string }).truststore, "/tmp/truststore.jks");
        assert.strictEqual((ssl as { truststorePassword?: string }).truststorePassword, "changeit");
    });
});
