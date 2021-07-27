# Change Log
All notable changes to `Tools for Apache Kafka®` are documented in this file.

## [0.13.0] - 2021-07-27
### Added
- Show cluster state in kafka file. See [#175](https://github.com/jlandersen/vscode-kafka/pull/175).
- Validation for available topics in `.kafka` files. See [#153](https://github.com/jlandersen/vscode-kafka/issues/153).
- Hover support in `.kafka` files. See [#149](https://github.com/jlandersen/vscode-kafka/issues/149).
- String encoding serialization support. See [#181](https://github.com/jlandersen/vscode-kafka/issues/181).
- Refresh Cluster Provider API when extensions are installed/uninstalled. See [#137](https://github.com/jlandersen/vscode-kafka/issues/137).
- Edit cluster configuration. See [#25](https://github.com/jlandersen/vscode-kafka/issues/25).
- Added SSL configuration. See [#86](https://github.com/jlandersen/vscode-kafka/issues/86).
- `Select Cluster` command provides the option to create a new cluster. See [#103](https://github.com/jlandersen/vscode-kafka/issues/103).
- Expose new internal commands (`vscode-kafka.api.saveclusters` and `vscode-kafka.api.deleteclusters`) to programmatically add/delete clusters (from 3rd party extensions). See [#182](https://github.com/jlandersen/vscode-kafka/issues/182).

### Changed
- Changed cluster wizard to use a Webview. See [#88](https://github.com/jlandersen/vscode-kafka/issues/88).
- Hide internal [strimzi](https://strimzi.io/) topics/consumers by default. See [#176](https://github.com/jlandersen/vscode-kafka/pull/176).
- Simplify snippets. See [#180](https://github.com/jlandersen/vscode-kafka/pull/180).
- Allow non-SSL configuration with SASL authentication. See [#200](https://github.com/jlandersen/vscode-kafka/issues/200).

## [0.12.0] - 2021-04-26
### Added
- Extension API to contribute clusters. See [#123](https://github.com/jlandersen/vscode-kafka/issues/123) and [#160](https://github.com/jlandersen/vscode-kafka/pull/160).
- New `Discover Cluster Providers` command to search for extensions contributing cluster providers. See [#165](https://github.com/jlandersen/vscode-kafka/pull/165).
- Declare key/value formats for CONSUMER in kafka file. See [#112](https://github.com/jlandersen/vscode-kafka/issues/112).
- Declare key/value formats for PRODUCER in kafka file. See [#113](https://github.com/jlandersen/vscode-kafka/issues/113).
- Completion support for property names and values of CONSUMER and PRODUCER blocks. See [#146](https://github.com/jlandersen/vscode-kafka/issues/146).
- Completion support for FakerJS PRODUCER key and value. See [#152](https://github.com/jlandersen/vscode-kafka/issues/152).
- Completion support for available topics for CONSUMER and PRODUCER blocks. See [#150](https://github.com/jlandersen/vscode-kafka/issues/150).
- Validation support for property names and values of CONSUMER and PRODUCER blocks. See [#152](https://github.com/jlandersen/vscode-kafka/issues/152).
- Validation support for FakerJS PRODUCER key and value. See [#154](https://github.com/jlandersen/vscode-kafka/issues/154).

### Changed
- Renamed extension as `Tools for Apache Kafka®`
- Improved the "New topic" wizard: the replication factor is now read from the broker configuration. Input will be skipped if value can't be higher than 1. See [#64](https://github.com/jlandersen/vscode-kafka/issues/64).
- The "Kafka Producer Log" output view is no longer shown automatically when producing messages. See [#134](https://github.com/jlandersen/vscode-kafka/issues/134).
- A progress notification is displayed when producing messages. See [#117](https://github.com/jlandersen/vscode-kafka/issues/117).
- Fix bad highlighting when declaring json messages with fakerjs placeholders. See [#132](https://github.com/jlandersen/vscode-kafka/issues/132).
- Fix .kafka comments which breaks syntax coloration in producers and consumers. See [#161](https://github.com/jlandersen/vscode-kafka/issues/161).
- Fix .kafka comments snippet to insert `--` instead of `---`. See [#163](https://github.com/jlandersen/vscode-kafka/pull/163).
- Use kafka clients pooling for starting consumer. See [#138](https://github.com/jlandersen/vscode-kafka/issues/138).

## [0.11.0] - 2021-03-08
### Added
- Newly created topic or cluster is automatically selected in the Kafka Explorer. See [#61](https://github.com/jlandersen/vscode-kafka/issues/61).
- Click on empty Kafka explorer to add a new cluster. See [#87](https//github.com/jlandersen/vscode-kafka/pull/87).
- Added glob patterns to filter topics (`kafka.explorer.topics.filters`) and consumer groups (`kafka.explorer.consumers.filters`) out of the Kafka explorer. See [#74](https://github.com/jlandersen/vscode-kafka/pull/74).
- Kafka Explorer item labels can now be copied to the clipboard (supports multi selection). See [#68](https://github.com/jlandersen/vscode-kafka/issues/68).
- Selected Cluster or Topic can now be deleted via the Delete shortcut (Cmd+Backspace on Mac). See [#79](https://github.com/jlandersen/vscode-kafka/issues/79)
- Added SASL/SCRAM-256 and SASL/SCRAM-512 authentication support. See [#3](https://github.com/jlandersen/vscode-kafka/issues/3).
- Added the option to enable basic SSL support for clusters without authentication. See [#84](https://github.com/jlandersen/vscode-kafka/issues/84).
- The consumer view now provides a `Clear Consumer View` command. See [#84](https://github.com/jlandersen/vscode-kafka/issues/40).
- Added support for consumer group deletion. See [#26](https://github.com/jlandersen/vscode-kafka/issues/26).
- .kafka files can define a `CONSUMER` block, to start a consumer group with a given offset, partitions. See [#96](https://github.com/jlandersen/vscode-kafka/issues/96).
- .kafka files show the selected cluster as a codelens on the first line. See [#102](https://github.com/jlandersen/vscode-kafka/issues/102).

### Changed
- Improved the "New cluster" and "New topic" wizards: now include validation and a back button. See [#21](https://github.com/jlandersen/vscode-kafka/issues/21).
- Newly created topic or cluster is automatically selected in the Kafka Explorer. See [#61](https://github.com/jlandersen/vscode-kafka/issues/61).
- Internal topics are now hidden by default. See [#29](https://github.com/jlandersen/vscode-kafka/issues/29) and [#74](https://github.com/jlandersen/vscode-kafka/pull/74).
- Elements are now sorted alphabetically in the Kafka explorer. See [#63](https://github.com/jlandersen/vscode-kafka/issues/63).
- Clusters are now sorted in the cluster selection wizard. See [#83](https://github.com/jlandersen/vscode-kafka/issues/83).
- Currently selected cluster is now visible in the explorer and the `Select Cluster` menu is displayed only for unselected clusters. See [#82](https://github.com/jlandersen/vscode-kafka/issues/82).
- Message keys can now be randomized in *.kafka producer files. See [#66](https://github.com/jlandersen/vscode-kafka/issues/66).

## [0.10.0] - 2021-01-02
### Added
- Added confirmation before deleting a cluster.
- Added support for topic deletion. Right-click on a topic and select `Delete Topic`. Be aware that, depending on the cluster configuration (`auto.create.topics.enable:true`), deleted topics *might* be recreated automatically after a few moments.
- Added support for randomized record templates, in *.kafka producer files. Simply inject mustache-like placeholders of [kafka.js properties](https://github.com/Marak/faker.js#api-methods), like ``{{name.lastName}}`` or ``{{random.number}}``. Some randomized properties can be localized via the `kafka.producers.fakerjs.locale` setting.
- Added *.kafka producer snippets
- Added [instructions](https://github.com/jlandersen/vscode-kafka#ci-builds) to manually install CI builds.
- Syntax coloration for Kafka consumer view.

### Changed
- Fixed Kafka cluster wizard, no longer disappears when losing focus.
- Moved the underlying Kafka library to KafkaJS (https://kafka.js.org/) (brings a heap of benefits such as larger API surface, less dependencies and is generally more maintained).
- Refresh Kafka Explorer when producing messages, so new topics can be discovered automatically.
- Refresh Kafka Explorer when starting a consumer.
- Automatically select cluster when there's only one available.
- Starting an already started consumer no longer displays an error, opens corresponding view instead
- Fixed restarting a stopped consumer would not display the `Consumer started` message until the next message was consumed.
- Minimize the chances of opening duplicate consumer views.

## [0.9.0] - 2020-05-30
### Added
 - Support for registering multiple clusters is here! As a result, some of the the VS Code settings are now gone (kafka host, username and password) and any cluster should be added from the explorer.
 For some actions (such as producing records) a specific cluster must be selected either via the explorer or the command palette.

### Changed
 - No longer shows connection status on specific brokers (the extension will move to Kafka.js in the future, which doesen't expose this status + it didn't serve any useful need).

## [0.8.3] - 2020-05-01
### Changed
 - Use webpack bundling for extension distribution.
 - Bump dependencies

## [0.8.2] - 2019-12-23
### Changed
 - Fix initial offset not being used for new consumer groups (https://github.com/jlandersen/vscode-kafka/issues/6).

## [0.8.1] - 2019-11-12
### Changed
 - Fix installations not always getting required dependencies installed.

## [0.8.0] - 2019-11-10
### Changed
 - Updated dependencies for latest kafka-node changes. This brings in an upstream fix to configs for clusters with more than 1 broker, which previously failed (https://github.com/jlandersen/vscode-kafka/issues/7).

## [0.7.2] - 2019-06-02
### Changed
 - Updated dependencies for latest kafka-node changes
 - Force SSL when using SASL/PLAIN authentication for consumers as well (same as 0.7.1)

## [0.7.1] - 2019-05-28
### Changed
 - Force SSL when using SASL/PLAIN authentication (thanks @joanrieu)

## [0.7.0] - 2019-04-12
### Added
 - New configuration for sorting topics (defaults to name)
 - Dump metadata about topics or broke/cluster to YAML by right clicking the resource in explorer (or via command menu)
 - Connecting using SASL/PLAIN authentication is now possible

### Changed
 - Bumped kafka-node to 4.1.x

## [0.6.0] - 2019-03-05
### Added
- Consuming is now possible! Activate either by right clicking a topic in the explorer or from the command palette. Make sure to read the [README](https://github.com/jlandersen/vscode-kafka) for details.

### Changed
 - Some refactorings that improves things behind the scenes here and there

 ### Known issues
 - Expanding configs for brokers in clusters of more than one broker results in an error. Pending fix in kafka-node ([issue](https://github.com/SOHU-Co/kafka-node/issues/1172)).

## [0.5.2] - 2019-02-01
### Changed
- Update to latest kafka-node package which fixes an issue when controller id is 0

## [0.5.1] - 2019-01-30
### Changed
- Fix handling when unable to connect to cluster
- Fix syntax for topic in kafka file when topic name includes number, dot or underscore

## [0.5.0] - 2019-01-21
### Added
- Producing is now possible using the "Kafka" language mode (.kafka files)

### Changed
- Show info message instead of error when no host is configured for certain actions (.g. create topic)

## [0.4.0] - 2019-01-12
### Added
- New consumer group view in explorer
- Configuration entries now available for brokers and topics

### Changed
- Show broker id for brokers in addition to host

## [0.3.0] - 2019-01-09
### Added
- Add create topic action

### Changed
 - Show additional topic partition information in explorer (leader and ISR status)

## [0.2.0] - 2019-01-03
### Added
- Add partition and replica count for topics
- Add port and controller indicator for brokers

## [0.1.0] - 2018-12-31
### Changed
- Fix loading hosts setting on startup

## [0.0.1] - 2018-12-30
- Initial release
