import * as vscode from "vscode";

type Handler = (...args: any[]) => Promise<any>;

export const handleErrors = (handler: Handler): ((...args: any[]) => Promise<any>) => {
    return async (...args: any[]): Promise<any> => {
        try {
            await handler(...args);
        } catch (error) {
            if (error.message) {
                vscode.window.showErrorMessage(error.message);
            } else {
                console.log(error);
                vscode.window.showErrorMessage('An unexpected error occured');
            }
        }
    }
};

export * from "./consumers";
export * from "./topics";
export * from "./producers";
export * from "./cluster";
