import * as vscode from "vscode";
import { AbstractKafkaFileFeature } from "../kafka-file/kafkaFileClient";


export class InlineCommandActivationCommandHandler extends AbstractKafkaFileFeature {

    public static commandId = 'vscode-kafka.inline.activate';
  
  execute() {
          const editor = vscode.window.activeTextEditor;
          const document = editor!.document;
  
          if (document.languageId !== 'kafka') {
              return;
          }
          // parse or get the kafka file from the cache
          const kafkaFileDocument = this.getKafkaFileDocument(document);
          this.languageService.executeInlineCommand(kafkaFileDocument);
  }
}