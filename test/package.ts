import { expect } from "chai";
import { expectRejection } from "expect-rejection";
import * as fs from "fs-extra";

import { Package } from "../build/dist/lib/package";

describe("Package", () => {
  let pkg: Package;

  before(() => {
    pkg = new Package("./test/data/monorepo-good");
  });

  afterEach(async () => {
    await fs.remove("test/tmp");
  });

  it("#top is correct", () => {
    expect(pkg).to.have.property("top").equal("test/data/monorepo-good");
  });

  it("#jsonPath is correct", () => {
    expect(pkg).to.have.property("jsonPath")
      .equal("test/data/monorepo-good/package.json");
  });

  it("#getName() returns the correct name", async () => {
    expect(await pkg.getName()).to.equal("@abc/monorepo-good");
  });

  describe("#getJson()", () => {
    it("returns the correct JSON", async () => {
      // We don't check the whole object.
      expect(await pkg.getJson()).to.have.property("name")
        .equal("@abc/monorepo-good");
    });

    it("returns a frozen object", async () => {
      // We don't check the whole object.
      expect(await pkg.getJson()).to.be.frozen;
    });
  });

  describe("#getJsonCopy()", () => {
    it("returns the correct JSON", async () => {
      // We don't check the whole object.
      expect(await pkg.getJsonCopy()).to.have.property("name")
        .equal("@abc/monorepo-good");
    });

    it("returns a copy", async () => {
      const copy = await pkg.getJsonCopy();
      expect(copy).to.not.be.frozen;
      copy.name = "foo";

      // Getting a new copy gets the original name.
      expect(await pkg.getJsonCopy()).to.have.property("name")
        .equal("@abc/monorepo-good");
    });
  });

  it("#writeJson() modifies the package.json file", async () => {
    await fs.copy("test/data/monorepo-good", "test/tmp");
    const tmpPkg = new Package("test/tmp");
    const json = await tmpPkg.getJsonCopy();
    json.name = "XXX";
    await tmpPkg.writeJson(json);
    // We have to create a new package object, because the earlier object is not
    // modified.
    expect(await new Package("test/tmp").getJson())
      .to.have.property("name").equal("XXX");
  });

  it("#getDeps() gets the dependencies", async () => {
    expect(await new Package("test/data/package1").getDeps())
      .to.have.keys("dep1", "dep2", "dep3", "dep4", "dep5", "dep6", "dep7",
                    "dep8", "dep9", "dep10");
  });

  describe("#setScript()", () => {
    beforeEach(async () => {
      await fs.copy("test/data/monorepo-good", "test/tmp");
    });

    it("sets the script", async () => {
      await new Package("test/tmp").setScript("foo", "bar",
                                              { overwrite: false });
      expect(await new Package("test/tmp").getJsonCopy()).to.have.nested
        .property("scripts.foo").equal("bar");
    });

    it("fails if overwriting and overwrite is false", async () => {
      await new Package("test/tmp").setScript("foo", "bar",
                                              { overwrite: false });
      await expectRejection(
        new Package("test/tmp").setScript("foo", "baz", { overwrite: false }),
        Error,
        "@abc/monorepo-good: trying to overwrite script foo");
      expect(await new Package("test/tmp").getJsonCopy()).to.have.nested
        .property("scripts.foo").equal("bar");
    });

    it("sets the script if overwriting and overwrite is true", async () => {
      await new Package("test/tmp").setScript("foo", "bar",
                                              { overwrite: false });
      await new Package("test/tmp").setScript("foo", "baz",
                                              { overwrite: true });
      expect(await new Package("test/tmp").getJsonCopy()).to.have.nested
        .property("scripts.foo").equal("baz");
    });
  });
});
