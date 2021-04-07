import { CompletionItemKind } from "vscode";
import { position, range, testCompletion } from "./kafkaAssert";

suite("Kafka File Completion Test Suite", () => {

    test("Empty completion", async () => {
        await testCompletion('', {
            items: []
        });

        await testCompletion('ab|cd', {
            items: []
        });

        await testCompletion('CONSU|UMER', {
            items: []
        });

        await testCompletion('PROD|UCER', {
            items: []
        });
    });

});

suite("Kafka File CONSUMER Completion Test Suite", () => {

    test("CONSUMER property names (empty line)", async () => {
        await testCompletion(
            'CONSUMER a\n' +
            '|'
            , {
                items: [
                    {
                        label: 'topic', kind: CompletionItemKind.Property,
                        insertText: 'topic: ${1:topic}',
                        range: range(position(1, 0), position(1, 0))
                    },
                    {
                        label: 'from', kind: CompletionItemKind.Property,
                        insertText: 'from: ${1|earliest,last,0|}',
                        range: range(position(1, 0), position(1, 0))
                    },
                    {
                        label: 'key-format', kind: CompletionItemKind.Property,
                        insertText: 'key-format: ${1|none,string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 0))
                    },
                    {
                        label: 'value-format', kind: CompletionItemKind.Property,
                        insertText: 'value-format: ${1|none,string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 0))
                    },
                    {
                        label: 'partitions', kind: CompletionItemKind.Property,
                        insertText: 'partitions: ${1|0|}',
                        range: range(position(1, 0), position(1, 0))
                    }
                ]
            });
    });

    test("CONSUMER property names (property key) 1", async () => {

        await testCompletion(
            'CONSUMER a\n' +
            't|'
            , {
                items: [
                    {
                        label: 'topic', kind: CompletionItemKind.Property,
                        insertText: 'topic: ${1:topic}',
                        range: range(position(1, 0), position(1, 1))
                    },
                    {
                        label: 'from', kind: CompletionItemKind.Property,
                        insertText: 'from: ${1|earliest,last,0|}',
                        range: range(position(1, 0), position(1, 1))
                    },
                    {
                        label: 'key-format', kind: CompletionItemKind.Property,
                        insertText: 'key-format: ${1|none,string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 1))
                    },
                    {
                        label: 'value-format', kind: CompletionItemKind.Property,
                        insertText: 'value-format: ${1|none,string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 1))
                    },
                    {
                        label: 'partitions', kind: CompletionItemKind.Property,
                        insertText: 'partitions: ${1|0|}',
                        range: range(position(1, 0), position(1, 1))
                    }
                ]
            });
    });

    test("CONSUMER property names (property key) 2", async () => {
        await testCompletion(
            'CONSUMER a\n' +
            't|opic'
            , {
                items: [
                    {
                        label: 'topic', kind: CompletionItemKind.Property,
                        insertText: 'topic: ${1:topic}',
                        range: range(position(1, 0), position(1, 5))
                    },
                    {
                        label: 'from', kind: CompletionItemKind.Property,
                        insertText: 'from: ${1|earliest,last,0|}',
                        range: range(position(1, 0), position(1, 5))
                    },
                    {
                        label: 'key-format', kind: CompletionItemKind.Property,
                        insertText: 'key-format: ${1|none,string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 5))
                    },
                    {
                        label: 'value-format', kind: CompletionItemKind.Property,
                        insertText: 'value-format: ${1|none,string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 5))
                    },
                    {
                        label: 'partitions', kind: CompletionItemKind.Property,
                        insertText: 'partitions: ${1|0|}',
                        range: range(position(1, 0), position(1, 5))
                    }
                ]
            });
    });

    test("CONSUMER property names (property key) 3", async () => {
        await testCompletion(
            'CONSUMER a\n' +
            't|opic:'
            , {
                items: [
                    {
                        label: 'topic', kind: CompletionItemKind.Property,
                        insertText: 'topic: ${1:topic}',
                        range: range(position(1, 0), position(1, 6))
                    },
                    {
                        label: 'from', kind: CompletionItemKind.Property,
                        insertText: 'from: ${1|earliest,last,0|}',
                        range: range(position(1, 0), position(1, 6))
                    },
                    {
                        label: 'key-format', kind: CompletionItemKind.Property,
                        insertText: 'key-format: ${1|none,string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 6))
                    },
                    {
                        label: 'value-format', kind: CompletionItemKind.Property,
                        insertText: 'value-format: ${1|none,string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 6))
                    },
                    {
                        label: 'partitions', kind: CompletionItemKind.Property,
                        insertText: 'partitions: ${1|0|}',
                        range: range(position(1, 0), position(1, 6))
                    }
                ]
            });
    });

    test("CONSUMER property names (property key) 4", async () => {
        await testCompletion(
            'CONSUMER a\n' +
            'topic|:'
            , {
                items: [
                    {
                        label: 'topic', kind: CompletionItemKind.Property,
                        insertText: 'topic: ${1:topic}',
                        range: range(position(1, 0), position(1, 6))
                    },
                    {
                        label: 'from', kind: CompletionItemKind.Property,
                        insertText: 'from: ${1|earliest,last,0|}',
                        range: range(position(1, 0), position(1, 6))
                    },
                    {
                        label: 'key-format', kind: CompletionItemKind.Property,
                        insertText: 'key-format: ${1|none,string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 6))
                    },
                    {
                        label: 'value-format', kind: CompletionItemKind.Property,
                        insertText: 'value-format: ${1|none,string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 6))
                    },
                    {
                        label: 'partitions', kind: CompletionItemKind.Property,
                        insertText: 'partitions: ${1|0|}',
                        range: range(position(1, 0), position(1, 6))
                    }
                ]
            });
    });

    test("CONSUMER property names (property key) 5", async () => {
        await testCompletion(
            'CONSUMER a\n' +
            't|opic: abcd'
            , {
                items: [
                    {
                        label: 'topic', kind: CompletionItemKind.Property,
                        insertText: 'topic: ${1:topic}',
                        range: range(position(1, 0), position(1, 11))
                    },
                    {
                        label: 'from', kind: CompletionItemKind.Property,
                        insertText: 'from: ${1|earliest,last,0|}',
                        range: range(position(1, 0), position(1, 11))
                    },
                    {
                        label: 'key-format', kind: CompletionItemKind.Property,
                        insertText: 'key-format: ${1|none,string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 11))
                    },
                    {
                        label: 'value-format', kind: CompletionItemKind.Property,
                        insertText: 'value-format: ${1|none,string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 11))
                    },
                    {
                        label: 'partitions', kind: CompletionItemKind.Property,
                        insertText: 'partitions: ${1|0|}',
                        range: range(position(1, 0), position(1, 11))
                    }
                ]
            });
    });

    test("CONSUMER property names (property key) 6", async () => {
        await testCompletion(
            'CONSUMER a\n' +
            'from: 0\n' +
            't|opic'
            , {
                items: [
                    {
                        label: 'topic', kind: CompletionItemKind.Property,
                        insertText: 'topic: ${1:topic}',
                        range: range(position(2, 0), position(2, 5))
                    },
                    /* 'from' is removed from completion because it is declared in the CONSUMER
                    {
                        label: 'from', kind: CompletionItemKind.Property,
                        insertText: 'from: ${1|earliest,last,0|}',
                        range: range(position(2, 0), position(2, 5))
                    },*/
                    {
                        label: 'key-format', kind: CompletionItemKind.Property,
                        insertText: 'key-format: ${1|none,string,double,float,integer,long,short|}',
                        range: range(position(2, 0), position(2, 5))
                    },
                    {
                        label: 'value-format', kind: CompletionItemKind.Property,
                        insertText: 'value-format: ${1|none,string,double,float,integer,long,short|}',
                        range: range(position(2, 0), position(2, 5))
                    },
                    {
                        label: 'partitions', kind: CompletionItemKind.Property,
                        insertText: 'partitions: ${1|0|}',
                        range: range(position(2, 0), position(2, 5))
                    }
                ]
            });
    });

    test("CONSUMER property value for from 1", async () => {
        await testCompletion(
            'CONSUMER a\n' +
            'from:|'
            , {
                items: [
                    {
                        label: 'earliest', kind: CompletionItemKind.Value,
                        insertText: ' earliest',
                        range: range(position(1, 5), position(1, 5))
                    },
                    {
                        label: 'last', kind: CompletionItemKind.Value,
                        insertText: ' last',
                        range: range(position(1, 5), position(1, 5))
                    },
                    {
                        label: '0', kind: CompletionItemKind.Value,
                        insertText: ' 0',
                        range: range(position(1, 5), position(1, 5))
                    }
                ]
            });
    });

    test("CONSUMER property value for from 2", async () => {
        await testCompletion(
            'CONSUMER a\n' +
            'from:e|a'
            , {
                items: [
                    {
                        label: 'earliest', kind: CompletionItemKind.Value,
                        insertText: ' earliest',
                        range: range(position(1, 5), position(1, 7))
                    },
                    {
                        label: 'last', kind: CompletionItemKind.Value,
                        insertText: ' last',
                        range: range(position(1, 5), position(1, 7))
                    },
                    {
                        label: '0', kind: CompletionItemKind.Value,
                        insertText: ' 0',
                        range: range(position(1, 5), position(1, 7))
                    }
                ]
            });
    });

    test("CONSUMER property value for from 3", async () => {
        await testCompletion(
            'CONSUMER a\n' +
            'topic: abcd\n' +
            'from:e|a'
            , {
                items: [
                    {
                        label: 'earliest', kind: CompletionItemKind.Value,
                        insertText: ' earliest',
                        range: range(position(2, 5), position(2, 7))
                    },
                    {
                        label: 'last', kind: CompletionItemKind.Value,
                        insertText: ' last',
                        range: range(position(2, 5), position(2, 7))
                    },
                    {
                        label: '0', kind: CompletionItemKind.Value,
                        insertText: ' 0',
                        range: range(position(2, 5), position(2, 7))
                    }
                ]
            });
    });

    test("CONSUMER property value for from 4", async () => {
        await testCompletion(
            'CONSUMER a\n' +
            'topic: abcd\n' +
            'from:e|a\n' +
            'key-format: long'
            , {
                items: [
                    {
                        label: 'earliest', kind: CompletionItemKind.Value,
                        insertText: ' earliest',
                        range: range(position(2, 5), position(2, 7))
                    },
                    {
                        label: 'last', kind: CompletionItemKind.Value,
                        insertText: ' last',
                        range: range(position(2, 5), position(2, 7))
                    },
                    {
                        label: '0', kind: CompletionItemKind.Value,
                        insertText: ' 0',
                        range: range(position(2, 5), position(2, 7))
                    }
                ]
            });
    });

    test("CONSUMER property value for key-format", async () => {
        await testCompletion(
            'CONSUMER a\n' +
            'key-format:|'
            , {
                items: [
                    {
                        label: 'none', kind: CompletionItemKind.Value,
                        insertText: ' none',
                        range: range(position(1, 11), position(1, 11))
                    },
                    {
                        label: 'string', kind: CompletionItemKind.Value,
                        insertText: ' string',
                        range: range(position(1, 11), position(1, 11))
                    },
                    {
                        label: 'double', kind: CompletionItemKind.Value,
                        insertText: ' double',
                        range: range(position(1, 11), position(1, 11))
                    },
                    {
                        label: 'float', kind: CompletionItemKind.Value,
                        insertText: ' float',
                        range: range(position(1, 11), position(1, 11))
                    },
                    {
                        label: 'integer', kind: CompletionItemKind.Value,
                        insertText: ' integer',
                        range: range(position(1, 11), position(1, 11))
                    },
                    {
                        label: 'long', kind: CompletionItemKind.Value,
                        insertText: ' long',
                        range: range(position(1, 11), position(1, 11))
                    },
                    {
                        label: 'short', kind: CompletionItemKind.Value,
                        insertText: ' short',
                        range: range(position(1, 11), position(1, 11))
                    }
                ]
            });
    });

    test("CONSUMER property value for value-format", async () => {
        await testCompletion(
            'CONSUMER a\n' +
            'value-format:|'
            , {
                items: [
                    {
                        label: 'none', kind: CompletionItemKind.Value,
                        insertText: ' none',
                        range: range(position(1, 13), position(1, 13))
                    },
                    {
                        label: 'string', kind: CompletionItemKind.Value,
                        insertText: ' string',
                        range: range(position(1, 13), position(1, 13))
                    },
                    {
                        label: 'double', kind: CompletionItemKind.Value,
                        insertText: ' double',
                        range: range(position(1, 13), position(1, 13))
                    },
                    {
                        label: 'float', kind: CompletionItemKind.Value,
                        insertText: ' float',
                        range: range(position(1, 13), position(1, 13))
                    },
                    {
                        label: 'integer', kind: CompletionItemKind.Value,
                        insertText: ' integer',
                        range: range(position(1, 13), position(1, 13))
                    },
                    {
                        label: 'long', kind: CompletionItemKind.Value,
                        insertText: ' long',
                        range: range(position(1, 13), position(1, 13))
                    },
                    {
                        label: 'short', kind: CompletionItemKind.Value,
                        insertText: ' short',
                        range: range(position(1, 13), position(1, 13))
                    }
                ]
            });
    });

});

suite("Kafka File PRODUCER Completion Test Suite", () => {

    test("PRODUCER property names (empty line)", async () => {
        await testCompletion(
            'PRODUCER a\n' +
            '|'
            , {
                items: [
                    {
                        label: 'topic', kind: CompletionItemKind.Property,
                        insertText: 'topic: ${1:topic}',
                        range: range(position(1, 0), position(1, 0))
                    },
                    {
                        label: 'key', kind: CompletionItemKind.Property,
                        insertText: 'key: ${1:key}',
                        range: range(position(1, 0), position(1, 0))
                    },
                    {
                        label: 'key-format', kind: CompletionItemKind.Property,
                        insertText: 'key-format: ${1|string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 0))
                    },
                    {
                        label: 'value-format', kind: CompletionItemKind.Property,
                        insertText: 'value-format: ${1|string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 0))
                    }
                ]
            });
    });

    test("PRODUCER property names (property key) 1", async () => {

        await testCompletion(
            'PRODUCER a\n' +
            't|'
            , {
                items: [
                    {
                        label: 'topic', kind: CompletionItemKind.Property,
                        insertText: 'topic: ${1:topic}',
                        range: range(position(1, 0), position(1, 1))
                    },
                    {
                        label: 'key', kind: CompletionItemKind.Property,
                        insertText: 'key: ${1:key}',
                        range: range(position(1, 0), position(1, 1))
                    },
                    {
                        label: 'key-format', kind: CompletionItemKind.Property,
                        insertText: 'key-format: ${1|string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 1))
                    },
                    {
                        label: 'value-format', kind: CompletionItemKind.Property,
                        insertText: 'value-format: ${1|string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 1))
                    }
                ]
            });
    });

    test("PRODUCER property names (property key) 2", async () => {
        await testCompletion(
            'PRODUCER a\n' +
            't|opic'
            , {
                items: [
                    {
                        label: 'topic', kind: CompletionItemKind.Property,
                        insertText: 'topic: ${1:topic}',
                        range: range(position(1, 0), position(1, 5))
                    },
                    {
                        label: 'key', kind: CompletionItemKind.Property,
                        insertText: 'key: ${1:key}',
                        range: range(position(1, 0), position(1, 5))
                    },
                    {
                        label: 'key-format', kind: CompletionItemKind.Property,
                        insertText: 'key-format: ${1|string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 5))
                    },
                    {
                        label: 'value-format', kind: CompletionItemKind.Property,
                        insertText: 'value-format: ${1|string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 5))
                    }
                ]
            });
    });

    test("PRODUCER property names (property key) 3", async () => {
        await testCompletion(
            'PRODUCER a\n' +
            't|opic:'
            , {
                items: [
                    {
                        label: 'topic', kind: CompletionItemKind.Property,
                        insertText: 'topic: ${1:topic}',
                        range: range(position(1, 0), position(1, 6))
                    },
                    {
                        label: 'key', kind: CompletionItemKind.Property,
                        insertText: 'key: ${1:key}',
                        range: range(position(1, 0), position(1, 6))
                    },
                    {
                        label: 'key-format', kind: CompletionItemKind.Property,
                        insertText: 'key-format: ${1|string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 6))
                    },
                    {
                        label: 'value-format', kind: CompletionItemKind.Property,
                        insertText: 'value-format: ${1|string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 6))
                    }
                ]
            });
    });

    test("PRODUCER property names (property key) 4", async () => {
        await testCompletion(
            'PRODUCER a\n' +
            'topic|:'
            , {
                items: [
                    {
                        label: 'topic', kind: CompletionItemKind.Property,
                        insertText: 'topic: ${1:topic}',
                        range: range(position(1, 0), position(1, 6))
                    },
                    {
                        label: 'key', kind: CompletionItemKind.Property,
                        insertText: 'key: ${1:key}',
                        range: range(position(1, 0), position(1, 6))
                    },
                    {
                        label: 'key-format', kind: CompletionItemKind.Property,
                        insertText: 'key-format: ${1|string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 6))
                    },
                    {
                        label: 'value-format', kind: CompletionItemKind.Property,
                        insertText: 'value-format: ${1|string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 6))
                    }
                ]
            });
    });

    test("PRODUCER property names (property key) 5", async () => {
        await testCompletion(
            'PRODUCER a\n' +
            't|opic: abcd'
            , {
                items: [
                    {
                        label: 'topic', kind: CompletionItemKind.Property,
                        insertText: 'topic: ${1:topic}',
                        range: range(position(1, 0), position(1, 11))
                    },
                    {
                        label: 'key', kind: CompletionItemKind.Property,
                        insertText: 'key: ${1:key}',
                        range: range(position(1, 0), position(1, 11))
                    },
                    {
                        label: 'key-format', kind: CompletionItemKind.Property,
                        insertText: 'key-format: ${1|string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 11))
                    },
                    {
                        label: 'value-format', kind: CompletionItemKind.Property,
                        insertText: 'value-format: ${1|string,double,float,integer,long,short|}',
                        range: range(position(1, 0), position(1, 11))
                    }
                ]
            });
    });

    test("PRODUCER property names (property key) 6", async () => {
        await testCompletion(
            'PRODUCER a\n' +
            'key: abcd\n' +
            't|opic'
            , {
                items: [
                    {
                        label: 'topic', kind: CompletionItemKind.Property,
                        insertText: 'topic: ${1:topic}',
                        range: range(position(2, 0), position(2, 5))
                    },
                    /* 'key' is removed from completion because it is declared in the PRODUCER
                    {
                        label: 'key', kind: CompletionItemKind.Property,
                        insertText: 'key: ${1:key}',
                        range: range(position(2, 0), position(2, 5))
                    },*/
                    {
                        label: 'key-format', kind: CompletionItemKind.Property,
                        insertText: 'key-format: ${1|string,double,float,integer,long,short|}',
                        range: range(position(2, 0), position(2, 5))
                    },
                    {
                        label: 'value-format', kind: CompletionItemKind.Property,
                        insertText: 'value-format: ${1|string,double,float,integer,long,short|}',
                        range: range(position(2, 0), position(2, 5))
                    }
                ]
            });
    });

    test("PRODUCER property value for key-format 1", async () => {
        await testCompletion(
            'PRODUCER a\n' +
            'key-format:|'
            , {
                items: [
                    {
                        label: 'string', kind: CompletionItemKind.Value,
                        insertText: ' string',
                        range: range(position(1, 11), position(1, 11))
                    },
                    {
                        label: 'double', kind: CompletionItemKind.Value,
                        insertText: ' double',
                        range: range(position(1, 11), position(1, 11))
                    },
                    {
                        label: 'float', kind: CompletionItemKind.Value,
                        insertText: ' float',
                        range: range(position(1, 11), position(1, 11))
                    },
                    {
                        label: 'integer', kind: CompletionItemKind.Value,
                        insertText: ' integer',
                        range: range(position(1, 11), position(1, 11))
                    },
                    {
                        label: 'long', kind: CompletionItemKind.Value,
                        insertText: ' long',
                        range: range(position(1, 11), position(1, 11))
                    },
                    {
                        label: 'short', kind: CompletionItemKind.Value,
                        insertText: ' short',
                        range: range(position(1, 11), position(1, 11))
                    }
                ]
            });
    });

    test("PRODUCER property value for key-format 2", async () => {
        await testCompletion(
            'PRODUCER a\n' +
            'key-format:s|t'
            , {
                items: [
                    {
                        label: 'string', kind: CompletionItemKind.Value,
                        insertText: ' string',
                        range: range(position(1, 11), position(1, 13))
                    },
                    {
                        label: 'double', kind: CompletionItemKind.Value,
                        insertText: ' double',
                        range: range(position(1, 11), position(1, 13))
                    },
                    {
                        label: 'float', kind: CompletionItemKind.Value,
                        insertText: ' float',
                        range: range(position(1, 11), position(1, 13))
                    },
                    {
                        label: 'integer', kind: CompletionItemKind.Value,
                        insertText: ' integer',
                        range: range(position(1, 11), position(1, 13))
                    },
                    {
                        label: 'long', kind: CompletionItemKind.Value,
                        insertText: ' long',
                        range: range(position(1, 11), position(1, 13))
                    },
                    {
                        label: 'short', kind: CompletionItemKind.Value,
                        insertText: ' short',
                        range: range(position(1, 11), position(1, 13))
                    }
                ]
            });
    });

    test("PRODUCER property value for key-format 3", async () => {
        await testCompletion(
            'PRODUCER a\n' +
            'topic: abcd\n' +
            'key-format:s|t'
            , {
                items: [
                    {
                        label: 'string', kind: CompletionItemKind.Value,
                        insertText: ' string',
                        range: range(position(2, 11), position(2, 13))
                    },
                    {
                        label: 'double', kind: CompletionItemKind.Value,
                        insertText: ' double',
                        range: range(position(2, 11), position(2, 13))
                    },
                    {
                        label: 'float', kind: CompletionItemKind.Value,
                        insertText: ' float',
                        range: range(position(2, 11), position(2, 13))
                    },
                    {
                        label: 'integer', kind: CompletionItemKind.Value,
                        insertText: ' integer',
                        range: range(position(2, 11), position(2, 13))
                    },
                    {
                        label: 'long', kind: CompletionItemKind.Value,
                        insertText: ' long',
                        range: range(position(2, 11), position(2, 13))
                    },
                    {
                        label: 'short', kind: CompletionItemKind.Value,
                        insertText: ' short',
                        range: range(position(2, 11), position(2, 13))
                    }
                ]
            });
    });

    test("PRODUCER property value for key-format 4", async () => {
        await testCompletion(
            'PRODUCER a\n' +
            'topic: abcd\n' +
            'key-format:s|t\n' +
            'value-format: long'
            , {
                items: [
                    {
                        label: 'string', kind: CompletionItemKind.Value,
                        insertText: ' string',
                        range: range(position(2, 11), position(2, 13))
                    },
                    {
                        label: 'double', kind: CompletionItemKind.Value,
                        insertText: ' double',
                        range: range(position(2, 11), position(2, 13))
                    },
                    {
                        label: 'float', kind: CompletionItemKind.Value,
                        insertText: ' float',
                        range: range(position(2, 11), position(2, 13))
                    },
                    {
                        label: 'integer', kind: CompletionItemKind.Value,
                        insertText: ' integer',
                        range: range(position(2, 11), position(2, 13))
                    },
                    {
                        label: 'long', kind: CompletionItemKind.Value,
                        insertText: ' long',
                        range: range(position(2, 11), position(2, 13))
                    },
                    {
                        label: 'short', kind: CompletionItemKind.Value,
                        insertText: ' short',
                        range: range(position(2, 11), position(2, 13))
                    }
                ]
            });
    });

    test("PRODUCER property value for value-format", async () => {
        await testCompletion(
            'PRODUCER a\n' +
            'value-format:|'
            , {
                items: [
                    {
                        label: 'string', kind: CompletionItemKind.Value,
                        insertText: ' string',
                        range: range(position(1, 13), position(1, 13))
                    },
                    {
                        label: 'double', kind: CompletionItemKind.Value,
                        insertText: ' double',
                        range: range(position(1, 13), position(1, 13))
                    },
                    {
                        label: 'float', kind: CompletionItemKind.Value,
                        insertText: ' float',
                        range: range(position(1, 13), position(1, 13))
                    },
                    {
                        label: 'integer', kind: CompletionItemKind.Value,
                        insertText: ' integer',
                        range: range(position(1, 13), position(1, 13))
                    },
                    {
                        label: 'long', kind: CompletionItemKind.Value,
                        insertText: ' long',
                        range: range(position(1, 13), position(1, 13))
                    },
                    {
                        label: 'short', kind: CompletionItemKind.Value,
                        insertText: ' short',
                        range: range(position(1, 13), position(1, 13))
                    }
                ]
            });
    });

});
