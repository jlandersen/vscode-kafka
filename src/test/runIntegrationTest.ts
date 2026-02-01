import * as path from "path";

import { runTests } from "@vscode/test-electron";

async function main(): Promise<void> {
    try {
        // The folder containing the Extension Manifest package.json
        // Passed to `--extensionDevelopmentPath`
        const extensionDevelopmentPath = path.resolve(__dirname, "../../");

        // The path to the integration test runner
        // Passed to --extensionTestsPath
        const extensionTestsPath = path.resolve(__dirname, "./integration/index");

        // Download VS Code, unzip it and run the integration tests
        // Set a longer timeout for container startup
        await runTests({
            extensionDevelopmentPath,
            extensionTestsPath,
            launchArgs: [
                "--disable-extensions", // Disable other extensions to avoid interference
            ],
        });
    } catch (err) {
        console.error("Failed to run integration tests:", err);
        process.exit(1);
    }
}

main();
