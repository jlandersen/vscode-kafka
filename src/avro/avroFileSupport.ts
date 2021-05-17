import * as fs from 'fs';
import * as avro from 'avsc';
import { Disposable, ExtensionContext, Uri, workspace, WorkspaceFolder } from "vscode";
import { registerAvroSerialization } from "./serialization";

const ENCODING = 'utf-8';

export function registerAvroFileSupport(context: ExtensionContext): Disposable {
    // register avro serializer/deserializer from a local *.avro file
    registerAvroSerialization();

    return {
        dispose() {
        }
    };
}

export function resolvePath(baseFileUri: Uri| undefined, path: string): Uri {
    const uri = Uri.parse(path);
    if(!baseFileUri || path.startsWith('file://')) {
        // no kafka file or full path
        return uri;
    }
    if (path.startsWith('/') || path.startsWith('.')) {
        // path relative to the kafka file
        return Uri.joinPath(baseFileUri, '..', path);        
    }
    // path relative to the workspace root of the kafka file
    const currentWorkspace: WorkspaceFolder | undefined = workspace.getWorkspaceFolder(baseFileUri);
    const currentWorkspaceUri: Uri | undefined = (currentWorkspace && currentWorkspace.uri)
        || (workspace.workspaceFolders && workspace.workspaceFolders[0].uri);
    if (currentWorkspaceUri) {
        const resolvedPath = Uri.joinPath(currentWorkspaceUri, path);
        return resolvedPath;
    }
    return uri;

}

export function readAVSC(baseFileUri: Uri | undefined, path: string): avro.Type {
    const resolvedPath = resolvePath(baseFileUri, path);
    const rawSchema = JSON.parse(fs.readFileSync(resolvedPath.fsPath, ENCODING));
    return avro.Type.forSchema(rawSchema);
}

export function validateAVSC(baseFileUri: Uri | undefined, path: string): string | undefined {
    const resolvedPath = resolvePath(baseFileUri, path);
    if (!fs.existsSync(resolvedPath.fsPath)) {
        return `The '${path}' resolved with the file '${resolvedPath}' cannot be found.`;
    }
}