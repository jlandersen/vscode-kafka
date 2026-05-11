import { glob } from "glob";
import Mocha = require("mocha");
import * as path from "path";

export async function run(): Promise<void> {
    const mocha = new Mocha({
        ui: "tdd",
        color: true,
        timeout: 120000,
    });

    const testsRoot = path.resolve(__dirname);

    const files = await glob("**/*.integration.test.js", { cwd: testsRoot });

    files.forEach(f => mocha.addFile(path.resolve(testsRoot, f)));

    return new Promise((c, e) => {
        try {
            mocha.run((failures: number) => {
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
