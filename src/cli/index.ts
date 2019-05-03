/**
 * Main module for the CLI.
 */
import { ArgumentParser } from "argparse";
// tslint:disable-next-line:no-require-imports
import requireDir = require("require-dir");

import { error } from "../log";
import { loadConfig } from "./config";

const commands = requireDir("./commands");

process.on("unhandledRejection", err => {
  // tslint:disable-next-line:no-console
  error(err.toString());
  process.exit(1);
});

// This fixes an error in arparse. This makes it so that when the usage is
// printed due to an error, it goes to stderr instead of stdout.
ArgumentParser.prototype.printUsage =
  // tslint:disable-next-line:no-any
  function printUsage(this: ArgumentParser, stream?: any): void {
    // tslint:disable-next-line:no-any
    (this as any)._printMessage(this.formatUsage(), stream);
  };

async function main(): Promise<void> {
  const parser = new ArgumentParser({ addHelp: true });

  const subparsers = parser.addSubparsers({
    title: "subcommands",
    dest: "subcommand",
  });

  for (const name of Object.keys(commands)) {
    commands[name].addParser(subparsers);
  }

  const args = parser.parseArgs(process.argv.slice(2));

  const config = loadConfig();

  return args.func(config, args);
}

// tslint:disable-next-line:no-floating-promises
main();
