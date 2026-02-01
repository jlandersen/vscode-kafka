# SSL/TLS Test Cluster

This directory contains SSL certificates for testing mTLS (mutual TLS) authentication with passphrase-protected private keys.

## Generated Certificates

- **ca-cert.pem**: Certificate Authority (CA) certificate
- **ca-key.pem**: CA private key (unencrypted)
- **server-cert.pem**: Kafka server certificate
- **server-key.pem**: Kafka server private key (unencrypted - required by Kafka)
- **client-cert.pem**: Client certificate for mTLS authentication
- **client-key.pem**: Client private key (ENCRYPTED with passphrase)
- **client-key-unencrypted.pem**: Client private key (unencrypted, for comparison tests)

## Passphrase

The client private key (`client-key.pem`) is encrypted with the passphrase:

```
test-passphrase
```

## Regenerating Certificates

To regenerate all certificates:

```bash
./generate-certs.sh
```

This will create new certificates valid for 365 days.

## Usage in Tests

The integration tests use these certificates to verify:

1. **Connection with passphrase**: Using `client-key.pem` + `client-cert.pem` + `ca-cert.pem` with passphrase `test-passphrase`
2. **Connection without passphrase**: Using `client-key-unencrypted.pem` + `client-cert.pem` + `ca-cert.pem` with no passphrase
3. **Failure with wrong passphrase**: Verifying that wrong passphrase fails properly
4. **Failure with missing passphrase**: Verifying that encrypted key without passphrase fails

## Certificate Validity

To check when certificates expire:

```bash
openssl x509 -in client-cert.pem -noout -dates
```

## Verifying Encryption

To verify the client key is encrypted:

```bash
openssl rsa -in client-key.pem -check
# Will prompt for passphrase: test-passphrase
```

To verify the unencrypted key:

```bash
openssl rsa -in client-key-unencrypted.pem -check
# No passphrase required
```
