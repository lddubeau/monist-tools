/**
 * Main module for the CLI.
 */
import { ArgumentParser, SUPPRESS } from "argparse";
// tslint:disable-next-line:no-require-imports
import requireDir = require("require-dir");

import { error } from "../log";

const commands = requireDir("./commands");

process.on("unhandledRejection", err => {
  error(err != null ? err.toString() :
        "unhandledRejection with unknown reason");
  process.exit(1);
});

// This fixes an error in arparse. This makes it so that when the usage is
// printed due to an error, it goes to stderr instead of stdout.
ArgumentParser.prototype.print_usage =
  // tslint:disable-next-line:no-any
  function printUsage(this: ArgumentParser, stream?: any): void {
    // tslint:disable-next-line:no-any
    (this as any)._printMessage(this.format_usage(), stream);
  };

async function main(): Promise<void> {
  const parser = new ArgumentParser({ add_help: true,
                                      argument_default: SUPPRESS });

  const subparsers = parser.add_subparsers({
    title: "subcommands",
    dest: "subcommand",
  });

  for (const name of Object.keys(commands)) {
    commands[name].addParser(subparsers);
  }

  const args = parser.parse_args(process.argv.slice(2));

  return args.func(args);
}

// tslint:disable-next-line:no-floating-promises
main();
