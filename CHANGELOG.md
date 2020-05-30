# Change Log
All notable changes to Kafka extension will be documented in this file.

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
