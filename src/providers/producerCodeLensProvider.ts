import * as vscode from "vscode";

export class ProducerCodeLensProvider implements vscode.CodeLensProvider {
    onDidChangeCodeLenses?: vscode.Event<void>;

    provideCodeLenses(document: vscode.TextDocument, token: vscode.CancellationToken):
        vscode.ProviderResult<vscode.CodeLens[]> {
        const lenses: vscode.CodeLens[] = [];

        let blockStartLine = 0;
        let blockEndLine = 0;
        let blockInProgress = false;

        for (let currentLine = 0; currentLine < document.lineCount; currentLine++) {
            const line = document.lineAt(currentLine);

            if (this.isBlockStart(line.text)) {
                blockStartLine = currentLine;
                blockInProgress = true;
                continue;
            }

            if (this.isSeparator(line.text)) {
                blockEndLine = currentLine - 1;
                lenses.push(...this.createLens(blockStartLine, blockEndLine, document));
                blockInProgress = false;
                continue;
            }
        }

        if (blockInProgress) {
            lenses.push(...this.createLens(blockStartLine, document.lineCount - 1, document));
        }

        return Promise.resolve(lenses);
    }

    private isBlockStart(line: string) {
        return line.startsWith("PRODUCER");
    }

    private isSeparator(line: string) {
        return line === "###";
    }

    private createLens(blockStartLine: number, blockEndLine: number, document: vscode.TextDocument): vscode.CodeLens[] {
        const range = new vscode.Range(blockStartLine, 0, blockEndLine, 0);

        return [{
            command: {
                arguments: [document, range, 1],
                command: "vscode-kafka.explorer.produce",
                title: "Produce record",
            },
            isResolved: true,
            range,
        },
        {
            command: {
                arguments: [document, range, 10],
                command: "vscode-kafka.explorer.produce",
                title: "Produce record x 10",
            },
            isResolved: true,
            range,
        }];
    }
}
