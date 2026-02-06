/**
 * Compression codec registration for KafkaJS.
 * 
 * KafkaJS doesn't include Snappy compression codec by default.
 * This module registers it so that messages compressed with Snappy
 * can be produced and consumed.
 * 
 * See: https://github.com/jlandersen/vscode-kafka/issues/217
 */

import { CompressionTypes, CompressionCodecs } from 'kafkajs';

let codecsRegistered = false;

/**
 * Registers the Snappy compression codec with KafkaJS.
 * This must be called before creating any Kafka clients.
 * Safe to call multiple times - the codec is only registered once.
 */
export function registerCompressionCodecs(): void {
    if (codecsRegistered) {
        return;
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const SnappyCodec = require('kafkajs-snappy');
        CompressionCodecs[CompressionTypes.Snappy] = SnappyCodec;
    } catch (error) {
        console.warn('Failed to register Snappy compression codec:', error);
    }

    codecsRegistered = true;
}
