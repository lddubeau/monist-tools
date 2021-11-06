import * as path from "path";
import * as semver from "semver";
import { promisify } from "util";

import _glob from "glob";
import { Package, SetScriptOptions } from "./package";
import { DepTree, findLeavesInTrees, removeNodesFromTrees } from "./tree";
import { DEP_NAMES, NON_DEV_DEP_NAMES, ReadonlyJsonObject } from "./util";

const glob = promisify(_glob);

const STRICT_DEP_NAMES = ["dependencies", "optionalDependencies",
                          "bundledDependencies"];

/**
 * Models a package inside a monorepo.
 */
export class MonorepoMember extends Package {
  private _localDeps: Promise<Set<MonorepoMember>> | undefined;

  constructor(top: string, public readonly monorepo: Monorepo) {
    super(top);
  }

  /**
   * Get the "local" dependencies of this member. The "local" dependencies are
   * dependencies that point to other members of the same monorepo.
   *
   * @returns A set of dependencies.
   */
  async getLocalDeps(): Promise<Set<MonorepoMember>> {
    if (this._localDeps === undefined) {
      this._localDeps = (async () => {
        const members = await this.monorepo.getMembersByName();

        const deps = new Set<MonorepoMember>();
        for (const dep of Array.from(await this.getDeps())) {
          const member = members.get(dep);
          if (member !== undefined) {
            deps.add(member);
          }
        }

        return deps;
      })();
    }

    return this._localDeps;
  }

  /**
   * Check the dependencies of this package agains those of a monorepo.
   *
   * @returns A promise that resolves once the dependencies have all been
   * checked.
   */
  async verifyDeps(): Promise<string[]> {
    const name = await this.getName();
    const { monorepo } = this;
    const errors = [];
    const devDependencies =
      (await this.getJson()).devDependencies as ReadonlyJsonObject | undefined;
    if (devDependencies !== undefined) {
      for (const dep in devDependencies) {
        // We allow devDependencies that point to packages in the monorepo.  But
        // devDependencies that point to external packages do not make sense.
        if (!await monorepo.isMember(dep)) {
          errors.push(`${name} has devDependencies referring to external \
packages; such dependencies should instead be in the top package.json`);
        }
      }
    }

    const monorepoDeps =
      (await monorepo.getJson()).devDependencies as ReadonlyJsonObject ?? {};

    const json = await this.getJson();
    const reportedMissing = new Set<string>();
    const reportedInconsistent = new Set<string>();
    for (const depName of STRICT_DEP_NAMES) {
      const deps = json[depName] as ReadonlyJsonObject | undefined;
      if (deps !== undefined) {
        for (const dep in deps) {
          if (!await monorepo.isMember(dep)) {
            if (!(dep in monorepoDeps)) {
              if (!reportedMissing.has(dep)) {
                errors.push(`${name}: ${dep} is missing from monorepo \
package.json`);
                reportedMissing.add(dep);
              }
            }
            else if (monorepoDeps[dep] !== deps[dep]) {
              if (!reportedInconsistent.has(dep)) {
                errors.push(`${name}: ${dep} version is inconsistent from the \
one in the monorepo package.json`);
                reportedInconsistent.add(dep);
              }
            }
          }
        }
      }
    }

    {
      const deps = json.peerDependencies as ReadonlyJsonObject | undefined;
      if (deps !== undefined) {
        for (const dep in deps) {
          if (!await monorepo.isMember(dep)) {
            if (!(dep in monorepoDeps)) {
              if (!reportedMissing.has(dep)) {
                errors.push(`${name}: ${dep} is missing from monorepo \
package.json`);
                reportedMissing.add(dep);
              }
            }
            else if (!semver.intersects(monorepoDeps[dep] as string,
                                        deps[dep] as string)) {
              if (!reportedInconsistent.has(dep)) {
                errors.push(`${name}: ${dep} version is inconsistent from the \
one in the monorepo package.json`);
                reportedInconsistent.add(dep);
              }
            }
          }
        }
      }
    }

    return errors;
  }

  async updateLocalVersions(newVersion: string): Promise<void> {
    if (semver.valid(newVersion) === null) {
      throw new Error(`${newVersion} is not a valid semver version`);
    }
    const { monorepo } = this;
    const json = await this.getJsonCopy();

    json.version = newVersion;

    for (const depName of DEP_NAMES) {
      const deps = json[depName] as ReadonlyJsonObject | undefined;
      if (deps !== undefined) {
        for (const dep in deps) {
          if (await monorepo.isMember(dep)) {
            // tslint:disable-next-line:no-any
            (deps as any)[dep] = newVersion;
          }
        }
      }
    }

    await this.writeJson(json);
  }
}

/**
 * Models a monorepo.
 */
export class Monorepo extends Package {
  private _members: Promise<MonorepoMember[]> | undefined;
  private _membersByName: Promise<Map<string, MonorepoMember>> | undefined;
  private _plan: Promise<MonorepoMember[][]> | undefined;
  private _localDepTrees: Promise<DepTree<MonorepoMember>[]> | undefined;

  /**
   * @param top The top level directory of the monorepo.
   */
  constructor(top: string) {
    super(top);
  }

  /**
   * @returns An array of the members of this monorepo. The array is in
   * lexicographical order of package name. This function omits ignored
   * packages.
   */
  async getMembers(): Promise<MonorepoMember[]> {
    if (this._members === undefined) {
      // We implement this to call getMembersByName so that an exception
      // is raised whenever there's a duplicate package name.
      this._members =
        (async () => {
          const members = await this.getMembersByName();

          return Array.from(members.keys()).sort()
          // tslint:disable-next-line:no-non-null-assertion
            .map(name => members.get(name)!);
        })();
    }

    return this._members;
  }

  /**
   * Execute a mapping function on all members of the monorepo.
   *
   * @param callback The function to run.
   *
   * @returns An array of all values produced by the callback. This function
   * omits ignored packages.
   */
  async mapMembers<T>(callback: (member: MonorepoMember) => Promise<T>):
  Promise<T[]> {
    return Promise.all((await this.getMembers()).map(callback));
  }

  /**
   * @returns A map from member name to member. This function omits ignored
   * packages.
   */
  async getMembersByName(): Promise<Map<string, MonorepoMember>> {
    if (this._membersByName === undefined) {
      this._membersByName =
        (async () => {
          const map = new Map<string, MonorepoMember>();

          const workspaces = (await this.getJson()).workspaces as string[];
          if (workspaces == null) {
            throw new Error("workspaces must be defined");
          }

          const { top } = this;
          await Promise.all(
            workspaces.map(x => glob(x, {
              cwd: top,
            }))
              .map(async paths => {
                for (const p of await paths) {
                  const member = new MonorepoMember(path.join(top, p), this);
                  const name = await member.getName();

                  const existing = map.get(name);
                  if (existing !== undefined) {
                    const [first, second] = [member.top, existing.top].sort();
                    throw new Error(`duplicate package name ${name} at ${first} \
and ${second}`);
                  }

                  map.set(name, member);
                }
              }));

          return map;
        })();
    }

    return this._membersByName;
  }

  /**
   * Get a specific member of the monorepo.
   *
   * @param name The name of the member to fetch.
   *
   * @returns The member, or ``undefined`` if there is no such member. An
   * ignored package is not considered to be a "member".
   */
  async getMember(name: string): Promise<MonorepoMember | undefined> {
    return (await this.getMembersByName()).get(name);
  }

  /**
   * Check whether a name corresponds to the name of a member of the monorepo.
   *
   * @param name The name of the member to check.
   *
   * @returns ``true`` if there is a member with that name, ``false``
   * otherwise. An ignored package is not considered to be a "member".
   */
  async isMember(name: string): Promise<boolean> {
    return (await this.getMember(name)) !== undefined;
  }

  private async _makeTree(start: MonorepoMember,
                          converted: Map<MonorepoMember,
                          Promise<DepTree<MonorepoMember>>>):
  Promise<DepTree<MonorepoMember>> {
    let ret = converted.get(start);
    if (ret === undefined) {
      // tslint:disable-next-line:no-non-null-assertion
      ret = (async () => new DepTree(
        start,
        await Promise.all(Array.from((await start.getLocalDeps()))
                          .map(async dep => this._makeTree(
                            // tslint:disable-next-line:no-non-null-assertion
                            dep,
                            converted))),
      ))();

      converted.set(start, ret);
    }

    return ret;
  }

  /**
   * @returns An array of dependency trees. Each element of the array is a tree
   * root. Note that if a package appears multiple times in one or more trees,
   * then the *same node* (same JavaScript object) is used for each appearance
   * of the package in the tree.
   */
  async getLocalDepTrees(): Promise<DepTree<MonorepoMember>[]> {
    if (this._localDepTrees === undefined) {
      this._localDepTrees = (async () => {
        const nonRoots = new Set<MonorepoMember>();
        const members = await this.getMembers();
        await this.mapMembers(async pkg => {
          for (const dep of await pkg.getLocalDeps()) {
            nonRoots.add(dep);
          }
        });

        const converted =
          new Map<MonorepoMember, Promise<DepTree<MonorepoMember>>>();

        return Promise.all(members.filter(member => !nonRoots.has(member))
                           .map(async root => this._makeTree(root, converted)));
      })();
    }

    return this._localDepTrees;
  }

  /**
   * @returns An array of build steps. A step contains a set of package
   * names. Each step should be performed in order with the previous step
   * completely done before doing the next step. However, the packages in the
   * same step can be processed in parallel.
   */
  async getPlan(): Promise<MonorepoMember[][]> {
    if (this._plan === undefined) {
      this._plan = (async () => {
        const plan = [];
        let trees = await this.getLocalDepTrees();
        while (trees.length !== 0) {
          const build = Array.from(findLeavesInTrees(trees));
          plan.push(build.map(x => x.pkg));
          trees = removeNodesFromTrees(trees, build);
        }

        return plan;
      })();
    }

    return this._plan;
  }

  /**
   * Verify the dependencies set in the monorepo's ``package.json`` and those in
   * the member repositories.
   */
  async verifyDeps(): Promise<string[]> {
    const json = await this.getJson();

    return NON_DEV_DEP_NAMES.filter(dep => json[dep] != null)
      .map(dep => `${dep} are not allowed in the monorepo package.json`)
      .concat(...await this.mapMembers(async pkg => pkg.verifyDeps()));
  }

  /**
   * Update the versions of all packages in this project, and the dependencies
   * among each other.
   *
   * @param newVersion The new version string.
   *
   * @returns A promise that resolves once the update is done.
   */
  async updateLocalVersions(newVersion: string): Promise<void> {
    if (semver.valid(newVersion) === null) {
      throw new Error(`${newVersion} is not a valid semver version`);
    }

    await this.mapMembers(async pkg => pkg.updateLocalVersions(newVersion));

    // Update the top package.
    const mainPackageJson = await this.getJsonCopy();
    mainPackageJson.version = newVersion;

    return this.writeJson(mainPackageJson);
  }

  /**
   * Set an entry into the ``script`` section of ``package.json`` for all
   * member packages of this monorepo. Note that this does not modify the
   * ``package.json`` of the monorepo itself!!
   *
   * If the script already exists and the``overwrite`` option is not set, it is
   * an error. This method is designed such that if this test fails, then
   * nothing is modified.
   *
   * @param scriptName Name of the new script.
   *
   * @param content The content of the script.
   *
   * @param options Options that govern how the script is added.
   *
   * @returns A promise that resolves once the data is saved.
   */
  async setScript(scriptName: string, content: string,
                  options: SetScriptOptions): Promise<void> {
    // We don't need to check for conflicts if we are going to overwrite.
    if (!options.overwrite) {
      const conflicts =
        (await this.mapMembers(async pkg => pkg.getJson()))
        .filter(({ scripts }) => scripts != null &&
                // tslint:disable-next-line:no-any
                (scripts as any)[scriptName] !== undefined);

      if (conflicts.length !== 0) {
        throw new Error(`${await this.getName()}: trying to overwrite script \
${scriptName} in ${conflicts.map(x => x.name).join(", ")}`);
      }
    }

    await this.mapMembers(async pkg => pkg.setScript(scriptName, content,
                                                     options));
  }

  /**
   * Delete an entry from the ``script`` section of ``package.json`` for all
   * member packages of this monorepo. Note that this does not modify the
   * ``package.json`` of the monorepo itself!!
   *
   * If the script is already absent from one or all of the ``package.json``
   * files, this absence is ignored.
   *
   * @param scriptName Name of the script to delete.
   *
   * @returns A promise that resolves once the data is saved.
   */
  async delScript(scriptName: string): Promise<void> {
    await this.mapMembers(async pkg => pkg.delScript(scriptName));
  }
}
