/**
 * Definitions for options used by multiple commands.
 */

const commonOptions = [{
  name: ["--serial"],
  options: {
    help: "By default, when possible, monist tries executes commands in \
parallel. This flag forces all execution to be serial.",
    action: "storeTrue",
    dest: "serial" as const,
  },
},
{
  name: ["--local-deps"],
  options: {
    help: "Process the local dependencies before executing the command. \
The `link` option runs `npm link` to make the dependency available. The \
`install` option uses `npm install`.",
    choices: ["link", "install"],
    dest: "localDeps" as const,
  },
},
{
  name: ["--inhibit-subprocess-output"],
  options: {
    help: "Inhibit the output to stdout and stderr of the subprocess launched \
by monist. By default stdout and stderr are inherited by the subprocesses. \
Thus, their output is seen on the console. With this flag turned on, the \
output of subprocesses is not visible.",
    dest: "inhibitSubprocessOutput" as const,
    action: "storeTrue",
  },
}];

const [serial, localDeps, inhibitSubprocessOutput] = commonOptions;

export { serial, localDeps, inhibitSubprocessOutput };

export const COMMON_OPTION_DEFAULTS: Record<CommonOptionNames, any> = {
  serial: false,
  localDeps: null,
  inhibitSubprocessOutput: false,
} as const;

type DestOf<X extends { options: { dest: string }}> = X["options"]["dest"];

export type CommonOptionNames =
  DestOf<typeof serial | typeof localDeps | typeof inhibitSubprocessOutput>;

const commonOptionNames = commonOptions.map(x => x.options.dest);

export function extractCommonOptions<T>(obj: Record<string, T>):
Record<CommonOptionNames, T> {
  const ret = Object.create(null);
  for (const prop of commonOptionNames) {
    if (prop in obj) {
      ret[prop] = obj[prop];
    }
  }

  return ret;
}
