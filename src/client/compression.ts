/**
 * Compression codec registration for KafkaJS.
 * 
 * KafkaJS doesn't include Snappy or LZ4 compression codecs by default.
 * This module registers them so that messages compressed with these
 * algorithms can be produced and consumed.
 * 
 * See: https://github.com/jlandersen/vscode-kafka/issues/217
 * See: https://github.com/jlandersen/vscode-kafka/issues/254
 */

import { CompressionTypes, CompressionCodecs } from 'kafkajs';
import { createLZ4Codec } from './lz4';

let codecsRegistered = false;

/**
 * Registers compression codecs (Snappy, LZ4) with KafkaJS.
 * This must be called before creating any Kafka clients.
 * Safe to call multiple times - codecs are only registered once.
 */
export function registerCompressionCodecs(): void {
    if (codecsRegistered) {
        return;
    }

    try {
        const snappyCodec = require('kafkajs-snappy');
        CompressionCodecs[CompressionTypes.Snappy] = snappyCodec;
    } catch (error) {
        console.warn('Failed to register Snappy compression codec:', error);
    }

    try {
        CompressionCodecs[CompressionTypes.LZ4] = createLZ4Codec();
    } catch (error) {
        console.warn('Failed to register LZ4 compression codec:', error);
    }

    codecsRegistered = true;
}
