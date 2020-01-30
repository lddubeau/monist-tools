/**
 * Command set-script.
 */
import { SubParser } from "argparse";

import { Monorepo } from "../../monorepo";
import { MonistConfig } from "../config";

// tslint:disable-next-line:no-any
async function setScript(config: MonistConfig,
                         args: Record<string, any>): Promise<void> {
  const { name, content, overwrite } = args;

  return new Monorepo(".", config).setScript(name, content, {
    overwrite,
  });
}

export function addParser(subparsers: SubParser): void {
  const parser = subparsers.addParser("set-script", {
    description: "Set a script in all local packages.",
  });

  parser.addArgument("--overwrite", {
    help: "By default, if the script already exists, it is an error to try to \
set it. If this flag is used, then the script is overwritten.",
    action: "storeTrue",
  });

  parser.addArgument(["name"], {
    help: "The name of the script.",
  });

  parser.addArgument(["content"], {
    help: "The content of the script.",
  });

  parser.setDefaults({ func: setScript });
}
