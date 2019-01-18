/**
 * Command remove-local-from-lockfiles.
 */
import { SubParser } from "argparse";

import { Monorepo } from "../../monorepo";

// tslint:disable-next-line:no-any
async function removeLocalFromLockfilesCommand(args: Record<string, any>):
Promise<void> {
  const monorepo = new Monorepo(".");

  await Promise.all(args.files
                    .map(async (f: string) => monorepo.removeLocalFromFile(f)));
}

exports.addParser = function addParser(subparsers: SubParser): void {
  const parser = subparsers.addParser("remove-local-from-lockfiles", {
    description: "Remove local packages from the lock files.",
  });

  parser.addArgument("files", {
    nargs: "+",
  });

  parser.setDefaults({
    func: removeLocalFromLockfilesCommand,
  });
};
