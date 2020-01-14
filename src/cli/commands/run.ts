/**
 * Command run-all.
 */
import { Const, RawTextHelpFormatter, SubParser } from "argparse";

import { combineCommonOptionsWithConfig,
         execForAllPackages } from "../common-fns";
import * as commonOptions from "../common-options";
import { MonistConfig } from "../config";

const commandName = "run";

// tslint:disable-next-line:no-any
async function runCommand(config: MonistConfig,
                          args: Record<string, any>): Promise<void> {
  return execForAllPackages(config, "npm", [commandName].concat(args.cmd),
                            combineCommonOptionsWithConfig(commandName, args,
                                                           config));
}

export function addParser(subparsers: SubParser): void {
  const { serial, localDeps, inhibitSubprocessOutput } = commonOptions;

  const run = subparsers.addParser(commandName, {
    argumentDefault: Const.SUPPRESS,
    description: `\
Run a script on all packages. For instance, running \`monist ${commandName}
build\` \ would, for all packages:

 - move to the package's directory
 - run \`npm run build\`

The packages are visited in an order that takes into account depedencies. If, \
say, package A depends on package B and C, then packages B and C will be \
visited before package A. And if package B depends on package C, then package \
C will be visited first.

This command takes advantage of opportunities for parallelism. Here's a simple \
example. You have a monorepo with packages A and B, which depend on no other \
package. \`monist npm\` will run on the two packages in parallel because \
neither is dependent on the other.

Note that independently of how monist works, NOT ALL NPM COMMANDS CAN BE RUN \
IN PARALLEL. This is inherent to how \`npm\` works, and not something monist \
fix. If your commands fail, you may need to use the \`--serial\` flag to run \
the commands serially.

Some commands need the dependencies to be available prior to executing the \
command. You can use \`--local-deps=..\` to process the local dependencies \
prior to running the \`npm\` command.\,
`,
    formatterClass: RawTextHelpFormatter,
  });

  run.addArgument(serial.name, serial.options);
  run.addArgument(localDeps.name, localDeps.options);
  run.addArgument(inhibitSubprocessOutput.name,
                  inhibitSubprocessOutput.options);

  run.addArgument(["cmd"], {
    nargs: "+",
  });

  run.setDefaults({ func: runCommand });
}
