#!/usr/bin/env bun
import { main } from "engine-tool";

process.exitCode = await main(process.argv.slice(2), process.cwd());
