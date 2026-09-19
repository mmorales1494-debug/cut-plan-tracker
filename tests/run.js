// Runs every *.test.js in this directory. No dependencies — `node tests/run.js`.
const { execFileSync } = require("child_process");
const fs = require("fs");
const suites = fs.readdirSync(__dirname).filter(f => f.endsWith(".test.js")).sort();
let failed = 0;
for (const suite of suites) {
  process.stdout.write(`\n— ${suite} —\n`);
  try {
    process.stdout.write(execFileSync(process.execPath, [__dirname + "/" + suite], { encoding: "utf8" }));
  } catch (e) {
    process.stdout.write((e.stdout || "") + (e.stderr || ""));
    failed++;
  }
}
console.log(failed ? `\n${failed} suite(s) failed` : `\nAll ${suites.length} suites passed`);
process.exit(failed ? 1 : 0);
