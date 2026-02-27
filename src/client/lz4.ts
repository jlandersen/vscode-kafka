/**
 * Pure JavaScript LZ4 frame compression/decompression for KafkaJS.
 *
 * This is a custom implementation because the available LZ4 libraries for
 * KafkaJS (e.g. kafkajs-lz4) are outdated, unmaintained, and incompatible
 * with newer Node.js versions.
 *
 * Implements:
 * - LZ4 block format (compress + decompress)
 * - LZ4 frame format (required by Kafka's wire protocol)
 * - xxHash-32 (used for frame header and content checksums)
 *
 * Specs:
 *   https://github.com/lz4/lz4/blob/dev/doc/lz4_Block_format.md
 *   https://github.com/lz4/lz4/blob/dev/doc/lz4_Frame_format.md
 *   https://github.com/Cyan4973/xxHash/blob/release/doc/xxhash_spec.md
 */

// ── xxHash-32 ───────────────────────────────────────────────────────────

const PRIME32_1 = 0x9E3779B1;
const PRIME32_2 = 0x85EBCA77;
const PRIME32_3 = 0xC2B2AE3D;
const PRIME32_4 = 0x27D4EB2F;
const PRIME32_5 = 0x165667B1;

function rotl32(x: number, r: number): number {
    return ((x << r) | (x >>> (32 - r))) >>> 0;
}

function mul32(a: number, b: number): number {
    // 32-bit multiply avoiding overflow issues
    const al = a & 0xFFFF;
    const ah = (a >>> 16) & 0xFFFF;
    return (((ah * b) << 16) + (al * b)) >>> 0;
}

function xxhRound(acc: number, lane: number): number {
    acc = (acc + mul32(lane, PRIME32_2)) >>> 0;
    acc = rotl32(acc, 13);
    return mul32(acc, PRIME32_1);
}

export function xxHash32(buf: Buffer, seed: number = 0): number {
    const len = buf.length;
    let acc: number;
    let offset = 0;

    if (len >= 16) {
        let acc1 = (seed + PRIME32_1 + PRIME32_2) >>> 0;
        let acc2 = (seed + PRIME32_2) >>> 0;
        let acc3 = (seed + 0) >>> 0;
        let acc4 = (seed - PRIME32_1) >>> 0;

        const stripeEnd = len - 15;
        while (offset < stripeEnd) {
            acc1 = xxhRound(acc1, buf.readUInt32LE(offset)); offset += 4;
            acc2 = xxhRound(acc2, buf.readUInt32LE(offset)); offset += 4;
            acc3 = xxhRound(acc3, buf.readUInt32LE(offset)); offset += 4;
            acc4 = xxhRound(acc4, buf.readUInt32LE(offset)); offset += 4;
        }

        acc = (rotl32(acc1, 1) + rotl32(acc2, 7) + rotl32(acc3, 12) + rotl32(acc4, 18)) >>> 0;
    } else {
        acc = (seed + PRIME32_5) >>> 0;
    }

    acc = (acc + len) >>> 0;

    while (offset + 4 <= len) {
        const lane = buf.readUInt32LE(offset);
        acc = (acc + mul32(lane, PRIME32_3)) >>> 0;
        acc = mul32(rotl32(acc, 17), PRIME32_4);
        offset += 4;
    }

    while (offset < len) {
        acc = (acc + mul32(buf[offset], PRIME32_5)) >>> 0;
        acc = mul32(rotl32(acc, 11), PRIME32_1);
        offset += 1;
    }

    // avalanche
    acc = acc ^ (acc >>> 15);
    acc = mul32(acc, PRIME32_2);
    acc = acc ^ (acc >>> 13);
    acc = mul32(acc, PRIME32_3);
    acc = acc ^ (acc >>> 16);

    return acc >>> 0;
}

// ── LZ4 Block Compression ──────────────────────────────────────────────

const MIN_MATCH = 4;
const HASH_LOG = 16;
const HASH_SIZE = 1 << HASH_LOG;
const LAST_LITERALS = 5;
const MF_LIMIT = 12;

function hashPosition(buf: Buffer, pos: number): number {
    const val = buf.readUInt32LE(pos);
    return (Math.imul(val, 0x9E3779B1) >>> (32 - HASH_LOG)) & (HASH_SIZE - 1);
}

function writeLength(dst: Buffer, offset: number, length: number): number {
    while (length >= 255) {
        dst[offset++] = 255;
        length -= 255;
    }
    dst[offset++] = length;
    return offset;
}

export function compressBlock(src: Buffer): Buffer {
    const srcLen = src.length;
    if (srcLen === 0) {
        return Buffer.alloc(0);
    }

    const dst = Buffer.allocUnsafe(srcLen + Math.ceil(srcLen / 255) + 16);
    const hashTable = new Int32Array(HASH_SIZE).fill(-1);

    let srcPos = 0;
    let dstPos = 0;
    let anchor = 0;

    if (srcLen >= MF_LIMIT) {
        const matchLimit = srcLen - LAST_LITERALS;
        const mfLimit = srcLen - MF_LIMIT;

        hashTable[hashPosition(src, srcPos)] = srcPos;
        srcPos++;

        outer:
        while (srcPos <= mfLimit) {
            let step = 1;
            let searchCount = 0;
            let ref: number;

            // Find a match
            do {
                const h = hashPosition(src, srcPos);
                ref = hashTable[h];
                hashTable[h] = srcPos;
                if (ref >= 0 && ref + 0xFFFF >= srcPos && src.readUInt32LE(ref) === src.readUInt32LE(srcPos)) {
                    break;
                }
                searchCount++;
                step = (searchCount >> 5) + 1;
                srcPos += step;
                if (srcPos > mfLimit) { break outer; }
            } while (true);

            // Encode literals
            const litLen = srcPos - anchor;
            const tokenPos = dstPos++;
            dst[tokenPos] = litLen >= 15 ? 0xF0 : (litLen << 4);

            if (litLen >= 15) {
                dstPos = writeLength(dst, dstPos, litLen - 15);
            }
            src.copy(dst, dstPos, anchor, anchor + litLen);
            dstPos += litLen;

            // Encode match offset (little-endian 16-bit)
            const offset = srcPos - ref;
            dst[dstPos++] = offset & 0xFF;
            dst[dstPos++] = (offset >> 8) & 0xFF;

            // Extend match forward
            srcPos += MIN_MATCH;
            ref += MIN_MATCH;
            let matchLen = 0;
            while (srcPos < matchLimit && src[srcPos] === src[ref]) {
                srcPos++;
                ref++;
                matchLen++;
            }

            // Encode match length in low nibble of token
            if (matchLen >= 15) {
                dst[tokenPos] = dst[tokenPos] | 0x0F;
                dstPos = writeLength(dst, dstPos, matchLen - 15);
            } else {
                dst[tokenPos] = dst[tokenPos] | matchLen;
            }

            anchor = srcPos;

            // Update hash for match end position
            if (srcPos <= mfLimit) {
                hashTable[hashPosition(src, srcPos - 2)] = srcPos - 2;
            }
        }
    }

    // Encode remaining literals (last sequence - no match)
    const lastLitLen = srcLen - anchor;
    if (lastLitLen >= 15) {
        dst[dstPos++] = 0xF0;
        dstPos = writeLength(dst, dstPos, lastLitLen - 15);
    } else {
        dst[dstPos++] = lastLitLen << 4;
    }
    src.copy(dst, dstPos, anchor, anchor + lastLitLen);
    dstPos += lastLitLen;

    return dst.subarray(0, dstPos);
}

// ── LZ4 Block Decompression ────────────────────────────────────────────

export function decompressBlock(src: Buffer, uncompressedSize: number): Buffer {
    const dst = Buffer.allocUnsafe(uncompressedSize);
    let srcPos = 0;
    let dstPos = 0;
    const srcLen = src.length;

    while (srcPos < srcLen) {
        const token = src[srcPos++];

        // Decode literal length
        let litLen = (token >> 4) & 0x0F;
        if (litLen === 15) {
            let s: number;
            do {
                if (srcPos >= srcLen) {
                    throw new Error("LZ4 decompression error: truncated literal length");
                }
                s = src[srcPos++];
                litLen += s;
            } while (s === 255);
        }

        // Copy literals
        if (litLen > 0) {
            if (srcPos + litLen > srcLen) {
                throw new Error("LZ4 decompression error: truncated literals");
            }
            if (dstPos + litLen > uncompressedSize) {
                throw new Error("LZ4 decompression error: output overflow");
            }
            src.copy(dst, dstPos, srcPos, srcPos + litLen);
            srcPos += litLen;
            dstPos += litLen;
        }

        // Last sequence has no match
        if (srcPos >= srcLen) {
            break;
        }

        // Decode offset
        if (srcPos + 1 >= srcLen) {
            throw new Error("LZ4 decompression error: truncated offset");
        }
        const offset = src[srcPos] | (src[srcPos + 1] << 8);
        srcPos += 2;
        if (offset === 0) {
            throw new Error("LZ4 decompression error: invalid offset 0");
        }
        if (offset > dstPos) {
            throw new Error(`LZ4 decompression error: invalid match offset ${offset}`);
        }

        // Decode match length
        let matchLen = (token & 0x0F) + MIN_MATCH;
        if ((token & 0x0F) === 15) {
            let s: number;
            do {
                if (srcPos >= srcLen) {
                    throw new Error("LZ4 decompression error: truncated match length");
                }
                s = src[srcPos++];
                matchLen += s;
            } while (s === 255);
        }
        if (dstPos + matchLen > uncompressedSize) {
            throw new Error("LZ4 decompression error: output overflow");
        }

        // Copy match (may overlap)
        let matchPos = dstPos - offset;
        for (let i = 0; i < matchLen; i++) {
            dst[dstPos++] = dst[matchPos++];
        }
    }

    if (dstPos !== uncompressedSize) {
        throw new Error(`LZ4 decompression error: expected ${uncompressedSize} bytes, got ${dstPos}`);
    }

    return dst;
}

// ── LZ4 Frame Format ───────────────────────────────────────────────────

const LZ4_FRAME_MAGIC = 0x184D2204;
const LZ4_MAX_BLOCK_SIZE_64KB = 4;
const LZ4_MAX_BLOCK_SIZE_256KB = 5;
const LZ4_MAX_BLOCK_SIZE_1MB = 6;
const LZ4_MAX_BLOCK_SIZE_4MB = 7;

const BLOCK_MAX_SIZES: Record<number, number> = {
    [LZ4_MAX_BLOCK_SIZE_64KB]: 64 * 1024,
    [LZ4_MAX_BLOCK_SIZE_256KB]: 256 * 1024,
    [LZ4_MAX_BLOCK_SIZE_1MB]: 1024 * 1024,
    [LZ4_MAX_BLOCK_SIZE_4MB]: 4 * 1024 * 1024,
};

function selectBlockMaxSize(contentSize: number): number {
    if (contentSize <= 64 * 1024) { return LZ4_MAX_BLOCK_SIZE_64KB; }
    if (contentSize <= 256 * 1024) { return LZ4_MAX_BLOCK_SIZE_256KB; }
    if (contentSize <= 1024 * 1024) { return LZ4_MAX_BLOCK_SIZE_1MB; }
    return LZ4_MAX_BLOCK_SIZE_4MB;
}

/**
 * Compress data into an LZ4 frame.
 * Uses independent blocks, content size, and content checksum.
 */
export function compressFrame(input: Buffer): Buffer {
    const contentSize = input.length;
    const blockMaxSizeCode = selectBlockMaxSize(contentSize);
    const blockMaxSize = BLOCK_MAX_SIZES[blockMaxSizeCode];

    const chunks: Buffer[] = [];

    // Magic number (4 bytes LE)
    const magic = Buffer.allocUnsafe(4);
    magic.writeUInt32LE(LZ4_FRAME_MAGIC, 0);
    chunks.push(magic);

    // Frame descriptor
    // FLG byte: version=01, B.Indep=1, B.Checksum=0, C.Size=1, C.Checksum=1, Reserved=0, DictID=0
    // Bits: 01 1 0 1 1 0 0 = 0x6C
    const flg = 0x6C;
    // BD byte: Reserved=0, BlockMaxSize=blockMaxSizeCode, Reserved=0000
    const bd = (blockMaxSizeCode << 4) & 0x70;

    // Content size (8 bytes LE)
    const descriptor = Buffer.allocUnsafe(2 + 8);
    descriptor[0] = flg;
    descriptor[1] = bd;
    // Write content size as 8-byte LE (JS safe for sizes up to 2^53)
    descriptor.writeUInt32LE(contentSize >>> 0, 2);
    descriptor.writeUInt32LE(Math.floor(contentSize / 0x100000000) >>> 0, 6);

    // Header checksum: xxHash32 of descriptor bytes, take second byte: (hash >> 8) & 0xFF
    const hc = (xxHash32(descriptor, 0) >> 8) & 0xFF;
    const headerBuf = Buffer.allocUnsafe(2 + 8 + 1);
    descriptor.copy(headerBuf, 0);
    headerBuf[10] = hc;
    chunks.push(headerBuf);

    // Data blocks
    let offset = 0;
    while (offset < contentSize) {
        const blockEnd = Math.min(offset + blockMaxSize, contentSize);
        const raw = input.subarray(offset, blockEnd);
        const compressed = compressBlock(raw);

        const blockHeader = Buffer.allocUnsafe(4);
        if (compressed.length >= raw.length) {
            // Store uncompressed (set high bit)
            blockHeader.writeUInt32LE((raw.length | 0x80000000) >>> 0, 0);
            chunks.push(blockHeader);
            chunks.push(raw);
        } else {
            blockHeader.writeUInt32LE(compressed.length, 0);
            chunks.push(blockHeader);
            chunks.push(compressed);
        }

        offset = blockEnd;
    }

    // EndMark (4 bytes of zeros)
    const endMark = Buffer.alloc(4);
    chunks.push(endMark);

    // Content checksum
    const contentChecksum = Buffer.allocUnsafe(4);
    contentChecksum.writeUInt32LE(xxHash32(input, 0) >>> 0, 0);
    chunks.push(contentChecksum);

    return Buffer.concat(chunks);
}

/**
 * Decompress an LZ4 frame back to the original data.
 */
export function decompressFrame(input: Buffer): Buffer {
    let pos = 0;
    const inputLen = input.length;
    const ensureBytes = (needed: number, context: string): void => {
        if (pos + needed > inputLen) {
            throw new Error(`Truncated LZ4 frame: ${context}`);
        }
    };

    // Magic number
    ensureBytes(4, "missing magic");
    const magic = input.readUInt32LE(pos); pos += 4;
    if (magic !== LZ4_FRAME_MAGIC) {
        throw new Error(`Invalid LZ4 frame magic: 0x${magic.toString(16)}`);
    }

    // Frame descriptor
    ensureBytes(2, "missing frame descriptor");
    const flg = input[pos++];
    const bd = input[pos++];

    const version = (flg >> 6) & 0x03;
    if (version !== 1) {
        throw new Error(`Unsupported LZ4 frame version: ${version}`);
    }

    const blockChecksum = (flg >> 4) & 1;
    const contentSizeFlag = (flg >> 3) & 1;
    const contentChecksumFlag = (flg >> 2) & 1;

    let contentSize = -1;
    if (contentSizeFlag) {
        ensureBytes(8, "missing content size");
        const lo = input.readUInt32LE(pos); pos += 4;
        const hi = input.readUInt32LE(pos); pos += 4;
        contentSize = lo + hi * 0x100000000;
    }

    // Dictionary ID: skip if present
    if (flg & 1) {
        ensureBytes(4, "missing dictionary id");
        pos += 4;
    }

    // Validate header checksum: xxHash32 of descriptor bytes (FLG..end), second byte
    const descriptorStart = 4; // right after magic
    const descriptorEnd = pos;
    const descriptorBytes = input.subarray(descriptorStart, descriptorEnd);
    const expectedHC = (xxHash32(descriptorBytes, 0) >> 8) & 0xFF;
    ensureBytes(1, "missing header checksum");
    const actualHC = input[pos];
    if (actualHC !== expectedHC) {
        throw new Error(`LZ4 header checksum mismatch: expected 0x${expectedHC.toString(16)}, got 0x${actualHC.toString(16)}`);
    }
    pos += 1;

    const blockMaxSizeCode = (bd >> 4) & 0x07;
    const blockMaxSize = BLOCK_MAX_SIZES[blockMaxSizeCode];
    if (!blockMaxSize) {
        throw new Error(`Invalid LZ4 block max size code: ${blockMaxSizeCode}`);
    }

    // Decode blocks
    const outputChunks: Buffer[] = [];
    let totalDecompressed = 0;

    while (true) {
        ensureBytes(4, "missing EndMark or block header");
        const blockSizeRaw = input.readUInt32LE(pos); pos += 4;

        // EndMark
        if (blockSizeRaw === 0) {
            break;
        }

        const isUncompressed = (blockSizeRaw & 0x80000000) !== 0;
        const blockDataSize = blockSizeRaw & 0x7FFFFFFF;
        if (blockDataSize > blockMaxSize) {
            throw new Error(`Invalid LZ4 block size: ${blockDataSize}`);
        }
        ensureBytes(blockDataSize, "truncated block data");

        const blockData = input.subarray(pos, pos + blockDataSize);
        pos += blockDataSize;

        if (blockChecksum) {
            ensureBytes(4, "truncated block checksum");
            pos += 4; // skip block checksum
        }

        if (isUncompressed) {
            outputChunks.push(Buffer.from(blockData));
            totalDecompressed += blockDataSize;
        } else {
            // We need to know the uncompressed size for block decompression.
            // Use blockMaxSize as upper bound, or contentSize if single block.
            const maxUncompressed = contentSize >= 0 && contentSize <= blockMaxSize
                ? contentSize - totalDecompressed
                : blockMaxSize;
            if (maxUncompressed < 0) {
                throw new Error("Invalid LZ4 frame content size");
            }
            const decompressed = decompressBlockSafe(blockData, maxUncompressed);
            outputChunks.push(decompressed);
            totalDecompressed += decompressed.length;
        }
    }

    if (contentSize >= 0 && totalDecompressed !== contentSize) {
        throw new Error(`LZ4 content size mismatch: expected ${contentSize} bytes, got ${totalDecompressed}`);
    }

    // Content checksum verification
    if (contentChecksumFlag) {
        ensureBytes(4, "missing content checksum");
        const expectedChecksum = input.readUInt32LE(pos);
        pos += 4;
        const result = Buffer.concat(outputChunks);
        const actualChecksum = xxHash32(result, 0) >>> 0;
        if (actualChecksum !== expectedChecksum) {
            throw new Error(`LZ4 content checksum mismatch: expected 0x${expectedChecksum.toString(16)}, got 0x${actualChecksum.toString(16)}`);
        }
        if (pos !== inputLen) {
            throw new Error("Invalid LZ4 frame: trailing bytes after content checksum");
        }
        return result;
    }

    if (pos !== inputLen) {
        throw new Error("Invalid LZ4 frame: trailing bytes after EndMark");
    }

    return Buffer.concat(outputChunks);
}

/**
 * Decompress a block where the exact uncompressed size isn't known.
 * Decodes incrementally up to maxSize.
 */
function decompressBlockSafe(src: Buffer, maxSize: number): Buffer {
    const dst = Buffer.allocUnsafe(maxSize);
    let srcPos = 0;
    let dstPos = 0;
    const srcLen = src.length;

    while (srcPos < srcLen) {
        const token = src[srcPos++];

        // Literal length
        let litLen = (token >> 4) & 0x0F;
        if (litLen === 15) {
            let s: number;
            do {
                if (srcPos >= srcLen) {
                    throw new Error("LZ4 decompression error: truncated literal length");
                }
                s = src[srcPos++];
                litLen += s;
            } while (s === 255);
        }

        if (litLen > 0) {
            if (srcPos + litLen > srcLen) {
                throw new Error("LZ4 decompression error: truncated literals");
            }
            if (dstPos + litLen > maxSize) {
                throw new Error("LZ4 decompression error: output overflow");
            }
            src.copy(dst, dstPos, srcPos, srcPos + litLen);
            srcPos += litLen;
            dstPos += litLen;
        }

        if (srcPos >= srcLen) {
            break;
        }

        // Offset
        if (srcPos + 1 >= srcLen) {
            throw new Error("LZ4 decompression error: truncated offset");
        }
        const offset = src[srcPos] | (src[srcPos + 1] << 8);
        srcPos += 2;
        if (offset === 0) {
            throw new Error("LZ4 decompression error: invalid offset 0");
        }
        if (offset > dstPos) {
            throw new Error(`LZ4 decompression error: invalid match offset ${offset}`);
        }

        // Match length
        let matchLen = (token & 0x0F) + MIN_MATCH;
        if ((token & 0x0F) === 15) {
            let s: number;
            do {
                if (srcPos >= srcLen) {
                    throw new Error("LZ4 decompression error: truncated match length");
                }
                s = src[srcPos++];
                matchLen += s;
            } while (s === 255);
        }
        if (dstPos + matchLen > maxSize) {
            throw new Error("LZ4 decompression error: output overflow");
        }

        let matchPos = dstPos - offset;
        for (let i = 0; i < matchLen; i++) {
            dst[dstPos++] = dst[matchPos++];
        }
    }

    return dst.subarray(0, dstPos);
}

// ── KafkaJS Codec ───────────────────────────────────────────────────────

/**
 * Creates an LZ4 compression codec compatible with KafkaJS.
 */
export function createLZ4Codec(): () => { compress(encoder: { buffer: Buffer }): Promise<Buffer>; decompress(buffer: Buffer): Promise<Buffer> } {
    return () => ({
        async compress(encoder: { buffer: Buffer }): Promise<Buffer> {
            return compressFrame(encoder.buffer);
        },

        async decompress(buffer: Buffer): Promise<Buffer> {
            return decompressFrame(buffer);
        },
    });
}
