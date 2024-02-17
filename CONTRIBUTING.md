# How to Contribute

Contributions are essential for keeping this extension great. We try to keep it as easy as possible to contribute changes and we are open to suggestions for making it even easier. There are only a few guidelines that we need contributors to follow.

## Development

### Installation Prerequisites:

  * latest [Visual Studio Code](https://code.visualstudio.com/)
  * [Node.js](https://nodejs.org/) v14.0.0 or higher

### Steps

1. Fork and clone this repository

2. `cd vscode-kafka/`

3. Install the dependencies:
	```bash
	$ npm install
	```

4. Compile with [webpack](https://webpack.js.org/) :

	```bash
	$ npm run compile
	```

This step is required since vscode-kafka uses [vscode-wizard](https://github.com/redhat-developer/vscode-wizard) to create / edit a cluster. [vscode-wizard](https://github.com/redhat-developer/vscode-wizard) is a NPM module which embeds some html, js, css resources in `pages` folder. As vscode-kafka is built with [webpack](https://webpack.js.org/), this pages folder must be copied from the `vscode-wizard/pages` NPM module to `vscode-kafka/pages`.

5. To run the extension, open the Debugging tab in VSCode.
6. Select and run 'Launch Extension (vscode-kafka)' at the top left.
