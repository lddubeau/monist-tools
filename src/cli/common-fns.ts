/**
 * Functions used by various commands.
 */
import * as childProcess from "child_process";
import * as fs from "fs-extra";
import * as path from "path";
import * as util from "util";

import { log } from "../log";
import { Monorepo, MonorepoMember } from "../monorepo";
import { parseName } from "../util";

const execFile = util.promisify(childProcess.execFile);

async function accessible(check: string): Promise<boolean> {
  let result = false;
  try {
    await fs.access(check);
    result = true;
  }
  // Yes, we want to swallow all exceptions.
  // tslint:disable-next-line:no-empty
  catch {}

  return result;
}

async function linkDependencies(pkg: MonorepoMember): Promise<void> {
  const { top } = pkg;
  for (const dep of await pkg.getLocalDeps()) {
    const depName = await dep.getName();
    const { localName: depLocalName, scope } = parseName(depName);
    if (await accessible(path.join(top, "node_modules", `@${scope}`,
                                   depLocalName))) {
      log(`${top}: ${depName} already linked`);
    }
    else {
      const dest = path.join(dep.top, "build", "dist");
      if (!await accessible(dest)) {
        await fs.ensureDir(dest);
      }
      log(`${top}: linking ${depName}`);
      // eslint-disable-next-line no-await-in-loop
      await execFile("npm", ["link",
                             path.relative(top, path.join(dep.top, "build",
                                                          "dist"))], {
        cwd: path.join(top),
      });
      log(`${top}: linked ${depName}`);
    }
  }
}

async function installDependencies(pkg: MonorepoMember): Promise<void> {
  const { top } = pkg;
  for (const dep of await pkg.getLocalDeps()) {
    const depName = await dep.getName();
    const { localName: depLocalName, scope } = parseName(depName);
    if (await accessible(path.join(top, "node_modules", `@${scope}`,
                                   depLocalName))) {
      log(`${top}: ${depName} already installed`);
    }
    else {
      log(`${top}: installing ${depName}`);
      // eslint-disable-next-line no-await-in-loop
      await execFile("npm", ["install", "--no-save",
                             path.relative(top,
                                           path.join(dep.top, "build",
                                                     "dist"))], {
        cwd: path.join(top),
      });
      log(`${top}: installed ${depName}`);
    }
  }
}

export interface ExecOptions {
  serial: boolean;

  localDeps: "link" | "install" | null;
}

async function execForPkg(pkg: MonorepoMember, cmd: string, args: string[],
                          options: ExecOptions): Promise<void> {
  switch (options.localDeps) {
    case null:
      // This means "do nothing".
      break;
    case "link":
      await linkDependencies(pkg);
      break;
    case "install":
      await installDependencies(pkg);
      break;
    default:
      const q: never = options.localDeps;
      throw new Error(`${q} is not a supported localDeps value.`);
  }

  const { top } = pkg;
  const prettyCmd = `${cmd} ${args.join(" ")}`;
  log(`${top}: started ${prettyCmd}`);

  await execFile(cmd, args, {
    cwd: top,
  });

  log(`${top}: finished ${prettyCmd}`);
}

export async function execForAllPackages(cmd: string, args: string[],
                                         options: ExecOptions): Promise<void> {
  const project = new Monorepo(".");
  const { serial } = options;
  const plan = await project.getPlan();

  for (const step of plan) {
    if (serial) {
      for (const pkg of step) {
        await execForPkg(pkg, cmd, args, options);
      }
    }
    else {
      await Promise.all(step
                        .map(async pkg => execForPkg(pkg, cmd, args, options)));
    }
  }
}
