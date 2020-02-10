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
import { COMMON_OPTION_DEFAULTS, CommonOptionNames,
         extractCommonOptions } from "./common-options";
import { MonistConfig } from "./config";

const execFile = util.promisify(childProcess.execFile);

interface RunOptions {
  cwd: string;
  inhibitSubprocessOutput: boolean;
}

async function run(file: string, args: string[],
                   options: RunOptions): Promise<void> {
  if (!options.inhibitSubprocessOutput) {
    return new Promise((resolve, reject) => {
      const child = childProcess.spawn(file, args, {
        cwd: options.cwd,
        stdio: "inherit",
      });

      child.on("exit", (code, signal) => {
        if (code) {
          reject(new Error(`Command failed: ${file} ${args.join(" ")}`));
          return;
        }

        if (signal) {
          reject(new Error(`${file} terminated with signal: ${signal}`));
          return;
        }

        resolve();
      });
    });
  }
  else {
    await execFile(file, args, {
      cwd: options.cwd,
    });
  }
}

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

function makeDepPath(packageTop: string, depTop: string,
                     buildDir: string): string {
  return path.relative(packageTop, path.join(depTop, buildDir));
}

async function symlinkDependencies(config: MonistConfig,
                                   pkg: MonorepoMember,
                                   inhibitSubprocessOutput: boolean):
Promise<void> {
  const { top } = pkg;
  for (const dep of await pkg.getLocalDeps()) {
    const depName = await dep.getName();
    const { localName: depLocalName, scope } = parseName(depName);
    if (await accessible(path.join(top, "node_modules", `@${scope}`,
                                   depLocalName))) {
      log(`${top}: ${depName} already symlinked`);
    }
    else {
      log(`${top}: symlinking ${depName}`);
      // eslint-disable-next-line no-await-in-loop
      const scopeDir = path.join(top, "node_modules", `@${scope}`);
      await fs.ensureDir(scopeDir);
      await run("ln", ["-s", makeDepPath(scopeDir, dep.top, config.buildDir),
                       depLocalName], {
        cwd: scopeDir,
        inhibitSubprocessOutput,
      });
      log(`${top}: symlinked ${depName}`);
    }
  }
}

async function linkDependencies(config: MonistConfig,
                                pkg: MonorepoMember,
                                inhibitSubprocessOutput: boolean):
Promise<void> {
  const { top } = pkg;
  for (const dep of await pkg.getLocalDeps()) {
    const depName = await dep.getName();
    const { localName: depLocalName, scope } = parseName(depName);
    if (await accessible(path.join(top, "node_modules", `@${scope}`,
                                   depLocalName))) {
      log(`${top}: ${depName} already linked`);
    }
    else {
      log(`${top}: linking ${depName}`);
      // eslint-disable-next-line no-await-in-loop
      await run("npm", ["link", makeDepPath(top, dep.top, config.buildDir)], {
        cwd: top,
        inhibitSubprocessOutput,
      });
      log(`${top}: linked ${depName}`);
    }
  }
}

async function installDependencies(config: MonistConfig,
                                   pkg: MonorepoMember,
                                   inhibitSubprocessOutput: boolean):
Promise<void> {
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
      await run("npm", ["install", "--no-save",
                        makeDepPath(top, dep.top, config.buildDir)], {
                          cwd: top,
                          inhibitSubprocessOutput,
                        });
      log(`${top}: installed ${depName}`);
    }
  }
}

export function combineCommonOptionsWithConfig<T extends Record<string, any>>(
  commandName: "run" | "npm",
  args: T,
  config: MonistConfig): Pick<T, CommonOptionNames> {
  const { cmd } = args;
  if (cmd === undefined || cmd[0] === undefined) {
    throw new Error("args must have a cmd property set which must contain " +
                    "at least one element");
  }

  const configPart = config?.cliOptions?.[commandName];

  const starConfig = configPart?.["*"] ?? {};
  const cmdConfig = configPart?.[cmd[0]] ?? {};

  return {...COMMON_OPTION_DEFAULTS, ...starConfig, ...cmdConfig,
          ...extractCommonOptions(args) } ;
}

export interface ExecOptions {
  serial: boolean;

  localDeps: "link" | "install" | "symlink" | null;

  inhibitSubprocessOutput: boolean;
}

async function execForPkg(config: MonistConfig, pkg: MonorepoMember,
                          cmd: string, args: string[],
                          options: ExecOptions): Promise<void> {
  switch (options.localDeps) {
    case null:
      // This means "do nothing".
      break;
    case "symlink":
      await symlinkDependencies(config, pkg, options.inhibitSubprocessOutput);
      break;
    case "link":
      await linkDependencies(config, pkg, options.inhibitSubprocessOutput);
      break;
    case "install":
      await installDependencies(config, pkg, options.inhibitSubprocessOutput);
      break;
    default:
      const q: never = options.localDeps;
      throw new Error(`${q} is not a supported localDeps value.`);
  }

  const { top } = pkg;
  const prettyCmd = `${cmd} ${args.join(" ")}`;
  log(`${top}: started ${prettyCmd}`);

  await run(cmd, args, {
    cwd: top,
    inhibitSubprocessOutput: options.inhibitSubprocessOutput,
  });

  log(`${top}: finished ${prettyCmd}`);
}

export async function execForAllPackages(config: MonistConfig,
                                         cmd: string, args: string[],
                                         options: ExecOptions): Promise<void> {
  const project = new Monorepo(".", config);
  const { serial } = options;
  const plan = await project.getPlan();

  for (const step of plan) {
    if (serial) {
      for (const pkg of step) {
        await execForPkg(config, pkg, cmd, args, options);
      }
    }
    else {
      await Promise.all(step
                        .map(async pkg => execForPkg(config, pkg, cmd, args,
                                                     options)));
    }
  }
}
