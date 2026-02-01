#!/bin/bash
# Script to generate SSL certificates for Kafka SSL testing with passphrase

set -e

CERT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$CERT_DIR"

# Password for the private key
KEY_PASSWORD="test-passphrase"
VALIDITY_DAYS=365

echo "Generating SSL certificates in $CERT_DIR"

# 1. Generate CA key and certificate (no passphrase for simplicity)
echo "1. Generating CA certificate..."
openssl req -new -x509 -keyout ca-key.pem -out ca-cert.pem -days $VALIDITY_DAYS -nodes \
    -subj "/C=US/ST=Test/L=Test/O=TestOrg/CN=Test-CA"

# 2. Generate server key WITH passphrase
echo "2. Generating server key with passphrase..."
openssl genrsa -aes256 -passout pass:$KEY_PASSWORD -out server-key-encrypted.pem 2048

# 3. Create unencrypted version for server (Kafka needs unencrypted key)
echo "3. Creating unencrypted server key for Kafka..."
openssl rsa -in server-key-encrypted.pem -passin pass:$KEY_PASSWORD -out server-key.pem

# 4. Generate server certificate signing request
echo "4. Generating server CSR..."
openssl req -new -key server-key.pem -out server-csr.pem \
    -subj "/C=US/ST=Test/L=Test/O=TestOrg/CN=localhost"

# 5. Sign server certificate with CA
echo "5. Signing server certificate..."
openssl x509 -req -in server-csr.pem -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial \
    -out server-cert.pem -days $VALIDITY_DAYS

# 6. Generate client key WITH passphrase (this is what we'll test)
echo "6. Generating client key with passphrase..."
openssl genrsa -aes256 -passout pass:$KEY_PASSWORD -out client-key.pem 2048

# 7. Generate client certificate signing request (requires passphrase)
echo "7. Generating client CSR..."
openssl req -new -key client-key.pem -passin pass:$KEY_PASSWORD -out client-csr.pem \
    -subj "/C=US/ST=Test/L=Test/O=TestOrg/CN=test-client"

# 8. Sign client certificate with CA
echo "8. Signing client certificate..."
openssl x509 -req -in client-csr.pem -CA ca-cert.pem -CAkey ca-key.pem -CAcreateserial \
    -out client-cert.pem -days $VALIDITY_DAYS

# 9. Also create an unencrypted client key for testing without passphrase
echo "9. Creating unencrypted client key (for comparison tests)..."
openssl rsa -in client-key.pem -passin pass:$KEY_PASSWORD -out client-key-unencrypted.pem

# Clean up intermediate files
rm -f server-csr.pem client-csr.pem ca-cert.srl

echo ""
echo "✓ Certificate generation complete!"
echo ""
echo "Files generated:"
echo "  - ca-cert.pem                  : CA certificate"
echo "  - ca-key.pem                   : CA private key (unencrypted)"
echo "  - server-cert.pem              : Server certificate"
echo "  - server-key.pem               : Server private key (unencrypted, for Kafka)"
echo "  - server-key-encrypted.pem     : Server private key (encrypted, not used)"
echo "  - client-cert.pem              : Client certificate"
echo "  - client-key.pem               : Client private key (ENCRYPTED with passphrase)"
echo "  - client-key-unencrypted.pem   : Client private key (unencrypted, for comparison)"
echo ""
echo "Passphrase for encrypted keys: $KEY_PASSWORD"
echo ""
echo "To verify the client key is encrypted, run:"
echo "  openssl rsa -in client-key.pem -check"
echo "  (it will ask for passphrase: $KEY_PASSWORD)"
