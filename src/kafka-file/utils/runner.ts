/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from 'vscode';

export function formatError(message: string, err: any): string {
	if (err instanceof Error) {
		let error = <Error>err;
		return `${message}: ${error.message}\n${error.stack}`;
	} else if (typeof err === 'string') {
		return `${message}: ${err}`;
	} else if (err) {
		return `${message}: ${err.toString()}`;
	}
	return message;
}

export function runSafeAsync<T>(func: () => Thenable<T>, errorVal: T, errorMessage: string, token: CancellationToken): Thenable<T> {
	return new Promise<T>((resolve,reject) => {
		setImmediate(() => {
			if (token.isCancellationRequested) {
				reject("cancelled");
			}
			return func().then(result => {
				if (token.isCancellationRequested) {
					reject("cancelled");
					return;
				} else {
					resolve(result);
				}
			}, e => {
				console.error(formatError(errorMessage, e));
				resolve(errorVal);
			});
		});
	});
}
