import { CodeAction, CodeActionContext, CodeActionKind, Diagnostic, EndOfLine, Position, Range, TextDocument, WorkspaceEdit } from "vscode";
import { fakerjsAPIModel } from "../model";
import { SelectedClusterProvider } from "../kafkaFileLanguageService";
import { Block, KafkaFileDocument, Property } from "../parser/kafkaFileParser";

const missingAssignerMessage = "Missing ':' sign after '";
const missingTopicPropertyMessage = "must declare the 'topic:' property.";
const unknownTopicMessage = "Unknown topic '";
const fakerMissingOpenMessage = "must be opened with '{{'";
const fakerMissingCloseMessage = "must be closed with '}}'";
const fakerUnexpectedTokenMessage = "Unexpected token '";
const fakerMissingDotMessage = "Missing '.' after '";
const fakerInvalidContentMessage = "Invalid content: '";
const fakerInvalidModuleMessage = "Invalid module: '";
const fakerInvalidMethodMessage = "Invalid method: '";
const createTopicCommandId = "vscode-kafka.explorer.createtopic";

export class KafkaFileCodeActions {

    constructor(private selectedClusterProvider: SelectedClusterProvider) {
    }

    getCodeActions(document: TextDocument, kafkaFileDocument: KafkaFileDocument, context: CodeActionContext): CodeAction[] {
        const actions: CodeAction[] = [];
        const diagnostics = context.diagnostics || [];
        for (const diagnostic of diagnostics) {
            if (diagnostic.message.includes(missingTopicPropertyMessage)) {
                const block = this.findBlockAtLine(kafkaFileDocument, diagnostic.range.start.line);
                if (!block) {
                    continue;
                }
                const action = this.createAddTopicPropertyAction(document, diagnostic, block);
                actions.push(action);
                continue;
            }
            if (diagnostic.message.startsWith(missingAssignerMessage)) {
                const property = this.findPropertyAtLine(kafkaFileDocument, diagnostic.range.start.line);
                if (!property || property.assignerCharacter !== undefined || !property.key) {
                    continue;
                }
                const action = this.createInsertAssignerAction(document, diagnostic, property);
                actions.push(action);
                continue;
            }
            if (diagnostic.message.startsWith(unknownTopicMessage)) {
                const action = this.createTopicAction(diagnostic);
                if (action) {
                    actions.push(action);
                }
                continue;
            }

            const fakerActions = this.createFakerActions(document, diagnostic);
            if (fakerActions.length > 0) {
                actions.push(...fakerActions);
            }
        }
        return actions;
    }

    private createFakerActions(document: TextDocument, diagnostic: Diagnostic): CodeAction[] {
        if (diagnostic.message.includes(fakerMissingOpenMessage)) {
            return [this.createInsertTextAction(document, diagnostic, "Add '{{'", diagnostic.range.start, "{{")];
        }
        if (diagnostic.message.includes(fakerMissingCloseMessage)) {
            return [this.createInsertTextAction(document, diagnostic, "Add '}}'", diagnostic.range.end, "}}")];
        }
        if (diagnostic.message.startsWith(fakerUnexpectedTokenMessage)) {
            return [this.createDeleteRangeAction(document, diagnostic, "Remove unexpected token", diagnostic.range)];
        }
        if (diagnostic.message.startsWith(fakerMissingDotMessage)) {
            return [this.createInsertTextAction(document, diagnostic, "Insert '.'", diagnostic.range.end, ".")];
        }
        if (diagnostic.message.startsWith(fakerInvalidContentMessage)) {
            const start = diagnostic.range.start.character > 0
                ? diagnostic.range.start.with(undefined, diagnostic.range.start.character - 1)
                : diagnostic.range.start;
            const range = diagnostic.range.with(start, diagnostic.range.end);
            return [this.createDeleteRangeAction(document, diagnostic, "Remove invalid content", range)];
        }
        if (diagnostic.message.startsWith(fakerInvalidModuleMessage)) {
            const invalidModule = this.extractQuotedValue(diagnostic.message);
            if (!invalidModule) {
                return [];
            }
            const bestModule = this.findClosestMatch(invalidModule, this.getAvailableModules());
            if (!bestModule || bestModule === invalidModule) {
                return [];
            }
            return [this.createReplaceRangeAction(document, diagnostic, `Replace with '${bestModule}'`, diagnostic.range, bestModule)];
        }
        if (diagnostic.message.startsWith(fakerInvalidMethodMessage)) {
            const invalidMethod = this.extractQuotedValue(diagnostic.message);
            if (!invalidMethod) {
                return [];
            }
            const moduleName = this.extractModuleNameForMethod(document, diagnostic);
            const availableMethods = this.getAvailableMethods(moduleName);
            if (availableMethods.length < 1) {
                return [];
            }
            const normalizedMethod = this.normalizeMethodName(invalidMethod);
            const bestMethod = this.findClosestMatch(normalizedMethod, availableMethods);
            if (!bestMethod) {
                return [];
            }
            const replacement = this.replaceMethodKeepingSuffix(invalidMethod, bestMethod);
            if (replacement === invalidMethod) {
                return [];
            }
            return [this.createReplaceRangeAction(document, diagnostic, `Replace with '${bestMethod}'`, diagnostic.range, replacement)];
        }
        return [];
    }

    private createInsertTextAction(document: TextDocument, diagnostic: Diagnostic, title: string, position: Position, value: string): CodeAction {
        const action = new CodeAction(title, CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        const edit = new WorkspaceEdit();
        edit.insert(document.uri, position, value);
        action.edit = edit;
        return action;
    }

    private createDeleteRangeAction(document: TextDocument, diagnostic: Diagnostic, title: string, range: Range): CodeAction {
        return this.createReplaceRangeAction(document, diagnostic, title, range, "");
    }

    private createReplaceRangeAction(document: TextDocument, diagnostic: Diagnostic, title: string, range: Range, value: string): CodeAction {
        const action = new CodeAction(title, CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        const edit = new WorkspaceEdit();
        edit.replace(document.uri, range, value);
        action.edit = edit;
        return action;
    }

    private extractQuotedValue(message: string): string | undefined {
        const match = /'([^']+)'/.exec(message);
        return match?.[1];
    }

    private getAvailableModules(): string[] {
        const modules = new Set<string>();
        for (const definition of fakerjsAPIModel.definitions) {
            const [module] = definition.name.split('.');
            if (module && !module.startsWith('$')) {
                modules.add(module);
            }
        }
        return [...modules];
    }

    private getAvailableMethods(moduleName?: string): string[] {
        const methods: string[] = [];
        for (const definition of fakerjsAPIModel.definitions) {
            const [module, method] = definition.name.split('.');
            if (!module || !method) {
                continue;
            }
            if (moduleName && module !== moduleName) {
                continue;
            }
            methods.push(method);
        }
        return methods;
    }

    private extractModuleNameForMethod(document: TextDocument, diagnostic: Diagnostic): string | undefined {
        if (diagnostic.range.start.line !== diagnostic.range.end.line) {
            return;
        }
        const lineText = document.lineAt(diagnostic.range.start.line).text;
        const textBeforeMethod = lineText.substring(0, diagnostic.range.start.character);
        const openIndex = textBeforeMethod.lastIndexOf("{{");
        if (openIndex < 0) {
            return;
        }
        const expressionPrefix = textBeforeMethod.substring(openIndex + 2);
        const dotIndex = expressionPrefix.indexOf('.');
        if (dotIndex < 0) {
            return;
        }
        const moduleName = expressionPrefix.substring(0, dotIndex).trim();
        return moduleName.length > 0 ? moduleName : undefined;
    }

    private normalizeMethodName(method: string): string {
        return method.replace(/\(.*$/, "").trim();
    }

    private replaceMethodKeepingSuffix(originalMethod: string, replacementMethod: string): string {
        const suffixIndex = originalMethod.indexOf('(');
        if (suffixIndex < 0) {
            return replacementMethod;
        }
        return `${replacementMethod}${originalMethod.substring(suffixIndex)}`;
    }

    private findClosestMatch(value: string, candidates: string[]): string | undefined {
        if (candidates.length < 1) {
            return;
        }
        const valueLower = value.toLowerCase();
        let bestCandidate: string | undefined;
        let bestDistance = Number.POSITIVE_INFINITY;
        for (const candidate of candidates) {
            const distance = this.getLevenshteinDistance(valueLower, candidate.toLowerCase());
            if (distance < bestDistance) {
                bestDistance = distance;
                bestCandidate = candidate;
            }
        }
        return bestCandidate;
    }

    private getLevenshteinDistance(source: string, target: string): number {
        if (source === target) {
            return 0;
        }
        if (source.length === 0) {
            return target.length;
        }
        if (target.length === 0) {
            return source.length;
        }

        const previous = new Array(target.length + 1);
        const current = new Array(target.length + 1);
        for (let j = 0; j <= target.length; j++) {
            previous[j] = j;
        }
        for (let i = 1; i <= source.length; i++) {
            current[0] = i;
            for (let j = 1; j <= target.length; j++) {
                const cost = source[i - 1] === target[j - 1] ? 0 : 1;
                current[j] = Math.min(
                    current[j - 1] + 1,
                    previous[j] + 1,
                    previous[j - 1] + cost
                );
            }
            for (let j = 0; j <= target.length; j++) {
                previous[j] = current[j];
            }
        }
        return previous[target.length];
    }

    private createAddTopicPropertyAction(document: TextDocument, diagnostic: Diagnostic, block: Block): CodeAction {
        const action = new CodeAction("Add 'topic' property", CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        const edit = new WorkspaceEdit();
        const lineEnding = document.eol === EndOfLine.CRLF ? "\r\n" : "\n";
        const insertPosition = document.lineAt(block.start.line).range.end;
        const indent = document.lineAt(block.start.line).firstNonWhitespaceCharacterIndex;
        const padding = indent > 0 ? " ".repeat(indent) : "";
        edit.insert(document.uri, insertPosition, `${lineEnding}${padding}topic: `);
        action.edit = edit;
        return action;
    }

    private createInsertAssignerAction(document: TextDocument, diagnostic: Diagnostic, property: Property): CodeAction {
        const propertyName = property.propertyName || "property";
        const action = new CodeAction(`Insert ':' after '${propertyName}'`, CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        action.isPreferred = true;
        const edit = new WorkspaceEdit();
        const insertPosition = property.key?.end || property.end;
        edit.insert(document.uri, insertPosition, ": ");
        action.edit = edit;
        return action;
    }

    private createTopicAction(diagnostic: Diagnostic): CodeAction | undefined {
        const topicId = this.getUnknownTopicId(diagnostic.message);
        if (!topicId) {
            return;
        }
        const action = new CodeAction(`Create topic '${topicId}'`, CodeActionKind.QuickFix);
        action.diagnostics = [diagnostic];
        const { clusterId } = this.selectedClusterProvider.getSelectedCluster();
        action.command = {
            title: action.title,
            command: createTopicCommandId,
            arguments: [clusterId, topicId],
        };
        return action;
    }

    private getUnknownTopicId(message: string): string | undefined {
        const match = /^Unknown topic '([^']+)'\./.exec(message);
        return match?.[1];
    }

    private findBlockAtLine(kafkaFileDocument: KafkaFileDocument, line: number): Block | undefined {
        return kafkaFileDocument.blocks.find(block => block.start.line === line);
    }

    private findPropertyAtLine(kafkaFileDocument: KafkaFileDocument, line: number): Property | undefined {
        for (const block of kafkaFileDocument.blocks) {
            const property = block.properties.find(p => p.start.line === line);
            if (property) {
                return property;
            }
        }
        return undefined;
    }
}
