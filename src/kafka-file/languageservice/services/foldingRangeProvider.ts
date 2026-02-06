import { FoldingRange, FoldingRangeKind, TextDocument } from "vscode";
import { KafkaFileDocument } from "../parser/kafkaFileParser";

/**
 * Kafka file folding range support.
 */
export class KafkaFileFoldingRanges {

    getFoldingRanges(document: TextDocument, kafkaFileDocument: KafkaFileDocument): FoldingRange[] {
        const ranges: FoldingRange[] = [];

        kafkaFileDocument.blocks.forEach(block => {
            const startLine = block.start.line;
            const endLine = block.end.line;

            if (endLine > startLine) {
                ranges.push(new FoldingRange(startLine, endLine, FoldingRangeKind.Region));
            }
        });

        return ranges;
    }
}
