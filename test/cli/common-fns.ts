import { expect } from "chai";

import { combineCommonOptionsWithConfig,
       } from "../../build/dist/lib/cli/common-fns";

describe("common-fns", () => {
  describe("combineCommonOptionsWithConfig", () => {
    it("throws if args does not have cmd", () => {
      expect(() => combineCommonOptionsWithConfig("run", {}, {}))
        .to.throw(Error,
                  "args must have a cmd property set which must contain " +
                  "at least one element");
    });

    it("throws if cmd does not have an element", () => {
      expect(() => combineCommonOptionsWithConfig("run", { cmd: [] }, {}))
        .to.throw(Error,
                  "args must have a cmd property set which must contain " +
                  "at least one element");
    });

    describe("reads options from the config", () => {
      it("if the config has command options", () => {
        expect(combineCommonOptionsWithConfig("run", { cmd: ["a"] }, {
          cliOptions: {
            run: {
              a: {
                serial: true,
                localDeps: "link",
                inhibitSubprocessOutput: true,
              },
            },
          },
        })).to.deep.equal({
          serial: true,
        localDeps: "link",
          inhibitSubprocessOutput: true,
        });
      });

      it("if the config has star options", () => {
        expect(combineCommonOptionsWithConfig("run", { cmd: ["a"] }, {
          cliOptions: {
            run: {
              "*": {
                serial: true,
                localDeps: "link",
                inhibitSubprocessOutput: true,
              },
            },
          },
        })).to.deep.equal({
          serial: true,
          localDeps: "link",
          inhibitSubprocessOutput: true,
        });
      });

      it("if the config has star options and command options", () => {
        expect(combineCommonOptionsWithConfig("run", { cmd: ["a"] }, {
          cliOptions: {
            run: {
              "*": {
                serial: true,
                localDeps: "link",
                inhibitSubprocessOutput: true,
              },
              "a": {
                serial: false,
                localDeps: "install",
                inhibitSubprocessOutput: false,
              },
            },
          },
        })).to.deep.equal({
          serial: false,
          localDeps: "install",
          inhibitSubprocessOutput: false,
        });
      });
    });

    describe("does not use the config if", () => {
      it("there are no options", () => {
        expect(combineCommonOptionsWithConfig("run", { cmd: ["a"] }, {
          cliOptions: {
            run: {
              a: {
              },
            },
          },
        })).to.deep.equal({
          serial: false,
          localDeps: null,
          inhibitSubprocessOutput: false,
        });
      });

      it("the cmd is not there", () => {
        expect(combineCommonOptionsWithConfig("run", { cmd: ["a"] }, {
          cliOptions: {
            run: {
              b: { // This is different from a.
                serial: true,
                localDeps: "link",
                inhibitSubprocessOutput: true,
              },
            },
          },
        })).to.deep.equal({
          serial: false,
          localDeps: null,
          inhibitSubprocessOutput: false,
        });
      });

      it("the command is not there", () => {
        expect(combineCommonOptionsWithConfig("run", { cmd: ["a"] }, {
          cliOptions: {
            npm: { // This is not "run".
              a: {
                serial: true,
                localDeps: "link",
                inhibitSubprocessOutput: true,
              },
            },
          },
        })).to.deep.equal({
          serial: false,
          localDeps: null,
          inhibitSubprocessOutput: false,
        });
      });
    });

    it("uses args if there is an empty configuration", () => {
      const args = { cmd: ["a", "b", "c"], serial: true, localDeps: "link",
                     inhibitSubprocessOutput: true };
      expect(combineCommonOptionsWithConfig("run", args, {}))
        .to.deep.equal({
          serial: true,
          localDeps: "link",
          inhibitSubprocessOutput: true,
        });
    });

    it("overrides the config with args", () => {
      expect(combineCommonOptionsWithConfig("run", {
        cmd: ["a"],
        serial: false,
        localDeps: "install",
        inhibitSubprocessOutput: false,
      }, {
        cliOptions: {
          run: {
            a: {
              serial: true,
              localDeps: "link",
              inhibitSubprocessOutput: true,
            },
          },
        },
      })).to.deep.equal({
        serial: false,
        localDeps: "install",
        inhibitSubprocessOutput: false,
      });
    });

  });
});
