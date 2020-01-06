/**
 * Command set-script.
 */
import { SubParser } from "argparse";

import { Monorepo } from "../../monorepo";
import { MonistConfig } from "../config";

// tslint:disable-next-line:no-any
async function delScript(_config: MonistConfig,
                         args: Record<string, any>): Promise<void> {
  const { name } = args;

  return new Monorepo(".").delScript(name);
}

export function addParser(subparsers: SubParser): void {
  const parser = subparsers.addParser("del-script", {
    description: "Delete a script in all local packages.",
  });

  parser.addArgument(["name"], {
    help: "The name of the script.",
  });

  parser.setDefaults({ func: delScript });
}
