/**
 * Command set-script.
 */
import { SubParser } from "argparse";

import { Monorepo } from "../../monorepo";

// tslint:disable-next-line:no-any
async function setScript(args: Record<string, any>): Promise<void> {
  const { name, content, overwrite } = args;

  return new Monorepo(".").setScript(name, content, {
    overwrite,
  });
}

export function addParser(subparsers: SubParser): void {
  const parser = subparsers.add_parser("set-script", {
    description: "Set a script in all local packages.",
  });

  parser.add_argument("--overwrite", {
    help: "By default, if the script already exists, it is an error to try to \
set it. If this flag is used, then the script is overwritten.",
    action: "store_true",
  });

  parser.add_argument("name", {
    help: "The name of the script.",
  });

  parser.add_argument("content", {
    help: "The content of the script.",
  });

  parser.set_defaults({ func: setScript });
}
