const { GenericContainer, Wait } = require('testcontainers');
const fs = require('fs');
const path = require('path');
const os = require('os');

async function test() {
    const sslDir = path.join(__dirname, 'test-clusters/ssl');
    const caCert = fs.readFileSync(path.join(sslDir, 'ca-cert.pem'), 'utf-8');
    const serverCert = fs.readFileSync(path.join(sslDir, 'server-cert.pem'), 'utf-8');
    const serverKey = fs.readFileSync(path.join(sslDir, 'server-key.pem'), 'utf-8');
    
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kafka-ssl-'));
    console.log('Temp dir:', tmpDir);
    
    fs.writeFileSync(path.join(tmpDir, 'ca-cert.pem'), caCert);
    fs.writeFileSync(path.join(tmpDir, 'server-cert.pem'), serverCert);
    fs.writeFileSync(path.join(tmpDir, 'server-key.pem'), serverKey);
    
    const script = `
set -e
cd /certs
openssl pkcs12 -export -in server-cert.pem -inkey server-key.pem -out keystore.p12 -name kafka -passout pass:test-password -CAfile ca-cert.pem
keytool -importcert -storetype PKCS12 -keystore truststore.p12 -storepass test-password -alias ca -file ca-cert.pem -noprompt
chmod 644 keystore.p12 truststore.p12
echo "DONE"
`;
    fs.writeFileSync(path.join(tmpDir, 'generate.sh'), script);
    
    console.log('Starting container...');
    const container = await new GenericContainer('eclipse-temurin:17-jdk')
        .withBindMounts([{
            source: tmpDir,
            target: '/certs',
            mode: 'rw'
        }])
        .withCommand(['bash', '/certs/generate.sh'])
        .withWaitStrategy(Wait.forOneShotStartup())
        .start();
    
    console.log('Container finished');
    await container.stop();
    
    console.log('Reading files...');
    const keystore = fs.readFileSync(path.join(tmpDir, 'keystore.p12'));
    const truststore = fs.readFileSync(path.join(tmpDir, 'truststore.p12'));
    console.log('Keystore size:', keystore.length);
    console.log('Truststore size:', truststore.length);
    
    fs.rmSync(tmpDir, { recursive: true, force: true });
    console.log('Success!');
}

test().catch(e => {
    console.error('Error:', e);
    process.exit(1);
});
