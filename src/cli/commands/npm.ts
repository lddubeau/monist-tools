/**
 * Command all.
 */
import { RawTextHelpFormatter, SubParser } from "argparse";

import { execForAllPackages } from "../common-fns";
import * as commonOptions from "../common-options";

// tslint:disable-next-line:no-any
async function allCommand(args: Record<string, any>): Promise<void> {
  const { cmd, serial, localDeps } = args;

  return execForAllPackages("npm", cmd, {
    serial,
    localDeps,
  });
}

export function addParser(subparsers: SubParser): void {
  const { serial, localDeps } = commonOptions;

  const commandName = "npm";
  const npm = subparsers.addParser(commandName, {
    description: `\
Run an npm command on all packages. For instance, running \`monist \
${commandName} test\` would, for all packages:

 - move to the package's directory
 - run \`npm test\`

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
prior to running the \`npm\` command.\
`,
    formatterClass: RawTextHelpFormatter,
  });

  npm.setDefaults({ func: allCommand });

  npm.addArgument(serial.name, serial.options);
  npm.addArgument(localDeps.name, localDeps.options);

  npm.addArgument(["cmd"], {
    nargs: "+",
  });
}
