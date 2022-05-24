import * as vscode from "vscode";
import { ConsumerLaunchState } from "../../client";
import { StartConsumerCommandHandler, StopConsumerCommandHandler } from "../../commands/consumers";
import { ProduceRecordCommandHandler } from "../../commands/producers";
import { ConsumerLaunchStateProvider } from "./kafkaFileLanguageService";
import { KafkaFileDocument, NodeKind } from "./parser/kafkaFileParser";
import { isConsumerBlock, isProducerBlock } from "./services/common";
import { createLaunchConsumerCommand } from "./services/consumer";
import { createProduceRecordCommand } from "./services/producer";

export async function executeInlineCommand(kafkaFileDocument: KafkaFileDocument, clusterId: string, consumerLaunchStateProvider: ConsumerLaunchStateProvider) {
    const editor = vscode.window.activeTextEditor;
    const curPos = editor!.selection.active;
    let node = kafkaFileDocument.findNodeBefore(curPos);
    if (node === undefined) {
        return;
    }
    if (![NodeKind.producerBlock, NodeKind.consumerBlock].includes(node.kind)) {
        if (node.parent === undefined) {
            return;
        }
        node = node.parent;
    }
    
    let command: string | undefined;
    let commandArguments: any[] | undefined;
    
    if (isProducerBlock(node)) {
        command = ProduceRecordCommandHandler.commandId;
        commandArguments = [createProduceRecordCommand(node, clusterId), 1];
    }else if (isConsumerBlock(node)) {
        const consumerState = consumerLaunchStateProvider.getConsumerLaunchState(clusterId, node.consumerGroupId!.content);
        command = consumerState === ConsumerLaunchState.started ? StopConsumerCommandHandler.commandId : StartConsumerCommandHandler.commandId;
        commandArguments = [createLaunchConsumerCommand(node, clusterId)];
    }

    if (command !== undefined && commandArguments !== undefined) {
        vscode.commands.executeCommand(command, ...commandArguments);
    }
 };
 