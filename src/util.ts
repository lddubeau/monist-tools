/**
 * Utilities
 */

export const scopeAndNameRe = /^@(.*?)\/(.*)$/;

export function parseName(name: string): { scope: string; localName: string } {
  const match = scopeAndNameRe.exec(name);

  return (match === null) ? { scope: "", localName: name } :
    { scope: match[1], localName: match[2] };
}

export function deepFreeze<T>(obj: T): Readonly<T> {
  // tslint:disable-next-line:no-any
  const anyObj = obj as any;
  for (const name of Object.getOwnPropertyNames(obj)) {
    const value = anyObj[name];

    anyObj[name] = (value != null && typeof value === "object") ?
      deepFreeze(value) : value;
  }

  return Object.freeze(obj);
}

export type JsonTypes =
  JsonObject | string | number | boolean | null | JsonTypeArray;
export interface JsonTypeArray extends Array<JsonTypes> {}

export interface JsonObject {
  [key: string]: JsonTypes;
}

export type ReadonlyJsonTypes =
  ReadonlyJsonObject | string | number | boolean | null | ReadonlyJsonTypeArray;

export interface ReadonlyJsonTypeArray
extends ReadonlyArray<ReadonlyJsonTypes> {}

export interface ReadonlyJsonObject {
  readonly [key: string]: ReadonlyJsonTypes;
}

export const NON_DEV_DEP_NAMES = ["dependencies", "optionalDependencies",
                                  "peerDependencies", "bundledDependencies"];
export const DEP_NAMES = NON_DEV_DEP_NAMES.concat(["devDependencies"]);
