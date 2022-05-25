import * as vscode from "vscode";
import { ConsumerLaunchState } from "../../client";
import { StartConsumerCommandHandler, StopConsumerCommandHandler } from "../../commands/consumers";
import { ProduceRecordCommandHandler } from "../../commands/producers";
import { ConsumerLaunchStateProvider } from "./kafkaFileLanguageService";
import { ConsumerBlock, KafkaFileDocument, Node, NodeKind, ProducerBlock } from "./parser/kafkaFileParser";

export function isProducerBlock(node: Node): node is ProducerBlock {
    return node.kind === NodeKind.producerBlock;
}
  
export function isConsumerBlock(node: Node): node is ConsumerBlock {
    return node.kind === NodeKind.consumerBlock;
}

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
        commandArguments = [node.createCommand(clusterId), 1];
    }else if (isConsumerBlock(node)) {
        const consumerState = consumerLaunchStateProvider.getConsumerLaunchState(clusterId, node.consumerGroupId!.content);
        command = consumerState === ConsumerLaunchState.started ? StopConsumerCommandHandler.commandId : StartConsumerCommandHandler.commandId;
        commandArguments = [node.createCommand(clusterId)];
    }

    if (command !== undefined && commandArguments !== undefined) {
        vscode.commands.executeCommand(command, ...commandArguments);
    }
 };
 