import { resolve } from "node:path";
import * as tool from "engine/tool";
import { rules } from "./rules.ts";

const result = tool.analyze(rules(resolve(import.meta.dirname, "..")));

for ( const issue of result.issues ) console.error(`${issue.file}:${issue.line} ${issue.message}`);

console.log(`${result.files} files, ${result.issues.length} issues`);

if ( result.issues.length ) process.exit(1);
