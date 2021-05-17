import { DocumentLink, TextDocument } from "vscode";
import { resolvePath } from "../../../avro/avroFileSupport";
import { getAvroCalleeFunction } from "../kafkaFileLanguageService";
import { KafkaFileDocument } from "../parser/kafkaFileParser";

export class KafkaFileDocumentLinks {

    async provideDocumentLinks(document: TextDocument, kafkaFileDocument: KafkaFileDocument): Promise<DocumentLink[]> {
        const links: Array<DocumentLink> = [];
        for (const block of kafkaFileDocument.blocks) {
            block.properties.forEach(property => {
                const callee = getAvroCalleeFunction(property);
                if (callee) {
                    const parameter = callee.parameters[0];
                    if (parameter) {
                        const targetUri = resolvePath(document.uri, parameter.value);
                        links.push(new DocumentLink(parameter.range(), targetUri));
                    }
                }
            });
        }
        return links;
    }
}