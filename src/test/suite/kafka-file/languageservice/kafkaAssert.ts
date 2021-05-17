import * as assert from "assert";
import { CodeLens, Position, Range, Command, Uri, workspace, CompletionList, SnippetString, Diagnostic, DiagnosticSeverity, Hover, MarkdownString, DocumentLink } from "vscode";
import { ClientState, ConsumerLaunchState } from "../../../../client";
import { BrokerConfigs } from "../../../../client/config";
import { ProducerLaunchState } from "../../../../client/producer";
import { ConsumerLaunchStateProvider, getLanguageService, LanguageService, ProducerLaunchStateProvider, SelectedClusterProvider, TopicDetail, TopicProvider } from "../../../../kafka-file/languageservice/kafkaFileLanguageService";
import { BlockType, ProducerBlock } from "../../../../kafka-file/languageservice/parser/kafkaFileParser";

export class LanguageServiceConfig implements ProducerLaunchStateProvider, ConsumerLaunchStateProvider, SelectedClusterProvider, TopicProvider {

    private producerLaunchStates = new Map<string, ProducerLaunchState>();

    private consumerLaunchStates = new Map<string, ConsumerLaunchState>();

    private selectedCluster: { clusterId?: string, clusterName?: string, clusterState?: ClientState } | undefined;

    private topicsCache = new Map<string, TopicDetail[]>();

    private autoCreateConfig: BrokerConfigs.AutoCreateTopicResult = { type: "enabled" };

    getProducerLaunchState(uri: Uri): ProducerLaunchState {
        const key = uri.toString();
        const state = this.producerLaunchStates.get(key);
        return state || ProducerLaunchState.idle;
    }

    setProducerLaunchState(uri: Uri, state: ProducerLaunchState) {
        this.producerLaunchStates.set(uri.toString(), state);
    }

    getConsumerLaunchState(clusterId: string, consumerGroupId: string): ConsumerLaunchState {
        const key = this.getConsumerKey(clusterId, consumerGroupId);
        const state = this.consumerLaunchStates.get(key);
        return state || ConsumerLaunchState.idle;
    }

    setConsumerLaunchState(clusterId: string, consumerGroupId: string, state: ConsumerLaunchState) {
        const key = this.getConsumerKey(clusterId, consumerGroupId);
        this.consumerLaunchStates.set(key, state);
    }

    getConsumerKey(clusterId: string, consumerGroupId: string): string {
        return `${clusterId}@${consumerGroupId}`;
    }

    getSelectedCluster() {
        if (this.selectedCluster) {
            return this.selectedCluster;
        }
        return {};
    }

    public setSelectedCluster(selectedCluster: { clusterId?: string, clusterName?: string, clusterState?: ClientState }) {
        this.selectedCluster = selectedCluster;
    }

    public setTopics(clusterId: string, topics: TopicDetail[]) {
        this.topicsCache.set(clusterId, topics);
    }
    async getTopics(clusterId: string): Promise<TopicDetail[]> {
        return this.topicsCache.get(clusterId) || [];
    }

    async getTopic(clusterId: string, topicId: string): Promise<TopicDetail | undefined> {
        const topics = await this.getTopics(clusterId);
        return topics.find(topic => topic.id === topicId);
    }


    public setAutoCreateConfig(autoCreateConfig: BrokerConfigs.AutoCreateTopicResult) {
        this.autoCreateConfig = autoCreateConfig;
    }

    async getAutoCreateTopicEnabled(clusterid: string): Promise<BrokerConfigs.AutoCreateTopicResult> {
        return this.autoCreateConfig;
    }
}

const languageServiceConfig = new LanguageServiceConfig();
const languageService = getLanguageService(languageServiceConfig, languageServiceConfig, languageServiceConfig, languageServiceConfig);

export function getSimpleLanguageService() {
    return languageService;
}
export function getDocument(content: string) {
    return workspace.openTextDocument({
        language: 'kafka',
        content
    });
}
export function position(startLine: number, startCharacter: number): Position {
    return new Position(startLine, startCharacter);
}

export function range(start: Position, end: Position): Range {
    return new Range(start, end);
}

// Code Lens assert

export function codeLens(start: Position, end: Position, command: Command): CodeLens {
    const r = range(start, end);
    return new CodeLens(r, command);
}

export async function assertCodeLens(content: string, expected: Array<CodeLens>, languageService: LanguageService) {
    let document = await getDocument(content);
    let ast = languageService.parseKafkaFileDocument(document);
    const actual = languageService.getCodeLenses(document, ast);
    assert.deepStrictEqual(actual, expected);
}

// Completion assert
export async function testCompletion(value: string, expected: CompletionList, partial = false, ls = languageService) {
    const offset = value.indexOf('|');
    value = value.substr(0, offset) + value.substr(offset + 1);

    let document = await getDocument(value);
    const position = document.positionAt(offset);
    let ast = ls.parseKafkaFileDocument(document);
    const list = await ls.doComplete(document, ast, true, position);
    const items = list?.items;

    // no duplicate labels
    const labels = items?.map(i => i.label).sort();
    let previous = null;
    if (labels) {
        for (const label of labels) {
            assert.ok(previous !== label, `Duplicate label ${label} in ${labels.join(',')}`);
            previous = label;
        }
    }

    if (items) {
        if (!partial) {
            assert.deepStrictEqual(items.length, expected.items.length);
        }
        expected.items.forEach((expectedItem, i) => {
            const actualItem = items[i];
            assert.deepStrictEqual(actualItem?.label, expectedItem.label);
            assert.deepStrictEqual(actualItem?.kind, expectedItem.kind);
            assert.deepStrictEqual((<SnippetString>actualItem?.insertText)?.value, expectedItem.insertText);
            assert.deepStrictEqual(actualItem?.range, expectedItem.range);
        });
    }
}


// Diagnostics assert

export function diagnostic(start: Position, end: Position, message: string, severity: DiagnosticSeverity): Diagnostic {
    const r = range(start, end);
    return new Diagnostic(r, message, severity);
}

export async function assertDiagnostics(content: string, expected: Array<Diagnostic>, ls = languageService) {
    let document = await getDocument(content);
    let ast = ls.parseKafkaFileDocument(document);
    const actual = await ls.doDiagnostics(document, ast, true);
    assert.deepStrictEqual(actual, expected);
}

// Hover assert

export function hover(contents: string, start: Position, end: Position): Hover {
    const r = range(start, end);
    const doc = new MarkdownString(contents);
    doc.isTrusted = true;
    return new Hover(doc, r);
}

export async function assertHover(value: string, expected?: Hover, ls = languageService) {
    const offset = value.indexOf('|');
    value = value.substr(0, offset) + value.substr(offset + 1);

    let document = await getDocument(value);
    const position = document.positionAt(offset);
    let ast = ls.parseKafkaFileDocument(document);
    const actual = await ls.doHover(document, ast, position);
    assert.deepStrictEqual(actual, expected);
    if (actual?.contents && expected?.contents) {
        assert.deepStrictEqual((<MarkdownString>actual.contents[0]).value, (<MarkdownString>expected.contents[0]).value);
    }
}

// Document Link assert

export function documentLink(start: Position, end: Position, target: string): DocumentLink {
    const r = range(start, end);
    return new DocumentLink(r, Uri.parse(target));
}

export async function assertDocumentLinks(content: string, expected: Array<DocumentLink>, ls = languageService) {
    let document = await getDocument(content);
    let ast = ls.parseKafkaFileDocument(document);
    const actual = await ls.provideDocumentLinks(document, ast);
    assert.deepStrictEqual(actual, expected);
}

// Kafka parser assert

export interface ExpectedChunckResult {

    content: string;
    start: Position;
    end: Position;
}
export interface ExpectedPropertyResult {

    propertyName: string;
    key?: ExpectedChunckResult;
    value?: ExpectedChunckResult;
}

export interface ExpectedBlockResult {
    type: BlockType;
    start: Position;
    end: Position;
    properties: Array<ExpectedPropertyResult>
    value?: ExpectedChunckResult
}

export function block(type: BlockType, start: Position, end: Position, properties: Array<ExpectedPropertyResult> = [], value?: ExpectedChunckResult): ExpectedBlockResult {
    return {
        type,
        start,
        end,
        properties,
        value
    };
}

export async function assertParseBlock(content: string, expected: Array<ExpectedBlockResult>) {
    let document = await getDocument(content);
    let ast = getSimpleLanguageService().parseKafkaFileDocument(document);
    assert.deepStrictEqual(ast.blocks.length, expected.length);
    for (let i = 0; i < expected.length; i++) {
        const actualBlock = ast.blocks[i];
        const expectedBlock = expected[i];
        assert.deepStrictEqual(actualBlock.type, expectedBlock.type);
        assert.deepStrictEqual(actualBlock.start, expectedBlock.start);
        assert.deepStrictEqual(actualBlock.end, expectedBlock.end);
        if (BlockType.producer === expectedBlock.type) {
            assert.deepStrictEqual((<ProducerBlock>actualBlock).value?.content, expectedBlock.value?.content);
            assert.deepStrictEqual((<ProducerBlock>actualBlock).value?.start, expectedBlock.value?.start);
            assert.deepStrictEqual((<ProducerBlock>actualBlock).value?.end, expectedBlock.value?.end);
        }
        assert.deepStrictEqual(actualBlock.properties.length, expectedBlock.properties?.length);
        if (!expectedBlock.properties) { return; }
        for (let i = 0; i < actualBlock.properties.length; i++) {
            const actualProperty = actualBlock.properties[i];
            const expectedProperty = expectedBlock.properties[i];
            assert.deepStrictEqual(actualProperty.propertyName, expectedProperty.propertyName);
            assert.deepStrictEqual(actualProperty.key?.content, expectedProperty.key?.content);
            assert.deepStrictEqual(actualProperty.key?.start, expectedProperty.key?.start);
            assert.deepStrictEqual(actualProperty.key?.end, expectedProperty.key?.end);
            assert.deepStrictEqual(actualProperty.value?.content, expectedProperty.value?.content);
            assert.deepStrictEqual(actualProperty.value?.start, expectedProperty.value?.start);
            assert.deepStrictEqual(actualProperty.value?.end, expectedProperty.value?.end);
        }
    }
}

