import * as vscode from "vscode";
import { LanguageService } from "../kafka-file/languageservice/kafkaFileLanguageService";


export class InlineCommandActivationCommandHandler {
    public static commandId = 'vscode-kafka.inline.activate';

    constructor(private readonly languageService: LanguageService) {}

    async execute(): Promise<void> {
        const editor = vscode.window.activeTextEditor;
        const document = editor!.document;
        const curPos = editor!.selection.active;
        
        if (document.languageId !== 'kafka') {
            return;
        }
        const kafkaFileDocument = this.languageService.parseKafkaFileDocument(document);
        const currentBlock = kafkaFileDocument.blocks.find((block) => block.range().contains(curPos));
        if (currentBlock === undefined) {
            return;
        }
        const currentLens = this.languageService.getCodeLenses(document, kafkaFileDocument).find((lens) => lens.range.start.line === currentBlock.start.line);
        if (currentLens !== undefined) {
            vscode.commands.executeCommand(currentLens.command!.command, currentLens.command?.arguments![0]);
        }
    }
}
