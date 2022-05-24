import * as vscode from "vscode";
import { ToggleConsumerCommandHandler } from "../../commands/consumers";
import { ProduceRecordCommandHandler } from "../../commands/producers";
import { KafkaFileDocument } from "./parser/kafkaFileParser";
import { isConsumerBlock, isProducerBlock } from "./services/common";
import { createLaunchConsumerCommand } from "./services/consumer";
import { createProduceRecordCommand } from "./services/producer";


export async function executeInlineCommand(kafkaFileDocument: KafkaFileDocument, clusterId: string) {
    const editor = vscode.window.activeTextEditor;
    const curPos = editor!.selection.active;
    const node = kafkaFileDocument.findNodeBefore(curPos);
    if (!node) {
        return;
    }
    
    let command: string | undefined;
    let commandArguments: any[] | undefined;
    
    if (isProducerBlock(node)) {
        command = ProduceRecordCommandHandler.commandId;
        commandArguments = [createProduceRecordCommand(node, clusterId), 1];
    }else if (isConsumerBlock(node)) {
        command = ToggleConsumerCommandHandler.commandId;
        commandArguments = [createLaunchConsumerCommand(node, clusterId)];
    }

    if (command !== undefined && commandArguments !== undefined) {
        vscode.commands.executeCommand(command, ...commandArguments);
    }
 };
 