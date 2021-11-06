Monist-tools is a lightweight tool for managing monorepos.

Monist-tools is derived from monist. Monist itself is being retired in favor of
npm workspaces. Since this code base was forked from monist it shares history
with it and the first version of monist-tools is not 1.0.0 but version 2.0.0.

Motivation
==========

The ``npm`` developers did not think through the addition of ``workspaces``. In
particular doing a version update on workspaced packages does not change the
version number in ``depedencies`` or ``devDependencies``, etc.

See:

* https://github.com/npm/cli/issues/3403
* https://github.com/npm/cli/issues/3885

Terminology
===========

This documentation uses a terminology that distinguishes types of x as "local x"
and "monorepo x". The basic distinction is:

* local package: a package which is a *part* of the monorepo. These packages are
in the ``workspaces`` setting of the top-level package. (The code of monist
refers to these as "monorepo members".)

* monorepo package (aka "top-level package"): the package modeled by a
``package.json`` appearing at the top of the monorepo. This package is never
published to an npm repository.

Then we derive other terms from this basic distinction:

* a "local ``package.json``" is a ``package.json`` which belongs to a local
  package, whereas a "monorepo ``package.json``" is the top-level one.

Requirements
============

Monist requires that your monorepo conforms to some constraints:

 * You must have a correctly defined ``workspaces`` in your ``package.json``
   file.

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

Usage
=====

You invoke monist with ``monist`` and then as first argument pass a monist
command. Here is a brief descriptions of the command monist offers. Please use
``monist-tools [cmd] --help`` to get a more comprehensive description of what
the commands can do.

* ``monist-tools update-versions`` updates version numbers in the
  ``package.json`` files for all packages, including the monorepo package. Note
  that this command is **not** meant to *replace* ``npm version``. It is a
  command you'd use in your ``preversion`` script to update version
  numbers. This command verifies versions prior to running like ``monist
  verify-deps`` does.

* ``monist-tools set-script`` is utility allowing you to quickly add a script to
  all local packages' ``package.json``. It does NOT touch the monorepo
  ``package.json``.

* ``monist-tools verify-deps`` is a utility that checks whether the dependencies
  in your monorepo ``package.json`` and the local packages are in a sane state.

Usage Examples
==============

Here are examples of scripts in a monorepo ``package.json``:

```
  "scripts": {
    "postversion": "monist-tools update-versions $npm_package_version && git add package.json package-lock.json packages/*/package.json && git commit -m'build: version bump' && git tag -a v$npm_package_version && npm run build-and-test && npm run self:publish"
  }
```

(This monorepo has a ``.nprmc`` which turns off automatic git manipulation when
issuing ``npm version``. This is why there are git commands in the
``postversion`` script.)

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

<!--  LocalWords:  monorepos npm json mylib ajax monorepo cd ln cmd deps nprmc
 -->
<!--  LocalWords:  preversion postversion m'build subcommand devDependencies
 -->
<!--  LocalWords:  optionalDependencies peerDependencies bundleDependencies dev
 -->
