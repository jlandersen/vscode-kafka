# Change Log
All notable changes to Kafka extension will be documented in this file.

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
