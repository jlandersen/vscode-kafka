"use strict";
/**
 * Simple test script to verify OAuth token fetching works with the test Keycloak setup.
 *
 * Run with: npx ts-node test-cluster/test-oauth.ts
 */
async function testOAuthTokenFetch() {
    const tokenEndpoint = 'http://localhost:8080/realms/kafka/protocol/openid-connect/token';
    const clientId = 'kafka-client';
    const clientSecret = 'kafka-client-secret';
    console.log('Testing OAuth token fetch...');
    console.log(`Token Endpoint: ${tokenEndpoint}`);
    console.log(`Client ID: ${clientId}`);
    console.log('');
    try {
        const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
        const response = await fetch(tokenEndpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${credentials}`
            },
            body: 'grant_type=client_credentials'
        });
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`OAuth token request failed: ${response.status} ${response.statusText} - ${errorText}`);
        }
        const tokenResponse = await response.json();
        console.log('✅ Token fetch successful!');
        console.log('');
        console.log('Token Response:');
        console.log(`  Token Type: ${tokenResponse.token_type}`);
        console.log(`  Expires In: ${tokenResponse.expires_in} seconds`);
        console.log(`  Access Token: ${tokenResponse.access_token.substring(0, 50)}...`);
        console.log('');
        // Decode the JWT to show the payload
        const parts = tokenResponse.access_token.split('.');
        if (parts.length === 3) {
            const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
            console.log('JWT Payload:');
            console.log(`  Issuer: ${payload.iss}`);
            console.log(`  Subject: ${payload.sub}`);
            console.log(`  Client ID: ${payload.azp || payload.client_id}`);
            console.log(`  Expires: ${new Date(payload.exp * 1000).toISOString()}`);
        }
    }
    catch (error) {
        console.error('❌ Token fetch failed!');
        console.error(error);
        process.exit(1);
    }
}
testOAuthTokenFetch();
//# sourceMappingURL=test-oauth.js.map