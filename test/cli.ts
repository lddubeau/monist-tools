import chai from "chai";
import { expect } from "chai";
import { execFile as _execFile } from "child_process";
import { expectRejection, use } from "expect-rejection";
import * as fs from "fs-extra";
import * as path from "path";
import { promisify } from "util";

use(chai);

// tslint:disable-next-line:mocha-no-side-effect-code
const execFile = promisify(_execFile);

// tslint:disable-next-line:mocha-no-side-effect-code
const monistTool = path.resolve("bin/monist-tools");

async function expectFailure(monorepo: string, args: string[],
                             expectedStderr: string | RegExp,
                             expectedStdout: string = ""): Promise<void> {
  const err = await expectRejection(execFile(monistTool, args, {
    cwd: monorepo,
  }), Error);
  // tslint:disable-next-line:no-any
  expect((err as any).code).to.not.equal(0);
  if (typeof expectedStderr === "string") {
    expect(err).to.have.property("stderr").equal(expectedStderr);
  }
  else {
    expect(err).to.have.property("stderr").match(expectedStderr);
  }
  expect(err).to.have.property("stdout").equal(expectedStdout);
}

async function expectSuccess(monorepo: string, args: string[],
                             expectedStdout: string | string[]): Promise<void> {
  const { stderr, stdout } = await execFile(monistTool, args, {
    cwd: monorepo,
  });
  expect(stderr).to.equal("");
  if (Array.isArray(expectedStdout)) {
    expect(stdout).to.be.oneOf(expectedStdout);
  }
  else {
    expect(stdout).to.equal(expectedStdout);
  }
}

async function expectDifference(frm: string, to: string,
                                expectedDiff: string): Promise<void> {
  try {
    // diff will return a non-zero status
    await execFile("diff", ["-uraN", frm, to]);
    expect.fail("There was no difference");
  }
  catch (e) {
    const { stdout } = e;
    expect(stdout.replace(/^(---|\+\+\+) (.*?)\t.*$/gm, "$1 $2"))
      .to.equal(expectedDiff);
  }
}

describe("cli", () => {
  beforeEach(async () => {
    await fs.copy("test/data/monorepo-good", "test/tmp");
  });

  afterEach(async () => {
    await fs.remove("test/tmp");
  });

  describe("update-versions", () => {
    it("fails if no version is given", async () => {
      await expectFailure("./test/tmp", ["update-versions"],
                          `\
usage: monist-tools update-versions [-h] version
monist-tools update-versions: error: too few arguments
`);
    });

    it("fails if a bad version number is given", async () => {
      await expectFailure("./test/tmp", ["update-versions", "foo"],
                          `\
monist-tools: Error: foo is not a valid semver version
`);

    });
    // tslint:disable-next-line:max-func-body-length
    it("updates the versions", async () => {
      await expectSuccess("./test/tmp", ["update-versions", "2.0.0"], "");

      await expectDifference("test/data/monorepo-good", "test/tmp", `\
diff -uraN test/data/monorepo-good/package.json test/tmp/package.json
--- test/data/monorepo-good/package.json
+++ test/tmp/package.json
@@ -1,6 +1,6 @@
 {
   "name": "@abc/monorepo-good",
-  "version": "1.0.0",
+  "version": "2.0.0",
   "description": "",
   "main": "index.js",
   "devDependencies": {
@@ -18,4 +18,4 @@
   },
   "author": "",
   "license": "ISC"
-}
+}
\\ No newline at end of file
diff -uraN test/data/monorepo-good/packages/package-a/package.json \
test/tmp/packages/package-a/package.json
--- test/data/monorepo-good/packages/package-a/package.json
+++ test/tmp/packages/package-a/package.json
@@ -1,6 +1,6 @@
 {
   "name": "@abc/package-a",
-  "version": "1.0.0",
+  "version": "2.0.0",
   "description": "",
   "main": "index.js",
   "scripts": {
@@ -10,4 +10,4 @@
   },
   "author": "",
   "license": "ISC"
-}
+}
\\ No newline at end of file
diff -uraN test/data/monorepo-good/packages/package-b/package.json \
test/tmp/packages/package-b/package.json
--- test/data/monorepo-good/packages/package-b/package.json
+++ test/tmp/packages/package-b/package.json
@@ -1,10 +1,10 @@
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
@@ -13,4 +13,4 @@
   },
   "author": "",
   "license": "ISC"
-}
+}
\\ No newline at end of file
diff -uraN test/data/monorepo-good/packages/package-c/package.json \
test/tmp/packages/package-c/package.json
--- test/data/monorepo-good/packages/package-c/package.json
+++ test/tmp/packages/package-c/package.json
@@ -1,28 +1,28 @@
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
@@ -33,4 +33,4 @@
   },
   "author": "",
   "license": "ISC"
-}
+}
\\ No newline at end of file
diff -uraN test/data/monorepo-good/packages/package-d/package.json \
test/tmp/packages/package-d/package.json
--- test/data/monorepo-good/packages/package-d/package.json
+++ test/tmp/packages/package-d/package.json
@@ -1,6 +1,6 @@
 {
   "name": "@abc/package-d",
-  "version": "1.0.0",
+  "version": "2.0.0",
   "description": "",
   "main": "index.js",
   "scripts": {
@@ -10,4 +10,4 @@
   },
   "author": "",
   "license": "ISC"
-}
+}
\\ No newline at end of file
`);
    });

    it("reports dependency errors", async () => {
      await fs.remove("test/tmp");
      await fs.copy("test/data/monorepo-with-dep-errors", "test/tmp");
      await expectFailure("./test/tmp", ["update-versions", "2.0.0"],
                          `\
monist-tools: dependencies are not allowed in the monorepo package.json
monist-tools: optionalDependencies are not allowed in the monorepo package.json
monist-tools: peerDependencies are not allowed in the monorepo package.json
monist-tools: bundledDependencies are not allowed in the monorepo package.json
monist-tools: @abc/package-c has devDependencies referring to external packages; \
such dependencies should instead be in the top package.json
monist-tools: @abc/package-c: unaccounted is missing from monorepo package.json
monist-tools: @abc/package-c: external version is inconsistent from the one in the \
monorepo package.json
monist-tools: @abc/package-c: external-2 version is inconsistent from the one in the \
monorepo package.json
monist-tools: Error: verification failed
`);
      await execFile("diff", ["-uraN", "test/data/monorepo-with-dep-errors",
                              "test/tmp"]);
    });
  });

  describe("set-script", () => {
    it("fails if no argument is given", async () => {
      await expectFailure("./test/tmp", ["set-script"],
                          `\
usage: monist-tools set-script [-h] [--overwrite] name content
monist-tools set-script: error: too few arguments
`);
    });

    it("fails if no content is given", async () => {
      await expectFailure("./test/tmp", ["set-script", "foo"],
                          `\
usage: monist-tools set-script [-h] [--overwrite] name content
monist-tools set-script: error: too few arguments
`);
    });

    it("fails if the script exists, and not overwriting", async () => {
      await expectFailure("./test/tmp", ["set-script", "test", "echo new"],
                          `\
monist-tools: Error: @abc/monorepo-good: trying to overwrite script test in \
@abc/package-a, @abc/package-b, @abc/package-c, @abc/package-d
`);

      await execFile("diff", ["-uraN", "test/data/monorepo-good",
                              "test/tmp"]);
    });

    it("succeeds if the script exists, and overwriting", async () => {
      await expectSuccess("./test/tmp", ["set-script", "--overwrite", "test",
                                         "echo new"],
                          "");

      await expectDifference("test/data/monorepo-good",
                             "test/tmp", `\
diff -uraN test/data/monorepo-good/packages/package-a/package.json \
test/tmp/packages/package-a/package.json
--- test/data/monorepo-good/packages/package-a/package.json
+++ test/tmp/packages/package-a/package.json
@@ -4,10 +4,10 @@
   "description": "",
   "main": "index.js",
   "scripts": {
-    "test": "echo \\"Error: no test specified\\" && exit 1",
+    "test": "echo new",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
     "ping": "echo pong"
   },
   "author": "",
   "license": "ISC"
-}
+}
\\ No newline at end of file
diff -uraN test/data/monorepo-good/packages/package-b/package.json \
test/tmp/packages/package-b/package.json
--- test/data/monorepo-good/packages/package-b/package.json
+++ test/tmp/packages/package-b/package.json
@@ -7,10 +7,10 @@
     "@abc/package-a": "^1.0.0"
   },
   "scripts": {
-    "test": "echo \\"Error: no test specified\\" && exit 1",
+    "test": "echo new",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
     "ping": "echo pong"
   },
   "author": "",
   "license": "ISC"
-}
+}
\\ No newline at end of file
diff -uraN test/data/monorepo-good/packages/package-c/package.json \
test/tmp/packages/package-c/package.json
--- test/data/monorepo-good/packages/package-c/package.json
+++ test/tmp/packages/package-c/package.json
@@ -27,10 +27,10 @@
     "external": "^1.0.0"
   },
   "scripts": {
-    "test": "echo \\"Error: no test specified\\" && exit 1",
+    "test": "echo new",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
     "ping": "echo pong"
   },
   "author": "",
   "license": "ISC"
-}
+}
\\ No newline at end of file
diff -uraN test/data/monorepo-good/packages/package-d/package.json \
test/tmp/packages/package-d/package.json
--- test/data/monorepo-good/packages/package-d/package.json
+++ test/tmp/packages/package-d/package.json
@@ -4,10 +4,10 @@
   "description": "",
   "main": "index.js",
   "scripts": {
-    "test": "echo \\"Error: no test specified\\" && exit 1",
+    "test": "echo new",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
     "ping": "echo pong"
   },
   "author": "",
   "license": "ISC"
-}
+}
\\ No newline at end of file
`);
    });

    it("succeeds if the script does not exit", async () => {
      await expectSuccess("./test/tmp", ["set-script", "new", "echo new"], "");
      await expectDifference("test/data/monorepo-good",
                             "test/tmp", `\
diff -uraN test/data/monorepo-good/packages/package-a/package.json \
test/tmp/packages/package-a/package.json
--- test/data/monorepo-good/packages/package-a/package.json
+++ test/tmp/packages/package-a/package.json
@@ -6,8 +6,9 @@
   "scripts": {
     "test": "echo \\"Error: no test specified\\" && exit 1",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
-    "ping": "echo pong"
+    "ping": "echo pong",
+    "new": "echo new"
   },
   "author": "",
   "license": "ISC"
-}
+}
\\ No newline at end of file
diff -uraN test/data/monorepo-good/packages/package-b/package.json \
test/tmp/packages/package-b/package.json
--- test/data/monorepo-good/packages/package-b/package.json
+++ test/tmp/packages/package-b/package.json
@@ -9,8 +9,9 @@
   "scripts": {
     "test": "echo \\"Error: no test specified\\" && exit 1",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
-    "ping": "echo pong"
+    "ping": "echo pong",
+    "new": "echo new"
   },
   "author": "",
   "license": "ISC"
-}
+}
\\ No newline at end of file
diff -uraN test/data/monorepo-good/packages/package-c/package.json \
test/tmp/packages/package-c/package.json
--- test/data/monorepo-good/packages/package-c/package.json
+++ test/tmp/packages/package-c/package.json
@@ -29,8 +29,9 @@
   "scripts": {
     "test": "echo \\"Error: no test specified\\" && exit 1",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
-    "ping": "echo pong"
+    "ping": "echo pong",
+    "new": "echo new"
   },
   "author": "",
   "license": "ISC"
-}
+}
\\ No newline at end of file
diff -uraN test/data/monorepo-good/packages/package-d/package.json \
test/tmp/packages/package-d/package.json
--- test/data/monorepo-good/packages/package-d/package.json
+++ test/tmp/packages/package-d/package.json
@@ -6,8 +6,9 @@
   "scripts": {
     "test": "echo \\"Error: no test specified\\" && exit 1",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
-    "ping": "echo pong"
+    "ping": "echo pong",
+    "new": "echo new"
   },
   "author": "",
   "license": "ISC"
-}
+}
\\ No newline at end of file
`);
    });
  });

  describe("del-script", () => {
    it("fails if no argument is given", async () => {
      await expectFailure("./test/tmp", ["del-script"],
                          `\
usage: monist-tools del-script [-h] name
monist-tools del-script: error: too few arguments
`);
    });

    it("deletes the script if the script exists", async () => {
      await expectSuccess("./test/tmp", ["del-script", "test"], "");

      await expectDifference("test/data/monorepo-good",
                             "test/tmp", `\
diff -uraN test/data/monorepo-good/packages/package-a/package.json \
test/tmp/packages/package-a/package.json
--- test/data/monorepo-good/packages/package-a/package.json
+++ test/tmp/packages/package-a/package.json
@@ -4,10 +4,9 @@
   "description": "",
   "main": "index.js",
   "scripts": {
-    "test": "echo \\"Error: no test specified\\" && exit 1",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
     "ping": "echo pong"
   },
   "author": "",
   "license": "ISC"
-}
+}
\\ No newline at end of file
diff -uraN test/data/monorepo-good/packages/package-b/package.json \
test/tmp/packages/package-b/package.json
--- test/data/monorepo-good/packages/package-b/package.json
+++ test/tmp/packages/package-b/package.json
@@ -7,10 +7,9 @@
     "@abc/package-a": "^1.0.0"
   },
   "scripts": {
-    "test": "echo \\"Error: no test specified\\" && exit 1",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
     "ping": "echo pong"
   },
   "author": "",
   "license": "ISC"
-}
+}
\\ No newline at end of file
diff -uraN test/data/monorepo-good/packages/package-c/package.json \
test/tmp/packages/package-c/package.json
--- test/data/monorepo-good/packages/package-c/package.json
+++ test/tmp/packages/package-c/package.json
@@ -27,10 +27,9 @@
     "external": "^1.0.0"
   },
   "scripts": {
-    "test": "echo \\"Error: no test specified\\" && exit 1",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
     "ping": "echo pong"
   },
   "author": "",
   "license": "ISC"
-}
+}
\\ No newline at end of file
diff -uraN test/data/monorepo-good/packages/package-d/package.json \
test/tmp/packages/package-d/package.json
--- test/data/monorepo-good/packages/package-d/package.json
+++ test/tmp/packages/package-d/package.json
@@ -4,10 +4,9 @@
   "description": "",
   "main": "index.js",
   "scripts": {
-    "test": "echo \\"Error: no test specified\\" && exit 1",
     "build": "mkdir -p build/dist && cp package.json build/dist && \
(cd build/dist; ln -sf ../../node_modules)",
     "ping": "echo pong"
   },
   "author": "",
   "license": "ISC"
-}
+}
\\ No newline at end of file
`);
    });
  });

  describe("verify-deps", () => {
    it("is successful if there are no errors", async () => {
      await fs.remove("test/tmp");
      await fs.copy("test/data/monorepo-good", "test/tmp");
      await expectSuccess("./test/tmp", ["verify-deps"], "");
      await execFile("diff", ["-uraN", "test/data/monorepo-good",
                              "test/tmp"]);
    });

    it("reports dependency errors", async () => {
      await fs.remove("test/tmp");
      await fs.copy("test/data/monorepo-with-dep-errors", "test/tmp");
      await expectFailure("./test/tmp", ["verify-deps"],
                          `\
monist-tools: dependencies are not allowed in the monorepo package.json
monist-tools: optionalDependencies are not allowed in the monorepo package.json
monist-tools: peerDependencies are not allowed in the monorepo package.json
monist-tools: bundledDependencies are not allowed in the monorepo package.json
monist-tools: @abc/package-c has devDependencies referring to external packages; \
such dependencies should instead be in the top package.json
monist-tools: @abc/package-c: unaccounted is missing from monorepo package.json
monist-tools: @abc/package-c: external version is inconsistent from the one in the \
monorepo package.json
monist-tools: @abc/package-c: external-2 version is inconsistent from the one in the \
monorepo package.json
monist-tools: Error: verification failed
`);
      await execFile("diff", ["-uraN", "test/data/monorepo-with-dep-errors",
                              "test/tmp"]);
    });
  });
});
