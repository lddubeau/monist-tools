/**
 * Command update-versions.
 */
import { SubParser } from "argparse";

import { error } from "../../log";
import { Monorepo } from "../../monorepo";
import { MonistConfig } from "../config";

// tslint:disable-next-line:no-any
async function updateVersionsCommand(config: MonistConfig,
                                     args: Record<string, any>): Promise<void> {
  const monorepo = new Monorepo(".", config);

  const errors = await monorepo.verifyDeps();
  if (errors.length !== 0) {
    for (const e of errors) {
      error(e);
    }
    throw new Error("verification failed");
  }

  return monorepo.updateLocalVersions(args.version);
}

export function addParser(subparsers: SubParser): void {
  const updateVersions = subparsers.addParser("update-versions", {
    description: "Update the versions of all local packages. This updates the \
package's version number and the version number of the local dependencies. \
Prior to updating the versions, this command does a sanity check on the \
version numbers already in the package.json files and fails if it finds any \
error.",
  });

  updateVersions.addArgument(["version"]);

  updateVersions.setDefaults({ func: updateVersionsCommand });
}
