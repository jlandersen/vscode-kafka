import { Position, Range, TextDocument } from "vscode";
import { SerializationSetting } from "../../../client/serialization";
import { LaunchConsumerCommand } from "../../../commands/consumers";
import { ProduceRecordCommand } from "../../../commands/producers";
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
    mustacheExpression,
    calleeFunction,
    parameter
}
export interface Node {
    start: Position;
    end: Position;
    range(): Range;
    findNodeBefore(offset: Position): Node;
    findNodeAt(offset: Position): Node;
    lastChild: Node | undefined;
    parent: Node | undefined;
    kind: NodeKind;

}

class BaseNode implements Node {

    public parent: Node | undefined;

    constructor(public readonly start: Position, public readonly end: Position, public readonly kind: NodeKind) {

    }

    public range(): Range {
        const start = this.start;
        const end = this.end;
        return new Range(start, end);
    }

    public findNodeBefore(offset: Position): Node {
        return this;
    }

    public findNodeAt(offset: Position): Node {
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

    public findNodeAt(offset: Position): Node {
        const idx = findFirst(this.children, c => offset.isBeforeOrEqual(c.start)) - 1;
        if (idx >= 0) {
            const child = this.children[idx];
            if (offset.isAfter(child.start) && offset.isBeforeOrEqual(child.end)) {
                return child.findNodeAt(offset);
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

    findNodeAt(position: Position): Node {
        if (this.isBeforeAssigner(position)) {
            return this.key?.findNodeAt(position) || this;
        }
        return this.value?.findNodeAt(position) || this;
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
        return property?.propertyValue;
    }

    getProperty(name: string): Property | undefined {
        return this.properties.find(p => p.propertyName === name);
    }
}

export class ProducerBlock extends Block {

    public value: DynamicChunk | undefined;

    constructor(start: Position, end: Position) {
        super(start, end, BlockType.producer, producerModel);
    }

    createCommand(
        clusterId: string
    ): ProduceRecordCommand {
        let topicId;
        let key;
        let value = this.value?.content;
        let keyFormat;
        let keyFormatSettings: Array<SerializationSetting> | undefined;
        let valueFormat;
        let valueFormatSettings: Array<SerializationSetting> | undefined;
        let headers: Map<String, String> | undefined;
        this.properties.forEach((property) => {
            switch (property.propertyName) {
                case "topic":
                    topicId = property.propertyValue;
                    break;
                case "key":
                    key = property.propertyValue;
                    break;
                case "key-format": {
                    const callee = <CalleeFunction>property.value;
                    keyFormat = callee.functionName;
                    keyFormatSettings = getSerializationSettings(callee);
                    break;
                }
                case "value-format": {
                    const callee = <CalleeFunction>property.value;
                    valueFormat = callee.functionName;
                    valueFormatSettings = getSerializationSettings(callee);
                    break;
                }
                case "headers": {
                    headers = parseHeaders(property.propertyValue);
                    break;
                }
            }
        });
        return {
            clusterId,
            topicId,
            key,
            value,
            messageKeyFormat: keyFormat,
            messageKeyFormatSettings: keyFormatSettings,
            messageValueFormat: valueFormat,
            messageValueFormatSettings: valueFormatSettings,
            headers,
        } as ProduceRecordCommand;
    }

}

export class ConsumerBlock extends Block {

    public consumerGroupId: Chunk | undefined;

    constructor(start: Position, end: Position) {
        super(start, end, BlockType.consumer, consumerModel);
    }

    createCommand(selectedClusterId: string | undefined): LaunchConsumerCommand {
        let consumerGroupId = this.consumerGroupId?.content;
        let topicId;
        let partitions;
        let offset;
        let keyFormat;
        let keyFormatSettings;
        let valueFormat;
        let valueFormatSettings;
        this.properties.forEach(property => {
            switch (property.propertyName) {
                case 'topic':
                    topicId = property.propertyValue;
                    break;
                case 'from':
                    offset = property.propertyValue;
                    break;
                case 'partitions':
                    partitions = property.propertyValue;
                    break;
                case 'key-format': {
                    const callee = <CalleeFunction>property.value;
                    keyFormat = callee.functionName;
                    keyFormatSettings = getSerializationSettings(callee);
                    break;
                }
                case 'value-format': {
                    const callee = <CalleeFunction>property.value;
                    valueFormat = callee.functionName;
                    valueFormatSettings = getSerializationSettings(callee);
                    break;
                }
            }
        });
    
        return {
            clusterId: selectedClusterId,
            consumerGroupId,
            topicId: topicId || '',
            fromOffset: offset,
            partitions,
            messageKeyFormat: keyFormat,
            messageValueFormat: valueFormat,
            messageKeyFormatSettings: keyFormatSettings,
            messageValueFormatSettings: valueFormatSettings
        } as LaunchConsumerCommand;
    }
}

export class DynamicChunk extends ChildrenNode<MustacheExpression> {

    constructor(public readonly content: string, start: Position, end: Position, kind: NodeKind) {
        super(start, end, kind);
        parseMustacheExpressions(this);
    }

    public get expressions(): Array<MustacheExpression> {
        return <Array<MustacheExpression>>(
            this.children
                .filter(node => node.kind === NodeKind.mustacheExpression));
    }

}

export class Parameter extends Chunk {
    name?: string;
    
    public get value() : string {
        return this.content?.trim();
    }
    
}

export class CalleeFunction extends ChildrenNode<Parameter> {
    startParametersCharacter?: number;
    endParametersCharacter?: number;

    constructor(public readonly content: string, start: Position, end: Position) {
        super(start, end, NodeKind.calleeFunction);
        parseParameters(this);
    }

    public get functionName() : string {
        return this.startParametersCharacter ? this.content.substring(0, this.startParametersCharacter - this.start.character).trim() : this.content.trim();
    }

    public get parameters(): Array<Parameter> {
        return this.children;
    }
    
}

/**
 * Mustache expression AST (ex : {{random.words}})
 */
export class MustacheExpression extends Chunk {

    // Unexpected start edges '{{' inside the expression (ex : {{random.w{{ords}})
    public readonly unexpectedEdges: Array<ExpressionEdge> = [];

    constructor(content: string, start: Position, public readonly opened: boolean, end: Position, public readonly closed: boolean) {
        super(content, start, end, NodeKind.mustacheExpression);
    }

    /**
     * Returns the range of the enclosed expression 
     * 
     * For example for {{random.words}}, it will return ranges of random.words.
     */
    public get enclosedExpressionRange(): Range {
        const start = new Position(this.start.line, this.start.character + ((this.opened) ? 2 : 0));
        const end = new Position(this.end.line, this.end.character - ((this.closed) ? 2 : 0));
        return new Range(start, end);
    }

    /**
     * Return true if the given position is after an unexpected edge (ex : {{random.w{{| and false otherwise.
     * 
     * @param position the position to check.
     * 
     * @returns true if the given position is after an unexpected edge (ex : {{random.w{{| and false otherwise.
     */
    public isAfterAnUnexpectedEdge(position: Position): boolean {
        if (this.unexpectedEdges.length < 1) {
            return false;
        }
        const pos = this.unexpectedEdges[0];
        return position.isAfterOrEqual(pos.position);
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
            switch (propertyName) {
                case "key":
                    propertyValue = new DynamicChunk(content, new Position(lineNumber, start), new Position(lineNumber, end), NodeKind.propertyValue);
                    break;
                case "key-format":
                case "value-format":
                    propertyValue = new CalleeFunction(content, new Position(lineNumber, start), new Position(lineNumber, end));
                    break;
                default:
                    propertyValue = new Chunk(content, new Position(lineNumber, start), new Position(lineNumber, end), NodeKind.propertyValue);
                    break;
            }            
        } else {
            propertyKey = new Chunk(content, new Position(lineNumber, start), new Position(lineNumber, end), NodeKind.propertyKey);
        }
    }
    return new Property(propertyKey, separatorCharacter, propertyValue);
}

/**
 * Position and offset of mustache expression edge :
 *  - start '{{'
 *  -  end '}}' .
 */
export class ExpressionEdge {

    constructor(readonly position: Position, readonly offset: number, readonly open: boolean) {

    }
}

function parseParameters(parent: CalleeFunction) {
    const content = parent.content;
    let startLine = parent.start.line;
    let startColumn = parent.start.character;
    let currentLine = startLine;
    let currentColumn = startColumn;
    let previousChar: string | undefined;
    let startParameter: number | undefined;

    function addParameterIfNeeded() {
        if (startParameter) {
            const value = content.substring(startParameter - startColumn, currentColumn - startColumn);
            const start = new Position(currentLine, startParameter);
            const end = new Position(currentLine, currentColumn);
            parent.addChild(new Parameter(value, start, end, NodeKind.parameter));
        }
    }

    for (let currentOffset = 0; currentOffset < content.length; currentOffset++) {
        const currentChar = content[currentOffset];
        switch (currentChar) {
            case '\r':
                // compute line, column position
                currentLine++;
                currentColumn = 0;
                break;
            case '\n': {
                if (previousChar !== '\r') {
                    // compute line, column position
                    currentLine++;
                    currentColumn = 0;
                }
                break;
            }
            case '(': {
                if (!parent.startParametersCharacter) {
                    parent.startParametersCharacter = currentColumn;
                    startParameter = currentColumn + 1;
                }
                break;
            }
            case ')': {
                parent.endParametersCharacter = currentColumn;
                addParameterIfNeeded();
                startParameter = undefined;
                break;
            }
            case ',': {                
                addParameterIfNeeded();                
                startParameter = currentColumn + 1;
                break;
            }
        }
        if (currentChar !== '\r' && currentChar !== '\n') {
            currentColumn++;
        }
    }
    addParameterIfNeeded();
}

function parseMustacheExpressions(parent: DynamicChunk) {
    const content = parent.content;
    let startLine = parent.start.line;
    let startColumn = parent.start.character;
    let currentLine = startLine;
    let currentColumn = startColumn;
    let previousChar: string | undefined;

    // 1. Collect start/end expression edges position and offset
    const edges: Array<ExpressionEdge> = [];
    let currentOffset = 0;
    for (currentOffset = 0; currentOffset < content.length; currentOffset++) {
        const currentChar = content[currentOffset];
        switch (currentChar) {
            case '\r':
                // compute line, column position
                currentLine++;
                currentColumn = 0;
                break;
            case '\n': {
                if (previousChar !== '\r') {
                    // compute line, column position
                    currentLine++;
                    currentColumn = 0;
                }
                break;
            }
            case '{': {
                if (previousChar === '{') {
                    // Start mustache expression
                    edges.push(new ExpressionEdge(new Position(currentLine, currentColumn - 1), currentOffset - 1, true));
                }
                break;
            }
            case '}': {
                if (previousChar === '}') {
                    // End mustache expression                    
                    edges.push(new ExpressionEdge(new Position(currentLine, currentColumn + 1), currentOffset + 1, false));
                }
                break;
            }
        }
        if (currentChar !== '\r' && currentChar !== '\n') {
            currentColumn++;
        }
        previousChar = currentChar;
    }

    // 2. create mustache expression AST by visiting collected edges

    let previousEdge = new ExpressionEdge(new Position(startLine, startColumn), 0, true);
    const endOfValueEdge = new ExpressionEdge(new Position(currentLine, currentColumn), currentOffset, false);
    for (let i = 0; i < edges.length; i++) {
        const currentEdge = edges[i];
        if (currentEdge.open) {
            // '{{' edge encountered            
            // Try to get the next '}}' edge
            let matchingClosedEdge: ExpressionEdge | undefined;
            const j = getBestIndexForClosingExpression(edges, i + 1);
            if (j < edges.length) {
                matchingClosedEdge = edges[j];
            }

            const openedEdge = currentEdge;
            let closedEdge = endOfValueEdge;
            let closed = false;
            if (matchingClosedEdge) {
                // '}}' has been found
                closed = true;
                closedEdge = matchingClosedEdge;
            }

            const expressionContent = content.substring(openedEdge.offset + 2, closedEdge.offset - (closed ? 2 : 0));
            const expression = new MustacheExpression(expressionContent, openedEdge.position, true, closedEdge.position, closed);
            // Update unexepcted edges
            for (let index = i + 1; index < j; index++) {
                expression.unexpectedEdges.push(edges[index]);
            }
            parent.addChild(expression);
            i = j;
            previousEdge = closedEdge;
        } else {
            // '}}' edge encountered
            const closedEdge = currentEdge;
            const openedEdge = previousEdge;
            const expressionContent = content.substring(openedEdge.offset, closedEdge.offset - 2);
            const expression = new MustacheExpression(expressionContent, openedEdge.position, false, closedEdge.position, true);
            parent.addChild(expression);
        }
    }
}

function getBestIndexForClosingExpression(edges: ExpressionEdge[], start: number): number {
    for (let i = start; i < edges.length; i++) {
        const currentPos = edges[i];
        if (!currentPos.open) {
            return i;
        }
    }
    return edges.length;
}

function getSerializationSettings(
    callee: CalleeFunction
  ): SerializationSetting[] | undefined {
    const parameters = callee.parameters;
    if (parameters.length > 0) {
        return parameters.filter(p => isBufferEncoding(p.value)).map((p) => {
            return { value: p.value as BufferEncoding };
        });
    }
}

function isBufferEncoding(value: string): value is BufferEncoding {
    return ["ascii" , "utf8" , "utf-8" , "utf16le" , "ucs2" , "ucs-2" , "base64" , "base64url" , "latin1" , "binary" , "hex"].includes(value);
  }

function parseHeaders(propertyValue?: string): Map<string, string> | undefined {
    if (propertyValue) {
        const headers = propertyValue
            .split(",")
            .map((it) => it.trim().split("=", 2))
            .filter((it) => it.length === 2)
            .map((it) => [it[0].trim(), it[1].trim()] as [string, string]);

        return new Map(headers);
    }

    return undefined;
}