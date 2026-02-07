import * as vscode from "vscode";
import { getErrorMessage } from "../errors";

type Handler = (...args: any[]) => Promise<any>;

export const handleErrors = (handler: Handler): ((...args: any[]) => Promise<any>) => {
    return async (...args: any[]): Promise<any> => {
        try {
            await handler(...args);
        } catch (error) {
            vscode.window.showErrorMessage(getErrorMessage(error));
        }
    };
};

export * from "./consumers";
export * from "./topics";
export * from "./producers";
export * from "./cluster";
export * from "./inlineCommandActivationCommand";
