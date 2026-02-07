import { CodeAction, CodeActionContext, CodeActionKind, Diagnostic, EndOfLine, TextDocument, WorkspaceEdit } from "vscode";
import { Block, KafkaFileDocument, Property } from "../parser/kafkaFileParser";

const missingAssignerMessage = "Missing ':' sign after '";
const missingTopicPropertyMessage = "must declare the 'topic:' property.";

export class KafkaFileCodeActions {

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
            }
        }
        return actions;
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
