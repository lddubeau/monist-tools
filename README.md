Monist is a lightweight tool for managing monorepos.

Monist is "lightweight" in the sense that it provides tools that your building
scripts may use, but *it does not try to replace your building scripts*. For
instance, for publishing your packages there is no master ``monist publish``
function to use. You need to write your own ``npm`` scripts, or (``gulp``
script, or what-have-you) which can make use of monist.

Motivation
==========

Most of the tools I ran into for supporting monorepos do not **adequately**
support projects that require that their source code be built into a publishable
format. **Adequately** is the operative word here. Some of them *nominally*
support it. They might suggest building into a ``lib`` directory, and setting
the ``package.json`` to include this directory and exclude source files,
etc. For *some* projects, this works. If you publish a single file, then the
``main`` field in your ``package.json`` can just point to that file under
``lib``, and you're done. So suppose you have a ``foo`` library, which you use
like this:

    import foo from "foo";

You compile your code to ``lib/foo.js`` and set a ``package.json`` that has
``main: "./lib/foo.js"``. No problem. I have some projects like this.

For *other* projects, that's a non-starter. Suppose you are publishing a complex
library that can be used like this:

    import { add, sub } from "mylib/ops";
    import { ajax, db } from "mylib/loaders";

Your library is set so that developers just load what they need from the module
they need, instead of loading the whole library monolithically. You can send all
output of the build into a ``lib`` subdirectory like you would in the
single-file scenario above. The problem though is that there is no provision in
``package.json`` to map *multiple files* to a subdirectory of a package. If you
try the same approach as in the previous scenario your users will have to import
modules like this:

    import { add, sub } from "mylib/lib/ops";
    import { ajax, db } from "mylib/lib/loaders";

The ``lib/`` subdirectory has to appear in the path. It stinks. It is an
implementation detail that developers using the library should not have to deal
with.

As we speak, to prevent the need for the extra ``lib/`` in the import paths, it
is necessary to build the publishable files into a separate directory, slap a
``package.json`` into that directory, and publish *that*.

Terminology
===========

This documentation uses a terminology that distinguishes types of x as "local x"
and "monorepo x". The basic distinction is:

* local package: a package which is a *part* of the monorepo. These packages
appear under the ``./packages/`` subdirectory. (The code of monist refers to
these as "monorepo members".)

* monorepo package (aka "top-level package"): the package modeled by a
``package.json`` appearing at the top of the monorepo. This package is never
published to an npm repository.

Then we derive other terms from this basic distinction:

* a "local `package.json`" is a `package.json` which belongs to a local package,
  whereas a "monorepo `package.json`" is the top-level one.

Requirements
============

Monist requires that your monorepo conforms to some constraints:

 * Your local packages meant for publication must be stored under
   ``./packages/``.

 * You must have a monorepo ``package.json`` file which is not meant for
   publication. You should set ``public: false`` in this file.

 * All package versions are in lockstep. If you have packages A and B in your
   monorepo, then when when A reaches version 2.3.1 then B also reaches the same
   version.

 * Publishing one package entails publishing all publishable packages, even if
   some packages did not change. (Note that monist itself does not publish
   packages so you could write a publication script that publishes only a subset
   of packages but your published packages could then refer to those packages
   you did not publish and would not be installable.)

 * When you build a local package, the publishable version of the local package
   must be put into a ``./build/dist`` subdirectory under the local package's
   directory. This path is not currently configurable.

 * Your build code must create a ``./build/dist/node_modules`` subdirectory
   which has the same contents as the ``node_modules`` which is in the local
   package's directory. Assuming you current working directory is the local
   package's directory, then this satisfies the requirement just given: ``(cd
   build/dist; ln -sf ../../node_modules)"``.

Usage
=====

You invoke monist with ``monist`` and then as first argument pass a monist
command. Here is a brief descriptions of the command monist offers. Please use
``monist [cmd] --help`` to get a more comprehensive description of what the
commands can do.

* ``monist npm`` runs an npm command through all packages. It orders execution
  by taking into account inter-package dependencies.

* ``monist run`` runs an npm script through all packages.  It orders execution
  by taking into account inter-package dependencies.

* ``monist update-versions`` updates version numbers in the ``package.json``
  files for all packages, including the monorepo package. Note that this command
  is **not** meant to *replace* ``npm version``. It is a command you'd use in
  your ``preversion`` script to update version numbers. This command verifies
  versions prior to running like ``monist verify-deps`` does.

* ``monist set-script`` is utility allowing you to quickly add a script to all
  local packages' ``package.json``. It does NOT touch the monorepo
  ``package.json``.

* ``monist verify-deps`` is a utility that checks whether the dependencies in
  your monorepo ``package.json`` and the local packages are in a sane state.

Usage Examples
==============

Here are examples of scripts in a monorepo ``package.json``:

```
  "scripts": {
    "build": "monist run --serial --local-deps=install build",
    "build-and-test": "monist run --serial --local-deps=install build-and-test",
    "clean": "monist run clean",
    "preversion": "monist npm version $npm_package_version",
    "postversion": "monist update-versions $npm_package_version && git add package.json package-lock.json packages/*/package.json && git commit -m'build: version bump' && git tag -a v$npm_package_version && npm run build-and-test && npm run self:publish"
  }
```

(This monorepo has a ``.nprmc`` which turns off automatic git manipulation when
issuing ``npm version``. This is why there are git commands in the
``postversion`` script.)

Running ``npm run build`` at the top level of the monorepo will build all local
packages, in an order that is such that when monist gets to some package, all
its local dependencies have been built and installed locally.

Dependency Verification Rules
=============================

Dependencies can exist both for the monorepo package and the local
packages. However, not all dependency usages make sense when using a
monorepo. ``monist verify-deps`` and ``monist update-versions`` perform the
following checks:

* The monorepo ``package.json`` may contain only ``devDependencies``. This
  package is never published. Consequently, the other types of dependencies
  supported by ``package.json`` do not make sense there.

* The ``devDependencies`` in a local ``package.json`` may only contain local
  packages. Development dependencies for everything else belong to the monorepo
  ``package.json``.

* All dependencies other than ``devDependencies`` in a local ``package.json``
  must have a corresponding entry in the monorepo ``package.json``, and the
  entry there must have the same version number as the entry in the local
  ``package.json``.

Parallelism
===========

By default, monist reads the ``package.json`` files for all packages in
``./packages/`` and checks dependencies among these packages. When it runs
commands on all packages (e.g. when using ``monist npm`` or ``monist run``), it
runs first the commands for those packages that depend on nothing, then the
commands on those packages that depend on the packages already processed,
etc. So by the time ``monist`` gets to package X, it has run the commands on all
the packages that X depends on, directly, or transitively.

For instance, suppose the local packages A, B and C. And suppose that A depends
on B and C but B and C do not depend on any other local package. Any ``monist``
command that operates on all packages will order execution like this:

1. Run in parallel the commands for B and C.
2. Run the commands for A.

Issues With Parallelism
-----------------------

Not all commands can be issued in parallel. Examples:

* Some ``git`` commands. If you search on the internet you'll find discussions
  mentioning that it is safe to run git commands in parallel. What this means is
  that if you run two commands in parallel, you will not corrupt your
  repository. However, ``git`` may cause one of the commands issued in parallel
  to fail in order to prevent corruption. If you run ``monist run-all
  some-script`` and the script fails because a ``git`` subcommand failed, that's
  probably not the outcome you were looking for.

* Some ``npm`` commands. For instance, if you run more than one ``npm link [some
  package]`` in parallel in the packages of a monorepo, one of the commands may
  fail due to a race condition on creation of the global package that ``npm
  link`` creates.

**Monist cannot by itself detect commands that should not be run in parallel.**
If you run into issues like those above, you may need to issue use the
``--serial`` option.

``--local-deps=link``
=====================

You should use ``--local-deps=link`` **if and only if** you will not run
multiple builds of different versions of the same monorepo in a way that makes
``npm`` use the same directory for global packages. The problem with ``npm
link`` is that effectively installs the linked package globally before creating
a local link. So suppose you have a single machine in which you run a build B1
that checked out the version tag ``v1.5.3`` of your monorepo and a build B2 that
checked out the ``dev`` branch of your monorepo. And suppose two local package,
P1 and P2, with P2 dependent on P1. If both builds share the same set of global
packages, then when P2 is built, it will link to the version of P1 that was last
built, which is indeterminate because the builds are parallel.

<!--  LocalWords:  monorepos npm json mylib ajax monorepo cd ln cmd deps nprmc
 -->
<!--  LocalWords:  preversion postversion m'build subcommand devDependencies
 -->
<!--  LocalWords:  optionalDependencies peerDependencies bundleDependencies dev
 -->
