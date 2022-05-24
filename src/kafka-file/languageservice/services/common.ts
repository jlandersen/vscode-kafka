import { SerializationSetting } from "../../../client/serialization";
import { CalleeFunction, ConsumerBlock, Node, NodeKind, ProducerBlock } from "../parser/kafkaFileParser";

export function isProducerBlock(node: Node): node is ProducerBlock {
  return node.kind === NodeKind.producerBlock;
}

export function isConsumerBlock(node: Node): node is ConsumerBlock {
  return node.kind === NodeKind.consumerBlock;
}

export function getSerializationSettings(
  callee: CalleeFunction
): SerializationSetting[] | undefined {
  const parameters = callee.parameters;
  if (parameters.length > 0) {
      return parameters.map((p) => {
          return { value: p.value };
      });
  }
}