import { expect, use } from "chai";
import * as diff from "diff";
import { expectRejection } from "expect-rejection";
import * as fs from "fs-extra";
import * as sinon from "sinon";
import * as sinonChai from "sinon-chai";

use(sinonChai);

import { Monorepo, MonorepoMember } from "../build/dist/lib/monorepo";
import { Package } from "../build/dist/lib/package";
import { DepTree } from "../build/dist/lib/tree";
import { DEP_NAMES, NON_DEV_DEP_NAMES } from "../build/dist/lib/util";

// tslint:disable-next-line:no-any
function cleanDiff(oldJson: any, newJson: any): string {
  return diff.createPatch("test",
                          JSON.stringify(oldJson, null, 2),
                          JSON.stringify(newJson, null, 2),
                          "", "").replace(/((.*?)\n){4}/, "");
}

async function expectJsonDiff(monorepo: Monorepo, newRepo: Monorepo,
                              nameToDiff: Record<string, string>):
Promise<void> {
  for (const [name, oldPkg] of (await monorepo.getMembersByName()).entries()) {
    // tslint:disable-next-line:no-non-null-assertion
    const newPkg = (await newRepo.getMember(name))!;
    expect(cleanDiff(await oldPkg.getJson(), await newPkg.getJson())).to
      .equal(nameToDiff[name]);
  }
}

describe("Monorepo", () => {
  let monorepo: Monorepo;
  let duplicate: Monorepo;

  before(() => {
    monorepo = new Monorepo("./test/data/monorepo-good");
    duplicate = new Monorepo("./test/data/monorepo-duplicate-packages");
  });

  describe("#getMembers()", () => {
    it("fails if there are duplicate package names", async () => {
      await expectRejection(duplicate.getMembers(),
                            Error,
                            "duplicate package name @abc/package-a at \
test/data/monorepo-duplicate-packages/packages/package-a and \
test/data/monorepo-duplicate-packages/packages/package-b");
    });

    it("returns an array of packages", async () => {
      const packages = await monorepo.getMembers();
      expect(await Promise.all(packages.map(async x => x.getName()))).to
        .members(["@abc/package-a", "@abc/package-b", "@abc/package-c",
                  "@abc/package-d"]);
    });
  });

  describe("#getMembersByName()", () => {
    it("fails if there are duplicate package names", async () => {
      await expectRejection(duplicate.getMembers(),
                            Error,
                            "duplicate package name @abc/package-a at \
test/data/monorepo-duplicate-packages/packages/package-a and \
test/data/monorepo-duplicate-packages/packages/package-b");
    });

    it("returns a map of name to member", async () => {
      const members = await monorepo.getMembersByName();
      expect(members).to.have.keys("@abc/package-a", "@abc/package-b",
                                   "@abc/package-c", "@abc/package-d");
      // tslint:disable-next-line:no-non-null-assertion
      const member = members.get("@abc/package-a")!;
      expect(member).to.be.instanceOf(MonorepoMember);
      expect(await member.getName()).to.equal("@abc/package-a");
    });
  });

  describe("#getMember() returns", () => {
    it("a member, when the name matches a member", async () => {
      const member = await monorepo.getMember("@abc/package-a");
      // tslint:disable-next-line:chai-vague-errors
      expect(member).to.not.be.undefined;
      expect(member).to.be.instanceOf(MonorepoMember);
    });

    it("undefined, when the name does not match a member", async () => {
      const member = await monorepo.getMember("XXX");
      // tslint:disable-next-line:chai-vague-errors
      expect(member).to.be.undefined;
    });
  });

  describe("#isMember() returns", () => {
    it("true, when the name matches a member", async () => {
      // tslint:disable-next-line:chai-vague-errors
      expect(await monorepo.isMember("@abc/package-a")).to.be.true;
    });

    it("false, when the name does not match a member", async () => {
      // tslint:disable-next-line:chai-vague-errors
      expect(await monorepo.isMember("XXX")).to.be.false;
    });
  });

  describe("#getLocalDepTrees", () => {
    it("returns dependency trees", async () => {
      const nameToPackage = await monorepo.getMembersByName();

      const nameToTree = new Map();
      const deps = await monorepo.getLocalDepTrees();
      for (const root of deps) {
        nameToTree.set(await root.pkg.getName(), root);
      }

      expect(nameToTree).to.have.keys("@abc/package-c", "@abc/package-d");
      // tslint:disable-next-line:chai-vague-errors
      expect(nameToTree.get("@abc/package-c"))
        .to.deep.equal(new DepTree(
          // tslint:disable-next-line:no-non-null-assertion
          nameToPackage.get("@abc/package-c")!,
          // tslint:disable-next-line:no-non-null-assertion
          [new DepTree(nameToPackage.get("@abc/package-a")!, []),
           // tslint:disable-next-line:no-non-null-assertion
           new DepTree(nameToPackage.get("@abc/package-b")!,
                       // tslint:disable-next-line:no-non-null-assertion
                       [new DepTree(nameToPackage.get("@abc/package-a")!,
                                    [])])]));

      // tslint:disable-next-line:chai-vague-errors
      expect(nameToTree.get("@abc/package-d"))
      // tslint:disable-next-line:no-non-null-assertion
        .to.deep.equal(new DepTree(nameToPackage.get("@abc/package-d")!, []));
    });
  });

  describe("#getPlan", () => {
    it("returns a plan", async () => {
      const packages = await monorepo.getMembersByName();
      const plan = await monorepo.getPlan();
      expect(plan).to.deep.members([
        [packages.get("@abc/package-a"), packages.get("@abc/package-d")],
        [packages.get("@abc/package-b")],
        [packages.get("@abc/package-c")],
      ]);
    });
  });

  describe("#removeLocalFromFile", () => {
    beforeEach(async () => {
      await fs.copy("test/data/monorepo-good", "test/tmp");
      monorepo = new Monorepo("test/tmp");
    });

    afterEach(async () => {
      await fs.remove("test/tmp");
    });

    it("deletes the file if it contained only local dependencies", async () => {
      const filePath = "test/tmp/packages/package-a/package-lock.json";
      await fs.writeFile(filePath, JSON.stringify({
        dependencies: {
          "@abc/package-b": true,
          "@abc/package-c": true,
        },
      }));
      // tslint:disable-next-line:chai-vague-errors
      expect(fs.existsSync(filePath)).to.be.true;
      await monorepo.removeLocalFromFile(filePath);
      // tslint:disable-next-line:chai-vague-errors
      expect(fs.existsSync(filePath)).to.be.false;
    });

    it("cleans the file", async () => {
      const filePath = "test/tmp/package-lock.json";
      await fs.writeFile(filePath, JSON.stringify({
        dependencies: {
          "@abc/package-b": true,
          "@abc/package-c": true,
          "@abc/external": true,
          fnord: true,
        },
      }));
      await monorepo.removeLocalFromFile(filePath);
      const data = JSON.parse((await fs.readFile(filePath)).toString());
      // tslint:disable-next-line:chai-vague-errors
      expect(data).to.deep.equal({
        dependencies: {
          "@abc/external": true,
          fnord: true,
        },
      });
    });
  });

  describe("#updateLocalVersions()", () => {
    beforeEach(async () => {
      await fs.copy("test/data/monorepo-good", "test/tmp");
      monorepo = new Monorepo("test/tmp");
    });

    afterEach(async () => {
      await fs.remove("test/tmp");
    });

    it("fails if the version passed is not a valid semver", async () => {
      const oldJson = await monorepo.getJson();
      const oldPackageJsons = await monorepo.mapMembers(async x => x.getJson());
      await expectRejection(monorepo.updateLocalVersions("fnord"),
                            Error, "fnord is not a valid semver version");

      const newRepo = new Monorepo("test/tmp");
      expect(await newRepo.getJson()).to.deep.equal(oldJson);
      expect(await newRepo.mapMembers(async x => x.getJson()))
        .to.deep.equal(oldPackageJsons);
    });

    // tslint:disable-next-line:max-func-body-length
    it("updates versions", async () => {
      const oldJson = await monorepo.getJson();
      await monorepo.updateLocalVersions("2.0.0");

      const newRepo = new Monorepo("test/tmp");
      const newJson = await newRepo.getJson();

      expect(cleanDiff(oldJson, newJson)).to.equal(`\
@@ -1,7 +1,7 @@
 {
   "name": "@abc/monorepo-good",
-  "version": "1.0.0",
+  "version": "2.0.0",
   "description": "",
   "main": "index.js",
   "devDependencies": {
     "external": "^1.0.0",
`);

      const nameToDiff: Record<string, string> = {
        "@abc/package-a": `\
@@ -1,7 +1,7 @@
 {
   "name": "@abc/package-a",
-  "version": "1.0.0",
+  "version": "2.0.0",
   "description": "",
   "main": "index.js",
   "scripts": {
     "test": "echo \\"Error: no test specified\\" && exit 1",
`,
        "@abc/package-b": `\
@@ -1,11 +1,11 @@
 {
   "name": "@abc/package-b",
-  "version": "1.0.0",
+  "version": "2.0.0",
   "description": "",
   "main": "index.js",
   "dependencies": {
-    "@abc/package-a": "^1.0.0"
+    "@abc/package-a": "2.0.0"
   },
   "scripts": {
     "test": "echo \\"Error: no test specified\\" && exit 1",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
`,
        "@abc/package-c": `\
@@ -1,29 +1,29 @@
 {
   "name": "@abc/package-c",
-  "version": "1.0.0",
+  "version": "2.0.0",
   "description": "",
   "main": "index.js",
   "dependencies": {
-    "@abc/package-a": "^1.0.0",
+    "@abc/package-a": "2.0.0",
     "@abc/external": "^1.0.0",
     "external": "^1.0.0"
   },
   "devDependencies": {
-    "@abc/package-b": "^1.0.0"
+    "@abc/package-b": "2.0.0"
   },
   "optionalDependencies": {
-    "@abc/package-b": "^1.0.0",
+    "@abc/package-b": "2.0.0",
     "@abc/external": "^1.0.0",
     "external": "^1.0.0"
   },
   "bundledDependencies": {
-    "@abc/package-b": "^1.0.0",
+    "@abc/package-b": "2.0.0",
     "@abc/external": "^1.0.0",
     "external": "^1.0.0"
   },
   "peerDependencies": {
-    "@abc/package-b": "^1.0.0",
+    "@abc/package-b": "2.0.0",
     "@abc/external": "^1.0.0",
     "external": "^1.0.0"
   },
   "scripts": {
`,
        "@abc/package-d": `\
@@ -1,7 +1,7 @@
 {
   "name": "@abc/package-d",
-  "version": "1.0.0",
+  "version": "2.0.0",
   "description": "",
   "main": "index.js",
   "scripts": {
     "test": "echo \\"Error: no test specified\\" && exit 1",
`,
      };

      await expectJsonDiff(monorepo, newRepo, nameToDiff);
    });
  });

  describe("#setScript()", () => {
    beforeEach(async () => {
      await fs.copy("test/data/monorepo-good", "test/tmp");
      monorepo = new Monorepo("test/tmp");
    });

    afterEach(async () => {
      await fs.remove("test/tmp");
    });

    it("fails if the script exists, and overwrite is false", async () => {
      const oldJson = await monorepo.getJson();
      const oldPackageJsons = await monorepo.mapMembers(async x => x.getJson());
      await expectRejection(monorepo.setScript("test", "something",
                                               { overwrite: false }),
                            Error,
                            "@abc/monorepo-good: trying to overwrite script \
test in @abc/package-a, @abc/package-b, @abc/package-c, @abc/package-d");

      const newRepo = new Monorepo("test/tmp");
      expect(await newRepo.getJson()).to.deep.equal(oldJson);
      expect(await newRepo.mapMembers(async x => x.getJson()))
        .to.deep.equal(oldPackageJsons);
    });

    it("succeeds if the script exists, and overwrite is true", async () => {
      const oldJson = await monorepo.getJson();
      await monorepo.setScript("test", "something", { overwrite: true });
      const newRepo = new Monorepo("test/tmp");
      expect(await newRepo.getJson()).to.deep.equal(oldJson);

      const nameToDiff: Record<string, string> = {
        "@abc/package-a": `\
@@ -3,9 +3,9 @@
   "version": "1.0.0",
   "description": "",
   "main": "index.js",
   "scripts": {
-    "test": "echo \\"Error: no test specified\\" && exit 1",
+    "test": "something",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
     "ping": "echo pong"
   },
   "author": "",
`,
        "@abc/package-b": `\
@@ -6,9 +6,9 @@
   "dependencies": {
     "@abc/package-a": "^1.0.0"
   },
   "scripts": {
-    "test": "echo \\"Error: no test specified\\" && exit 1",
+    "test": "something",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
     "ping": "echo pong"
   },
   "author": "",
`,
        "@abc/package-c": `\
@@ -26,9 +26,9 @@
     "@abc/external": "^1.0.0",
     "external": "^1.0.0"
   },
   "scripts": {
-    "test": "echo \\"Error: no test specified\\" && exit 1",
+    "test": "something",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
     "ping": "echo pong"
   },
   "author": "",
`,
        "@abc/package-d": `\
@@ -3,9 +3,9 @@
   "version": "1.0.0",
   "description": "",
   "main": "index.js",
   "scripts": {
-    "test": "echo \\"Error: no test specified\\" && exit 1",
+    "test": "something",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
     "ping": "echo pong"
   },
   "author": "",
`,
      };

      await expectJsonDiff(monorepo, newRepo, nameToDiff);
    });

    it("succeeds if the script does not exist", async () => {
      const oldJson = await monorepo.getJson();
      await monorepo.setScript("new", "something", { overwrite: false });
      const newRepo = new Monorepo("test/tmp");
      expect(await newRepo.getJson()).to.deep.equal(oldJson);

      const nameToDiff: Record<string, string> = {
        "@abc/package-a": `\
@@ -5,9 +5,10 @@
   "main": "index.js",
   "scripts": {
     "test": "echo \\"Error: no test specified\\" && exit 1",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
-    "ping": "echo pong"
+    "ping": "echo pong",
+    "new": "something"
   },
   "author": "",
   "license": "ISC"
 }
\\ No newline at end of file
`,
        "@abc/package-b": `\
@@ -8,9 +8,10 @@
   },
   "scripts": {
     "test": "echo \\"Error: no test specified\\" && exit 1",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
-    "ping": "echo pong"
+    "ping": "echo pong",
+    "new": "something"
   },
   "author": "",
   "license": "ISC"
 }
\\ No newline at end of file
`,
        "@abc/package-c": `\
@@ -28,9 +28,10 @@
   },
   "scripts": {
     "test": "echo \\"Error: no test specified\\" && exit 1",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
-    "ping": "echo pong"
+    "ping": "echo pong",
+    "new": "something"
   },
   "author": "",
   "license": "ISC"
 }
\\ No newline at end of file
`,
        "@abc/package-d": `\
@@ -5,9 +5,10 @@
   "main": "index.js",
   "scripts": {
     "test": "echo \\"Error: no test specified\\" && exit 1",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
-    "ping": "echo pong"
+    "ping": "echo pong",
+    "new": "something"
   },
   "author": "",
   "license": "ISC"
 }
\\ No newline at end of file
`,
      };

      await expectJsonDiff(monorepo, newRepo, nameToDiff);
    });
  });

  describe("#verifyDeps()", () => {
    it("reports no errors on a good monorepo", async () => {
      expect(await monorepo.verifyDeps()).to.have.members([]);
    });

    it("reports errors on a bad monorepo", async () => {
      const bad = new Monorepo("test/data/monorepo-with-dep-errors");
      expect(await bad.verifyDeps()).to.have.members([
        "dependencies are not allowed in the monorepo package.json",
        "optionalDependencies are not allowed in the monorepo package.json",
        "peerDependencies are not allowed in the monorepo package.json",
        "bundledDependencies are not allowed in the monorepo package.json",
        "@abc/package-c has devDependencies referring to external packages; \
such dependencies should instead be in the top package.json",
        "@abc/package-c: unaccounted is missing from monorepo package.json",
        "@abc/package-c: external version is inconsistent from the one in the \
monorepo package.json",
      ]);
    });
  });
});

describe("MonorepoMember", () => {
  let monorepo: Monorepo;
  let nameToPackage: Map<string, MonorepoMember>;

  before(async () => {
    monorepo = new Monorepo("./test/data/monorepo-good");
    nameToPackage = await monorepo.getMembersByName();
  });

  describe("#getLocalDeps", () => {
    it("returns the local dependencies", async () => {
      // tslint:disable-next-line:no-non-null-assertion
      expect(await nameToPackage.get("@abc/package-c")!.getLocalDeps())
        .to.have.keys([nameToPackage.get("@abc/package-a"),
                       nameToPackage.get("@abc/package-b")]);
    });
  });

  describe("#verifyDeps()", () => {
    let sandbox: sinon.SinonSandbox;

    beforeEach(() => {
      sandbox = sinon.createSandbox();
    });

    afterEach(() => {
      sandbox.restore();
    });

    // Since verifyDeps does not write to disk, our strategy is merely to stub
    // getJson so that the data verifyDeps gets is the one we want to use for
    // testing.
    async function stubPkg(member: Package, newJson: {}): Promise<void> {
      const json = await member.getJsonCopy();
      Object.assign(json, newJson);
      const stub = sandbox.stub(member, "getJson");
      stub.returns(Promise.resolve(newJson));
    }

    it("succeeds on empty dependencies", async () => {
      // tslint:disable-next-line:no-non-null-assertion
      const member = (await monorepo.getMember("@abc/package-a"))!;
      await stubPkg(member, {
        // This creates an object that has all depdency fields set to empty
        // objects.
        ...DEP_NAMES.reduce((acc, curr) => {
          acc[curr] = {};

          return acc;
          // tslint:disable-next-line:no-any
        }, {} as any),
      });
      expect(await member.verifyDeps()).to.have.members([]);
    });

    it("fails on external dependencies in devDependencies", async () => {
      // tslint:disable-next-line:no-non-null-assertion
      const member = (await monorepo.getMember("@abc/package-a"))!;
      await stubPkg(member, {
        devDependencies: {
          fnord: "^1.0.0",
        },
      });
      const errors = await member.verifyDeps();
      expect(errors).to.have.members([
        `@abc/package-a has devDependencies referring to external packages; \
such dependencies should instead be in the top package.json`,
      ]);
    });

    it("succeeds on local dependencies in devDependencies", async () => {
      // tslint:disable-next-line:no-non-null-assertion
      const member = (await monorepo.getMember("@abc/package-a"))!;
      await stubPkg(member, {
        devDependencies: {
        "@abc/package-b": "^1.0.0",
        },
      });
      expect(await member.verifyDeps()).to.have.members([]);
    });

    it("succeeds on local dependencies in the other dependencies", async () => {
      // tslint:disable-next-line:no-non-null-assertion
      const member = (await monorepo.getMember("@abc/package-a"))!;
      await stubPkg(member, {
        // This creates an object that has all non-dev depdency fields set to
        // a local dependency.
        ...NON_DEV_DEP_NAMES.reduce((acc, curr) => {
          acc[curr] = {
            "@abc/package-b": "^1.0.0",
          };

          return acc;
          // tslint:disable-next-line:no-any
        }, {} as any),
      });
      expect(await member.verifyDeps()).to.have.members([]);
    });

    for (const dep of NON_DEV_DEP_NAMES) {
      describe(`fails on external dependencies in ${dep}`, () => {
        it("missing from monorepo dependencies", async () => {
          // tslint:disable-next-line:no-non-null-assertion
          const member = (await monorepo.getMember("@abc/package-a"))!;
          await stubPkg(member, {
            [dep]: {
              "non-existent": "^1.0.0",
            },
          });
          expect(await member.verifyDeps()).to.have.members([
            "@abc/package-a: non-existent is missing from monorepo \
package.json",
          ]);
        });

        it("inconsistent with monorepo dependencies", async () => {
          // tslint:disable-next-line:no-non-null-assertion
          const member = (await monorepo.getMember("@abc/package-a"))!;
          await stubPkg(monorepo, {
            devDependencies: {
              fnord: "^2.0.0",
            },
          });
          await stubPkg(member, {
            [dep]: {
              fnord: "^1.0.0",
            },
          });
          expect(await member.verifyDeps()).to.have.members([
            "@abc/package-a: fnord version is inconsistent from the one in the \
monorepo package.json",
          ]);
        });
      });
    }
  });

  describe("#updateLocalVersions()", () => {
    beforeEach(async () => {
      await fs.copy("test/data/monorepo-good", "test/tmp");
      monorepo = new Monorepo("test/tmp");
    });

    afterEach(async () => {
      await fs.remove("test/tmp");
    });

    it("fails if the version passed is not a valid semver", async () => {
      // tslint:disable-next-line:no-non-null-assertion
      const member = (await monorepo.getMember("@abc/package-c"))!;
      const oldJson = await member.getJson();
      await expectRejection(member.updateLocalVersions("fnord"),
                            Error, "fnord is not a valid semver version");

      const json =
        await new Package("test/tmp/packages/package-c").getJson();

      // The data is unchanged.
      expect(json).to.deep.equal(oldJson);
    });

    it("updates local dependencies", async () => {
      // tslint:disable-next-line:no-non-null-assertion
      const member = (await monorepo.getMember("@abc/package-c"))!;
      await member.updateLocalVersions("2.0.0");

      const json =
        await new Package("test/tmp/packages/package-c").getJson();

      expect(json).to.have.property("version").equal("2.0.0");
      expect(json).to.have.property("dependencies").deep.equal({
        "@abc/package-a": "2.0.0",
        "@abc/external": "^1.0.0",
        external: "^1.0.0",
      });

      expect(json).to.have.property("devDependencies").deep.equal({
        "@abc/package-b": "2.0.0",
      });

      for (const dep of DEP_NAMES
           .filter(x => !["dependencies", "devDependencies"].includes(x))) {
        expect(json).to.have.property(dep).deep.equal({
          "@abc/package-b": "2.0.0",
          "@abc/external": "^1.0.0",
          external: "^1.0.0",
        });
      }
    });
  });
});
