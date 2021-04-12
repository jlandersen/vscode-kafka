import { Position, Range, TextDocument } from "vscode";
import { findFirst } from "../../utils/arrays";
import { consumerModel, Model, producerModel } from "../model";

export enum NodeKind {
    document,
    producerBlock,
    producerValue,
    consumerBlock,
    consumerGroupId,
    property,
    propertyKey,
    propertyAssigner,
    propertyValue,
    mustacheExpression
}
export interface Node {
    start: Position;
    end: Position;
    findNodeBefore(offset: Position): Node;
    lastChild: Node | undefined;
    parent: Node | undefined;
    kind: NodeKind;

}

class BaseNode implements Node {

    public parent: Node | undefined;

    constructor(public readonly start: Position, public readonly end: Position, public readonly kind: NodeKind) {

    }

    public findNodeBefore(offset: Position): Node {
        return this;
    }

    public get lastChild(): Node | undefined { return undefined; }
}

class ChildrenNode<T extends Node> extends BaseNode {

    protected readonly children: Array<T> = [];

    public addChild(node: T) {
        node.parent = this;
        this.children.push(node);
    }
    public findNodeBefore(offset: Position): Node {
        const idx = findFirst(this.children, c => offset.isBeforeOrEqual(c.start)) - 1;
        if (idx >= 0) {
            const child = this.children[idx];
            if (offset.isAfter(child.start)) {
                if (offset.isBefore(child.end)) {
                    return child.findNodeBefore(offset);
                }
                const lastChild = child.lastChild;
                if (lastChild && lastChild.end.isEqual(child.end)) {
                    return child.findNodeBefore(offset);
                }
                return child;
            }
        }
        return this;
    }

    public get lastChild(): Node | undefined { return this.children.length ? this.children[this.children.length - 1] : void 0; };
}

export class KafkaFileDocument extends ChildrenNode<Block> {

    constructor(start: Position, end: Position) {
        super(start, end, NodeKind.document);
    }

    public get blocks(): Array<Block> {
        return this.children;
    }
}

export class Chunk extends BaseNode {

    constructor(public readonly content: string, start: Position, end: Position, kind: NodeKind) {
        super(start, end, kind);
    }
}

export class Property extends BaseNode {

    constructor(public readonly key?: Chunk, public readonly assignerCharacter?: number, public readonly value?: Chunk) {
        super(key?.start || value?.start || new Position(0, 0,), value?.end || key?.end || new Position(0, 0,), NodeKind.property);
        if (key) {
            key.parent = this;
        }
        if (value) {
            value.parent = this;
        }
    }

    public get propertyName(): string | undefined {
        return this.key?.content.trim();
    }

    public get propertyValue(): string | undefined {
        return this.value?.content.trim();
    }

    public get propertyRange(): Range {
        const start = this.start;
        const end = this.end;
        return new Range(start, end);
    }

    public get propertyKeyRange(): Range {
        const start = this.start;
        const end = this.assignerCharacter ? new Position(this.start.line, this.assignerCharacter) : this.end;
        return new Range(start, end);
    }

    public get propertyValueRange(): Range | undefined {
        if (!this.assignerCharacter) {
            return;
        }
        const start = new Position(this.start.line, this.assignerCharacter + 1);
        const end = this.end;
        return new Range(start, end);
    }

    public get propertyTrimmedValueRange(): Range | undefined {
        if (!this.assignerCharacter) {
            return;
        }
        const value = this.value?.content;
        if (!value) {
            return;
        }
        let startChar = 0;
        for (startChar = 0; startChar < value.length; startChar++) {
            if (value.charAt(startChar) !== ' ') {
                break;
            }
        }
        let endChar = value.length;
        for (endChar = value.length - 1; endChar >= 0; endChar--) {
            if (value.charAt(endChar) !== ' ') {
                endChar++;
                break;
            }
        }
        const start = new Position(this.start.line, startChar + this.assignerCharacter + 1);
        const end = new Position(this.end.line, endChar + this.assignerCharacter + 1);
        return new Range(start, end);
    }

    isBeforeAssigner(position: Position): boolean {
        if (this.assignerCharacter) {
            return position.character <= this.assignerCharacter;
        }
        return true;
    }
}

export abstract class Block extends ChildrenNode<Property | Chunk> {

    constructor(start: Position, end: Position, public readonly type: BlockType, public readonly model: Model) {
        super(start, end, type === BlockType.consumer ? NodeKind.consumerBlock : NodeKind.producerBlock);
    }

    public get properties(): Array<Property> {
        return <Array<Property>>(
            this.children
                .filter(node => node.kind === NodeKind.property));
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
        super(start, end, BlockType.producer, producerModel);
    }

}

export class ConsumerBlock extends Block {

    public consumerGroupId: Chunk | undefined;

    constructor(start: Position, end: Position) {
        super(start, end, BlockType.consumer, consumerModel);
    }
}

export class DynamicChunk extends ChildrenNode<MustacheExpression> {

    constructor(public readonly content: string, start: Position, end: Position, kind: NodeKind) {
        super(start, end, kind);
        parseMustacheExpressions(this);
    }
}

export class MustacheExpression extends BaseNode {

    constructor(start: Position, public readonly opened: boolean, end: Position, public readonly closed: boolean) {
        super(start, end, NodeKind.mustacheExpression);
    }

    public get expressionRange(): Range {
        const start = new Position(this.start.line, this.start.character + 2);
        const end = new Position(this.end.line, this.end.character - 2);
        return new Range(start, end);
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
                kafkaFileDocument.addChild(createBlock(blockStartLine, blockEndLine, document, currentBlockType));
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
        kafkaFileDocument.addChild(createBlock(blockStartLine, document.lineCount - 1, document, currentBlockType));
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

        if (isPropertyLine(lineText, block.model)) {
            // Known properties
            block.addChild(createProperty(lineText, currentLine, block));
            continue;
        }

        // The rest of the content is the value
        const startValue = new Position(currentLine, 0);
        const endValue = new Position(block.end.line + 1, 0);
        const contentValue = document.getText(new Range(startValue, endValue)).trim();
        block.value = new DynamicChunk(contentValue, startValue, endValue, NodeKind.producerValue);
        block.addChild(block.value);
        break;
    }
}

function isPropertyLine(lineText: string, model: Model): boolean {
    const index = lineText.indexOf(':');
    if (index === -1) {
        return false;
    }
    const propertyName = lineText.substring(0, index);
    return model.hasDefinition(propertyName);
}

function isIgnoreLine(lineText: string): boolean {
    return lineText.startsWith("--") || lineText.trim().length === 0;
}

function parseConsumerBlock(block: ConsumerBlock, document: TextDocument) {
    for (let currentLine = block.start.line; currentLine <= block.end.line; currentLine++) {
        const lineText = document.lineAt(currentLine).text;

        if (currentLine === block.start.line) {
            const start = "CONSUMER".length;
            const end = lineText.length;
            const content = lineText.substr(start).trim();
            const consumerGroupId = new Chunk(content, new Position(currentLine, start), new Position(currentLine, end), NodeKind.consumerGroupId);
            consumerGroupId.parent = block;
            block.consumerGroupId = consumerGroupId;
            continue;
        }

        if (isIgnoreLine(lineText)) {
            // The line is a comment or a blank line
            continue;
        }
        // Add the line content as property (ex : topic: MY_TOPIC)
        block.addChild(createProperty(lineText, currentLine, block));
    }
}

function createProperty(lineText: string, lineNumber: number, parent: Block): Property {
    let propertyKey: Chunk | undefined = undefined;
    let propertyValue: Chunk | undefined = undefined;
    let separatorCharacter = undefined;
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
                    propertyKey = new Chunk(content, new Position(lineNumber, start), new Position(lineNumber, end), NodeKind.propertyKey);
                }
                separatorCharacter = i;
                withinValue = true;
                start = i + 1;
            }
        } else {
            if (start === -1) {
                start = i;
            }
        }
    }
    if (start !== -1) {
        const end = lineText.length;
        const content = lineText.substr(start, end);
        if (withinValue) {
            const propertyName = propertyKey?.content.trim();
            if (propertyName === 'key') {
                propertyValue = new DynamicChunk(content, new Position(lineNumber, start), new Position(lineNumber, end), NodeKind.propertyValue);
            } else {
                propertyValue = new Chunk(content, new Position(lineNumber, start), new Position(lineNumber, end), NodeKind.propertyValue);
            }
        } else {
            propertyKey = new Chunk(content, new Position(lineNumber, start), new Position(lineNumber, end), NodeKind.propertyKey);
        }
    }
    return new Property(propertyKey, separatorCharacter, propertyValue);
}

function parseMustacheExpressions(parent: DynamicChunk) {
    const content = parent.content;
    let currentLine = parent.start.line;
    let currentCharacter = parent.start.character;
    let last: string | undefined;
    let startExpression: Position | undefined;
    let endExpression: Position | undefined;
    let expression: MustacheExpression | undefined;
    for (let i = 0; i < content.length; i++) {
        const current = content[i];
        switch (current) {
            case '\r':
                currentLine++;
                currentCharacter = 0;
                break;
            case '\n': {
                if (last !== '\r') {
                    currentLine++;
                    currentCharacter = 0;
                }
                break;
            }
            case '{': {
                if (last === '{') {
                    // Start mustache expression
                    if (!startExpression) {
                        startExpression = new Position(currentLine, currentCharacter - 1);
                    }
                }
                break;
            }
            case '}': {
                if (last === '}') {
                    // End mustache expression
                    endExpression = new Position(currentLine, currentCharacter + 1);
                    if (startExpression) {
                        expression = new MustacheExpression(startExpression, true, endExpression, true);
                        parent.addChild(expression);
                        startExpression = undefined;
                        endExpression = undefined;
                    }
                }
                break;
            }
        }
        if (current !== '\r' && current !== '\n') {
            currentCharacter++;
        }
        last = current;
    }
}

