import * as fs from "fs-extra";
import * as path from "path";

import { deepFreeze, DEP_NAMES, JsonObject, ReadonlyJsonObject } from "./util";

export interface SetScriptOptions {
  /** If the script already exists, overwrite it. */
  overwrite: boolean;
}

/**
 * Models a NPM package.
 *
 * These objects cache the data they read off the disk. Once loaded in memory,
 * the cached data is not ever altered. Some methods modify the on-disk files
 * that compose the package, but even after calling these methods, objects that
 * have already been loaded are not updated to reflect the new data on-disk.
 *
 * If you ever need to modify a package and then use the package, with
 * modifications, then you need to reacquire it by creating a new object.
 *
 */
export class Package {
  /**
   * The top-level directory of the package.
   */
  readonly top: string;

  /**
   * The path of the ``package.json`` file.
   */
  private readonly jsonPath: string;

  private _json: Promise<ReadonlyJsonObject> | undefined;
  private _name: Promise<string> | undefined;
  private _deps: Promise<Set<string>> | undefined;

  /**
   * @param top The top directory of the package.
   */
  constructor(top: string) {
    this.top = path.join(top);
    this.jsonPath = path.join(top, "package.json");
  }

  /**
   * Get the name of this package, read from the package.json file.
   */
  async getName(): Promise<string> {
    if (this._name === undefined) {
      this._name = (async () => (await this.getJson()).name as string)();
    }

    return this._name;
  }

  /**
   * @returns The contents of the ``package.json`` file. The returned object is
   * deeply frozen.
   */
  async getJson(): Promise<ReadonlyJsonObject> {
    if (this._json === undefined) {
      this._json = (async () => deepFreeze(JSON.parse(
        (await fs.readFile(this.jsonPath)).toString())))();
    }

    return this._json;
  }

  /**
   * @returns The contents of the ``package.json`` file. The object is a copy
   * which can be modified and won't affect the data this object has cached.
   */
  async getJsonCopy(): Promise<JsonObject> {
    return JSON.parse(JSON.stringify(await this.getJson()));
  }

  /**
   * Writes new contents to the ``package.json`` file of this package.
   *
   * **NOTE THAT THIS DOES NOT AFFECT THE CACHED DATA.**
   *
   * @param data The data object to write.
   *
   * @returns A promise resolved when the writing is done.
   */
  async writeJson(data: {}): Promise<void> {
    return fs.writeFile(this.jsonPath, JSON.stringify(data, null, 2));
  }

  /**
   * Get the dependencies of this package.
   *
   * @returns A promise that resolves to a set of strings which are the package
   * names.
   */
  async getDeps(): Promise<Set<string>> {
    if (this._deps === undefined) {
      this._deps = (async () => {
        const json = await this.getJson();
        let inputDeps: string[] = [];

        for (const name of DEP_NAMES) {
          const deps = json[name] as ReadonlyJsonObject | undefined;
          if (deps !== undefined) {
            inputDeps = inputDeps.concat(Object.keys(deps));
          }
        }

        return new Set(inputDeps);
      })();
    }

    return this._deps;
  }

  /**
   * Set an entry into the ``script`` section of ``package.json``.
   *
   * If the script already exists and the ``overwrite`` option is not set, it is
   * an error.
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
    const json = await this.getJsonCopy();
    let scripts = json.scripts as JsonObject | null | undefined;
    if (scripts == null) {
      scripts = json.scripts = {};
    }

    if (scripts[scriptName] !== undefined && !options.overwrite) {
      throw new Error(`${await this.getName()}: trying to overwrite script \
${scriptName}`);
    }

    scripts[scriptName] = content;

    await this.writeJson(json);
  }
}
