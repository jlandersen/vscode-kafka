import { ExtensionContext } from "vscode";

/**
 * Provides access to the current extension context.
 */
export class Context {
    private static _current: ExtensionContext;

    static register(extensionExtension: ExtensionContext) {
        this._current = extensionExtension;
    }

    static get current() {
        return this._current;
    }
}
