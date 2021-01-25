import * as assert from "assert";
import * as vscode from "vscode";
import { createConsumerUri, extractConsumerInfoUri, parsePartitions } from "../../../client";

suite("Create consumer URI Test Suite", () => {

    test("Consumer URI simple", () => {
        assert.deepStrictEqual(
            createConsumerUri({ clusterId: 'cluster-id', consumerGroupId: 'group-id', topicId: 'topic-id' }),
            vscode.Uri.parse(`kafka:cluster-id/group-id?topic=topic-id`)
        );
    });

    test("Consumer URI with offset", () => {
        assert.deepStrictEqual(
            createConsumerUri({ clusterId: 'cluster-id', consumerGroupId: 'group-id', topicId: 'topic-id', fromOffset: '1' }),
            vscode.Uri.parse(`kafka:cluster-id/group-id?topic=topic-id&from=1`)
        );
    });

    test("Consumer URI with partitions", () => {
        assert.deepStrictEqual(
            createConsumerUri({ clusterId: 'cluster-id', consumerGroupId: 'group-id', topicId: 'topic-id', partitions: '0-5' }),
            vscode.Uri.parse(`kafka:cluster-id/group-id?topic=topic-id&partitions=0-5`)
        );
    });

    test("Consumer URI with offset and partitions", () => {
        assert.deepStrictEqual(
            createConsumerUri({ clusterId: 'cluster-id', consumerGroupId: 'group-id', topicId: 'topic-id', fromOffset: '1', partitions: '0-5' }),
            vscode.Uri.parse(`kafka:cluster-id/group-id?topic=topic-id&from=1&partitions=0-5`)
        );
    });

});

suite("Extract consumer URI Test Suite", () => {

    test("Consumer URI simple", () => {
        assert.deepStrictEqual(
            extractConsumerInfoUri(vscode.Uri.parse(`kafka:cluster-id/group-id?topic=topic-id`)),
            { clusterId: 'cluster-id', consumerGroupId: 'group-id', topicId: 'topic-id', fromOffset: undefined, partitions: undefined }
        );
    });

    test("Consumer URI with offset", () => {
        assert.deepStrictEqual(
            extractConsumerInfoUri(vscode.Uri.parse(`kafka:cluster-id/group-id?topic=topic-id&from=1`)),
            { clusterId: 'cluster-id', consumerGroupId: 'group-id', topicId: 'topic-id', fromOffset: '1', partitions: undefined }
        );
    });

    test("Consumer URI with partitions", () => {
        assert.deepStrictEqual(
            extractConsumerInfoUri(vscode.Uri.parse(`kafka:cluster-id/group-id?topic=topic-id&partitions=0-5`)),
            { clusterId: 'cluster-id', consumerGroupId: 'group-id', topicId: 'topic-id', fromOffset: undefined, partitions: '0-5' }
        );
    });

    test("Consumer URI with offset and partitions", () => {
        assert.deepStrictEqual(
            extractConsumerInfoUri(vscode.Uri.parse(`kafka:cluster-id/group-id?topic=topic-id&from=1&partitions=0-5`)),
            { clusterId: 'cluster-id', consumerGroupId: 'group-id', topicId: 'topic-id', fromOffset: '1', partitions: '0-5' }
        );
    });

});

suite("Parse partitions Test Suite", () => {

    test("Parse partitions as number", () => {
        assert.deepStrictEqual(parsePartitions(), undefined);
        assert.deepStrictEqual(parsePartitions('0'), [0]);
    });

    test("Parse partitions as range", () => {
        assert.deepStrictEqual(parsePartitions('0,2'), [0, 2]);
        assert.deepStrictEqual(parsePartitions('0,           2'), [0, 2]);
        assert.deepStrictEqual(parsePartitions('0  ,           2'), [0, 2]);
        assert.deepStrictEqual(parsePartitions('2,0'), [0, 2]);
    });

    test("Parse partitions as combinaison of ranges", () => {
        assert.deepStrictEqual(parsePartitions('0-2'), [0, 1, 2]);
        assert.deepStrictEqual(parsePartitions('0-           2'), [0, 1, 2]);
        assert.deepStrictEqual(parsePartitions('0  -           2'), [0, 1, 2]);
        assert.deepStrictEqual(parsePartitions('2-0'), undefined);
    });

    test("Parse complex partitions", () => {
        assert.deepStrictEqual(parsePartitions('4,0,0-2,2,3'), [0, 1, 2, 3, 4]);
    });

    test("Parse bad partitions", () => {
        assert.throws(
            () => parsePartitions('abcd'),
            new Error("Unexpected character 'a' in partitions expression.")
        );

        assert.throws(
            () => parsePartitions('1,2,b'),
            new Error("Unexpected character 'b' in partitions expression.")
        );
    });

});
