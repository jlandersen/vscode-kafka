import { Position, Range, TextDocument } from "vscode";

export interface Node {
    start: Position;
    end: Position;
}

class BaseNode implements Node {

    constructor(public readonly start: Position, public readonly end: Position) {

    }
}
export class KafkaFileDocument extends BaseNode {

    public readonly blocks: Array<Block> = [];
    constructor(start: Position, end: Position) {
        super(start, end);
    }
}

export class Chunk extends BaseNode {

    constructor(public readonly content: string, start: Position, end: Position) {
        super(start, end);
    }
}

export class Property {

    constructor(public readonly key?: Chunk, public readonly value?: Chunk) {

    }

    public get propertyName(): string | undefined {
        return this.key?.content;
    }
}

export class Block extends BaseNode {

    public readonly properties: Array<Property> = [];

    constructor(public readonly type: BlockType, start: Position, end: Position) {
        super(start, end);
    }

    getPropertyValue(name: string): string | undefined {
        const property = this.getProperty(name);
        return property?.value?.content;
    }

    getProperty(name: string): Property | undefined {
        return this.properties.find(p => p.propertyName === name);
    }
}

export class ProducerBlock extends Block {
    public value: Chunk | undefined;

    constructor(start: Position, end: Position) {
        super(BlockType.producer, start, end);
    }
}

export class ConsumerBlock extends Block {

    public consumerGroupId: Chunk | undefined;

    constructor(start: Position, end: Position) {
        super(BlockType.consumer, start, end);
    }
}

export enum BlockType {
    producer = 'PRODUCER',
    consumer = 'CONSUMER'
}

export function parseKafkaFile(document: TextDocument): KafkaFileDocument {
    const lineCount = document.lineCount;
    const start = new Position(0, 0);
    const end = document.lineAt(lineCount - 1).range.end;
    const kafkaFileDocument = new KafkaFileDocument(start, end);
    const blocks = kafkaFileDocument.blocks;

    // Create block PRODUCER / CONSUMER block codeLens
    let blockStartLine = 0;
    let blockEndLine = 0;
    let currentBlockType = undefined;
    for (let currentLine = 0; currentLine < document.lineCount; currentLine++) {
        const lineText = document.lineAt(currentLine).text;
        if (currentBlockType === undefined) {
            // Search start of PRODUCER / CONSUMER block
            const blockType = getBlockType(lineText);
            if (blockType !== undefined) {
                blockStartLine = currentLine;
                currentBlockType = blockType;
                continue;
            }
        } else {
            // A PRODUCER / CONSUMER block is parsing, check if it's the end of the block
            if (isEndBlock(lineText, currentBlockType)) {
                blockEndLine = currentLine - 1;
                blocks.push(createBlock(blockStartLine, blockEndLine, document, currentBlockType));
                if (currentBlockType === BlockType.consumer) {
                    currentBlockType = getBlockType(lineText);
                    if (currentBlockType !== undefined) {
                        blockStartLine = currentLine;
                    }
                } else {
                    currentBlockType = undefined;
                }
                continue;
            }
        }
    }

    if (currentBlockType !== undefined) {
        blocks.push(createBlock(blockStartLine, document.lineCount - 1, document, currentBlockType));
    }

    return kafkaFileDocument;
}

function getBlockType(lineText: string): BlockType | undefined {
    if (lineText.startsWith(BlockType.producer.toString())) {
        return BlockType.producer;
    } else if (lineText.startsWith(BlockType.consumer.toString())) {
        return BlockType.consumer;
    }
    return undefined;
}
function isEndBlock(lineText: string, blockType: BlockType): boolean {
    if (blockType === BlockType.consumer) {
        return isSeparator(lineText) || getBlockType(lineText) !== undefined;
    }
    return isSeparator(lineText);
}

function isSeparator(lineText: string): boolean {
    return lineText.startsWith("###");
}

function createBlock(blockStartLine: number, blockEndLine: number, document: TextDocument, blockType: BlockType): Block {
    const start = new Position(blockStartLine, 0);
    const end = document.lineAt(blockEndLine).range.end;
    if (blockType === BlockType.consumer) {
        const block = new ConsumerBlock(start, end);
        parseConsumerBlock(block, document);
        return block;
    }
    const block = new ProducerBlock(start, end);
    parseProducerBlock(block, document);
    return block;
}

function parseProducerBlock(block: ProducerBlock, document: TextDocument) {
    for (let currentLine = block.start.line + 1; currentLine <= block.end.line; currentLine++) {
        const lineText = document.lineAt(currentLine).text;

        if (isIgnoreLine(lineText)) {
            // The line is a comment or a blank line
            continue;
        }

        if (startsWith(lineText, ["topic:", "key:", "key-format:", "value-format:"])) {
            // Known properties
            block.properties.push(createProperty(lineText, currentLine));
            continue;
        }

        // The rest of the content is the value
        const startValue = new Position(currentLine,0);
        const endValue = new Position(block.end.line + 1, 0);
        const contentValue = document.getText(new Range(startValue, endValue)).trim();
        block.value = new Chunk(contentValue, startValue, endValue);
        break;
    }
}

function startsWith(lineText: string, searchStrings:string[]) : boolean {
    for (let i = 0; i < searchStrings.length; i++) {
        if (lineText.startsWith(searchStrings[i])) {
            return true;
        }
    }
    return  false;
}

function isIgnoreLine(lineText : string) : boolean{
    return lineText.startsWith("--") || lineText.trim().length === 0;
}

function parseConsumerBlock(block: ConsumerBlock, document: TextDocument) {
    for (let currentLine = block.start.line; currentLine <= block.end.line; currentLine++) {
        const lineText = document.lineAt(currentLine).text;

        if (currentLine === block.start.line) {
            const start = "CONSUMER".length;
            const end = lineText.length;
            const content = lineText.substr(start).trim();
            const consumerGroupId = new Chunk(content, new Position(currentLine, start), new Position(currentLine, end));
            block.consumerGroupId = consumerGroupId;
            continue;
        }

        if (isIgnoreLine(lineText)) {
            // The line is a comment or a blank line
            continue;
        }
        // Add the line content as property (ex : topic: MY_TOPIC)
        block.properties.push(createProperty(lineText, currentLine));
    }
}

function createProperty(lineText: string, lineNumber: number): Property {
    let propertyKey: Chunk | undefined = undefined;
    let propertyValue: Chunk | undefined = undefined;
    let withinValue = false;
    let start = -1;
    for (let i = 0; i < lineText.length; i++) {
        const ch = lineText[i];
        if (ch === ' ' || ch === '\t') {
            if (start === -1) {
                continue;
            }
        } else if (ch === ':') {
            if (!withinValue) {
                if (start !== -1) {
                    const end = i;
                    const content = lineText.substr(start, end);
                    propertyKey = new Chunk(content, new Position(lineNumber, start), new Position(lineNumber, end));
                }
                withinValue = true;
                start = -1;
            }
        } else {
            if (start === -1) {
                start = i;
            }
        }
    }
    if (start !== -1) {
        const end = lineText.length;
        const content = lineText.substr(start, end).trim();
        propertyValue = new Chunk(content, new Position(lineNumber, start), new Position(lineNumber, end));
    }
    return new Property(propertyKey, propertyValue);
}
