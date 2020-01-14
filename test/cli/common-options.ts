import { expect } from "chai";

import { extractCommonOptions } from "../../build/dist/lib/cli/common-options";

describe("common-options", () => {
  describe("extractCommonOptions", () => {
    const input = {
      serial: true,
      localDeps: "link",
      inhibitSubprocessOutput: false,
      foo: "a",
      bar: "q",
    };

    it("extracts only the options we want", () => {
      expect(extractCommonOptions(input)).to.deep.equal({
        serial: true,
        localDeps: "link",
        inhibitSubprocessOutput: false,
      });
    });

    it("does not set fields that don't exist in the input", () => {
      expect(extractCommonOptions({})).to.deep.equal({});
    });
  });
});
