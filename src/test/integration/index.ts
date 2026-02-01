import { glob } from "glob";
import * as Mocha from "mocha";
import * as path from "path";

export async function run(): Promise<void> {
    // Create the mocha test with longer timeout for integration tests
    const mocha = new Mocha({
        ui: "tdd",
        color: true,
        timeout: 120000, // 2 minutes for container operations
    });

    const testsRoot = path.resolve(__dirname);

    const files = await glob("**/*.integration.test.js", { cwd: testsRoot });

    // Add files to the test suite
    files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

    return new Promise((c, e) => {
        try {
            // Run the mocha test
            mocha.run((failures) => {
                if (failures > 0) {
                    e(new Error(`${failures} integration tests failed.`));
                } else {
                    c();
                }
            });
        } catch (err) {
            e(err);
        }
    });
}
