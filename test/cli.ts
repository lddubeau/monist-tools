import { expect } from "chai";
import { execFile as _execFile } from "child_process";
import { expectRejection } from "expect-rejection";
import * as fs from "fs-extra";
import * as path from "path";
import { promisify } from "util";

// tslint:disable-next-line:mocha-no-side-effect-code
const execFile = promisify(_execFile);

// tslint:disable-next-line:mocha-no-side-effect-code
const monist = path.resolve("bin/monist");

// tslint:disable-next-line:mocha-no-side-effect-code
const CI = process.env.CI === "true";

//
// What's with this long timeout?? Some of the tests run actual npm commands,
// which even on a good day are pretty slow. When running in CI, it is even
// sloooooower. We could use some kind of stubbing system to replace the actual
// calls to npm with fake ones that resolve instantly. The problem though is
// that this would not trap mismatches between our code and what npm
// **actually** requires from us or returns back.
//
// tslint:disable-next-line:mocha-no-side-effect-code
const longTimeout = CI ? 20000 : 10000;

async function expectFailure(monorepo: string, args: string[],
                             expectedStderr: string | RegExp,
                             expectedStdout: string = ""): Promise<void> {
  const err = await expectRejection(execFile(monist, args, {
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
  const { stderr, stdout } = await execFile(monist, args, {
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

  describe("npm", () => {
    it("fails if no command is given", async () => {
      await expectFailure("./test/tmp", ["npm"],
                          `\
usage: monist npm [-h] [--serial] [--local-deps {link,install}]
                  [--inhibit-subprocess-output]
                  cmd [cmd ...]
monist npm: error: too few arguments
`);
    });

    it("fails if the command fails", async () => {
      await expectFailure("./test/tmp", ["npm", "fnord",
                                         "--inhibit-subprocess-output"],
                          /^monist: Error: Command failed: npm fnord/,
                         `\
monist: packages/package-a: started npm fnord
monist: packages/package-d: started npm fnord
`);
    });

    it("runs a command in all packages, following dependencies", async () => {
      // Starts for parallel packages are a determinate order because we access
      // packages in alphabetical order.  However, finishes are not necessarily
      // in a determinate order. Here package-a and package-d are parallel, and
      // can finish in any order relative to one-another.
      await expectSuccess("./test/tmp", ["npm", "root",
                                         "--inhibit-subprocess-output"], [
        `\
monist: packages/package-a: started npm root
monist: packages/package-d: started npm root
monist: packages/package-a: finished npm root
monist: packages/package-d: finished npm root
monist: packages/package-b: started npm root
monist: packages/package-b: finished npm root
monist: packages/package-c: started npm root
monist: packages/package-c: finished npm root
`,
        `\
monist: packages/package-a: started npm root
monist: packages/package-d: started npm root
monist: packages/package-d: finished npm root
monist: packages/package-a: finished npm root
monist: packages/package-b: started npm root
monist: packages/package-b: finished npm root
monist: packages/package-c: started npm root
monist: packages/package-c: finished npm root
`,
      ]);
    });

    it("runs the command serially, when --serial is used", async () => {
      await expectSuccess("./test/tmp", ["npm", "--serial",
                                         "--inhibit-subprocess-output", "root"],
        `\
monist: packages/package-a: started npm root
monist: packages/package-a: finished npm root
monist: packages/package-d: started npm root
monist: packages/package-d: finished npm root
monist: packages/package-b: started npm root
monist: packages/package-b: finished npm root
monist: packages/package-c: started npm root
monist: packages/package-c: finished npm root
`);
    });

    // tslint:disable-next-line:mocha-no-side-effect-code
    it("links when --local-deps=link is used", async () => {
      await expectSuccess("test/tmp", ["npm", "--local-deps=link", "--serial",
                                       "--inhibit-subprocess-output",
                                       "run", "build"],
        `\
monist: packages/package-a: started npm run build
monist: packages/package-a: finished npm run build
monist: packages/package-d: started npm run build
monist: packages/package-d: finished npm run build
monist: packages/package-b: linking @abc/package-a
monist: packages/package-b: linked @abc/package-a
monist: packages/package-b: started npm run build
monist: packages/package-b: finished npm run build
monist: packages/package-c: linking @abc/package-a
monist: packages/package-c: linked @abc/package-a
monist: packages/package-c: linking @abc/package-b
monist: packages/package-c: linked @abc/package-b
monist: packages/package-c: started npm run build
monist: packages/package-c: finished npm run build
`);
    }).timeout(longTimeout);

    // tslint:disable-next-line:mocha-no-side-effect-code
    it("installs when --local-deps=install is used", async () => {
      await expectSuccess("test/tmp", ["npm", "--local-deps=install",
                                       "--inhibit-subprocess-output",
                                       "--serial", "run", "build"],
        `\
monist: packages/package-a: started npm run build
monist: packages/package-a: finished npm run build
monist: packages/package-d: started npm run build
monist: packages/package-d: finished npm run build
monist: packages/package-b: installing @abc/package-a
monist: packages/package-b: installed @abc/package-a
monist: packages/package-b: started npm run build
monist: packages/package-b: finished npm run build
monist: packages/package-c: installing @abc/package-a
monist: packages/package-c: installed @abc/package-a
monist: packages/package-c: installing @abc/package-b
monist: packages/package-c: installed @abc/package-b
monist: packages/package-c: started npm run build
monist: packages/package-c: finished npm run build
`);
    }).timeout(longTimeout);
  });

  describe("run", () => {
    it("fails if no command is given", async () => {
      await expectFailure("./test/tmp", ["run"],
                          `\
usage: monist run [-h] [--serial] [--local-deps {link,install}]
                  [--inhibit-subprocess-output]
                  cmd [cmd ...]
monist run: error: too few arguments
`);
    });

    it("fails if the command fails", async () => {
      await expectFailure("./test/tmp", ["run", "test",
                                         "--inhibit-subprocess-output"],
                          /^monist: Error: Command failed: npm run test/,
                         `\
monist: packages/package-a: started npm run test
monist: packages/package-d: started npm run test
`);
    });

    it("runs a script in all packages, following dependencies", async () => {
      // Starts for parallel packages are a determinate order because we access
      // packages in alphabetical order.  However, finishes are not necessarily
      // in a determinate order. Here package-a and package-d are parallel, and
      // can finish in any order relative to one-another.
      await expectSuccess("./test/tmp", ["run", "ping",
                                         "--inhibit-subprocess-output"], [
        `\
monist: packages/package-a: started npm run ping
monist: packages/package-d: started npm run ping
monist: packages/package-a: finished npm run ping
monist: packages/package-d: finished npm run ping
monist: packages/package-b: started npm run ping
monist: packages/package-b: finished npm run ping
monist: packages/package-c: started npm run ping
monist: packages/package-c: finished npm run ping
`,
        `\
monist: packages/package-a: started npm run ping
monist: packages/package-d: started npm run ping
monist: packages/package-d: finished npm run ping
monist: packages/package-a: finished npm run ping
monist: packages/package-b: started npm run ping
monist: packages/package-b: finished npm run ping
monist: packages/package-c: started npm run ping
monist: packages/package-c: finished npm run ping
`,
      ]);
    });

    it("runs the command serially, when --serial is used", async () => {
      await expectSuccess("./test/tmp", ["run", "--serial",
                                         "--inhibit-subprocess-output", "ping"],
        `\
monist: packages/package-a: started npm run ping
monist: packages/package-a: finished npm run ping
monist: packages/package-d: started npm run ping
monist: packages/package-d: finished npm run ping
monist: packages/package-b: started npm run ping
monist: packages/package-b: finished npm run ping
monist: packages/package-c: started npm run ping
monist: packages/package-c: finished npm run ping
`);
    });

    // tslint:disable-next-line:mocha-no-side-effect-code
    it("links when --local-deps=link is used", async () => {
      await expectSuccess("test/tmp", ["run", "--local-deps=link", "--serial",
                                       "--inhibit-subprocess-output",
                                       "build"],
        `\
monist: packages/package-a: started npm run build
monist: packages/package-a: finished npm run build
monist: packages/package-d: started npm run build
monist: packages/package-d: finished npm run build
monist: packages/package-b: linking @abc/package-a
monist: packages/package-b: linked @abc/package-a
monist: packages/package-b: started npm run build
monist: packages/package-b: finished npm run build
monist: packages/package-c: linking @abc/package-a
monist: packages/package-c: linked @abc/package-a
monist: packages/package-c: linking @abc/package-b
monist: packages/package-c: linked @abc/package-b
monist: packages/package-c: started npm run build
monist: packages/package-c: finished npm run build
`);
    }).timeout(longTimeout);

    // tslint:disable-next-line:mocha-no-side-effect-code
    it("installs when --local-deps=install is used", async () => {
      await expectSuccess("test/tmp", ["run", "--local-deps=install",
                                       "--inhibit-subprocess-output",
                                       "--serial", "build"],
        `\
monist: packages/package-a: started npm run build
monist: packages/package-a: finished npm run build
monist: packages/package-d: started npm run build
monist: packages/package-d: finished npm run build
monist: packages/package-b: installing @abc/package-a
monist: packages/package-b: installed @abc/package-a
monist: packages/package-b: started npm run build
monist: packages/package-b: finished npm run build
monist: packages/package-c: installing @abc/package-a
monist: packages/package-c: installed @abc/package-a
monist: packages/package-c: installing @abc/package-b
monist: packages/package-c: installed @abc/package-b
monist: packages/package-c: started npm run build
monist: packages/package-c: finished npm run build
`);
    }).timeout(longTimeout);
  });

  describe("update-versions", () => {
    it("fails if no version is given", async () => {
      await expectFailure("./test/tmp", ["update-versions"],
                          `\
usage: monist update-versions [-h] version
monist update-versions: error: too few arguments
`);
    });

    it("fails if a bad version number is given", async () => {
      await expectFailure("./test/tmp", ["update-versions", "foo"],
                          `\
monist: Error: foo is not a valid semver version
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
@@ -12,4 +12,4 @@
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
monist: dependencies are not allowed in the monorepo package.json
monist: optionalDependencies are not allowed in the monorepo package.json
monist: peerDependencies are not allowed in the monorepo package.json
monist: bundledDependencies are not allowed in the monorepo package.json
monist: @abc/package-c has devDependencies referring to external packages; \
such dependencies should instead be in the top package.json
monist: @abc/package-c: unaccounted is missing from monorepo package.json
monist: @abc/package-c: external version is inconsistent from the one in the \
monorepo package.json
monist: Error: verification failed
`);
      await execFile("diff", ["-uraN", "test/data/monorepo-with-dep-errors",
                              "test/tmp"]);
    });
  });

  describe("set-script", () => {
    it("fails if no argument is given", async () => {
      await expectFailure("./test/tmp", ["set-script"],
                          `\
usage: monist set-script [-h] [--overwrite] name content
monist set-script: error: too few arguments
`);
    });

    it("fails if no content is given", async () => {
      await expectFailure("./test/tmp", ["set-script", "foo"],
                          `\
usage: monist set-script [-h] [--overwrite] name content
monist set-script: error: too few arguments
`);
    });

    it("fails if the script exists, and not overwriting", async () => {
      await expectFailure("./test/tmp", ["set-script", "test", "echo new"],
                          `\
monist: Error: @abc/monorepo-good: trying to overwrite script test in \
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
monist: dependencies are not allowed in the monorepo package.json
monist: optionalDependencies are not allowed in the monorepo package.json
monist: peerDependencies are not allowed in the monorepo package.json
monist: bundledDependencies are not allowed in the monorepo package.json
monist: @abc/package-c has devDependencies referring to external packages; \
such dependencies should instead be in the top package.json
monist: @abc/package-c: unaccounted is missing from monorepo package.json
monist: @abc/package-c: external version is inconsistent from the one in the \
monorepo package.json
monist: Error: verification failed
`);
      await execFile("diff", ["-uraN", "test/data/monorepo-with-dep-errors",
                              "test/tmp"]);
    });
  });
});

describe("cli: configuration", () => {
  describe("takes into account buildDir", () => {
    before(async () => {
      await fs.copy("test/data/monorepo-good-with-config", "test/tmp");
    });

    after(async () => {
      await fs.remove("test/tmp");
    });

    // tslint:disable-next-line:mocha-no-side-effect-code
    it("installs when --local-deps=install is used", async () => {
      await expectSuccess("test/tmp", ["npm", "--local-deps=install",
                                       "--inhibit-subprocess-output",
                                       "--serial", "run", "build"],
        `\
monist: packages/package-a: started npm run build
monist: packages/package-a: finished npm run build
monist: packages/package-d: started npm run build
monist: packages/package-d: finished npm run build
monist: packages/package-b: installing @abc/package-a
monist: packages/package-b: installed @abc/package-a
monist: packages/package-b: started npm run build
monist: packages/package-b: finished npm run build
monist: packages/package-c: installing @abc/package-a
monist: packages/package-c: installed @abc/package-a
monist: packages/package-c: installing @abc/package-b
monist: packages/package-c: installed @abc/package-b
monist: packages/package-c: started npm run build
monist: packages/package-c: finished npm run build
`);
    }).timeout(longTimeout);
  });
});
