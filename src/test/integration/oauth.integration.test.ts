/**
 * Integration tests for OAUTHBEARER authentication.
 * 
 * These tests verify that the OAuth token fetching functionality works correctly
 * with a real Keycloak server.
 */

import * as assert from "assert";
import { createOAuthFixture, OAuthTestFixture } from "./kafkaContainers";

/**
 * Fetches an OAuth token using client credentials grant.
 * This mirrors the implementation in client.ts but is standalone for testing.
 */
async function fetchOAuthToken(
    tokenEndpoint: string,
    clientId: string,
    clientSecret: string
): Promise<{ accessToken: string; expiresIn: number }> {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
    
    const response = await fetch(tokenEndpoint, {
        method: "POST",
        headers: {
            "Content-Type": "application/x-www-form-urlencoded",
            "Authorization": `Basic ${credentials}`,
        },
        body: "grant_type=client_credentials",
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OAuth token request failed: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const tokenResponse = (await response.json()) as {
        access_token: string;
        expires_in?: number;
        token_type?: string;
    };

    if (!tokenResponse.access_token) {
        throw new Error("OAuth response did not contain access_token");
    }

    return {
        accessToken: tokenResponse.access_token,
        expiresIn: tokenResponse.expires_in || 3600,
    };
}

/**
 * Decodes a JWT token (without verification) to inspect its claims.
 */
function decodeJwtPayload(token: string): Record<string, unknown> {
    const parts = token.split(".");
    if (parts.length !== 3) {
        throw new Error("Invalid JWT format");
    }
    
    const payload = Buffer.from(parts[1], "base64url").toString("utf-8");
    return JSON.parse(payload);
}

suite("OAUTHBEARER Integration Tests", function () {
    // Increase timeout for container operations (Keycloak takes a while to start)
    this.timeout(180000); // 3 minutes

    suite("OAuth Token Fetching", function () {
        let fixture: OAuthTestFixture;

        suiteSetup(async function () {
            console.log("Setting up Keycloak container for OAuth tests...");
            fixture = await createOAuthFixture();
        });

        suiteTeardown(async function () {
            console.log("Tearing down Keycloak container...");
            if (fixture) {
                await fixture.stop();
            }
        });

        test("should fetch OAuth token using client credentials", async function () {
            const result = await fetchOAuthToken(
                fixture.tokenEndpoint,
                fixture.clientId,
                fixture.clientSecret
            );

            assert.ok(result.accessToken, "Should receive an access token");
            assert.ok(result.accessToken.length > 0, "Access token should not be empty");
            assert.ok(result.expiresIn > 0, "Expires in should be positive");

            console.log(`Received OAuth token (length: ${result.accessToken.length})`);
            console.log(`Token expires in: ${result.expiresIn} seconds`);
        });

        test("should receive a valid JWT token", async function () {
            const result = await fetchOAuthToken(
                fixture.tokenEndpoint,
                fixture.clientId,
                fixture.clientSecret
            );

            // Decode and inspect the JWT
            const payload = decodeJwtPayload(result.accessToken);

            assert.ok(payload.iss, "JWT should have issuer (iss) claim");
            assert.ok(payload.exp, "JWT should have expiration (exp) claim");
            assert.ok(payload.iat, "JWT should have issued at (iat) claim");

            // Check that the issuer contains our realm
            const issuer = payload.iss as string;
            assert.ok(issuer.includes("kafka"), `Issuer should contain 'kafka' realm: ${issuer}`);

            console.log("JWT payload claims:");
            console.log(`  iss: ${payload.iss}`);
            console.log(`  exp: ${payload.exp}`);
            console.log(`  iat: ${payload.iat}`);
            console.log(`  azp: ${payload.azp || "N/A"}`);
        });

        test("should fail with invalid credentials", async function () {
            try {
                await fetchOAuthToken(
                    fixture.tokenEndpoint,
                    "invalid-client",
                    "invalid-secret"
                );
                assert.fail("Should have thrown an error for invalid credentials");
            } catch (error) {
                assert.ok(error instanceof Error, "Should throw an Error");
                assert.ok(
                    error.message.includes("401") || error.message.includes("unauthorized") || error.message.includes("failed"),
                    `Error should indicate authentication failure: ${error.message}`
                );
                console.log(`Correctly rejected invalid credentials: ${error.message}`);
            }
        });

        test("should be able to fetch multiple tokens (simulating token refresh)", async function () {
            // Fetch first token
            const token1 = await fetchOAuthToken(
                fixture.tokenEndpoint,
                fixture.clientId,
                fixture.clientSecret
            );

            // Wait a moment
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Fetch second token
            const token2 = await fetchOAuthToken(
                fixture.tokenEndpoint,
                fixture.clientId,
                fixture.clientSecret
            );

            assert.ok(token1.accessToken, "First token should exist");
            assert.ok(token2.accessToken, "Second token should exist");
            
            // Tokens might be the same or different depending on Keycloak caching
            // but both should be valid
            console.log(`Token 1 length: ${token1.accessToken.length}`);
            console.log(`Token 2 length: ${token2.accessToken.length}`);
        });
    });
});
