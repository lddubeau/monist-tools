/**
 * Definitions for options used by multiple commands.
 */

export const serial = {
  name: ["--serial"],
  options: {
    help: "By default, when possible, monist tries executes commands in \
parallel. This flag forces all execution to be serial.",
    action: "storeTrue",
  },
};

export const localDeps = {
  name: ["--local-deps"],
  options: {
    help: "Process the local dependencies before executing the command. \
The `link` option runs `npm link` to make the dependency available. The \
`install` option uses `npm install`.",
    choices: ["link", "install"],
    dest: "localDeps",
  },
};
