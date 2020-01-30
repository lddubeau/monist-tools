import * as fs from "fs";

import Ajv from "ajv";

import { MonistConfiguration } from "./config-schema-object";
import * as schema from "./config-schema.json";

/**
 * This is the type of the configuration after it has been loaded and filled
 * with default values.
 */
export type MonistConfig = Required<MonistConfiguration>;

const ajv = new Ajv({ useDefaults: true });
const validator = ajv.compile(schema);

export function loadConfig(): MonistConfig {
  let config: MonistConfiguration = {};
  try {
    config = JSON.parse(fs.readFileSync("./monistrc.json").toString());
  }
  catch (ex) {
    if (ex.code !== "ENOENT") {
      throw ex;
    }
  }

  if (!validator(config)) {
    // tslint:disable-next-line:prefer-template
    throw new Error("the configuration passed to monist is not valid: " +
                    ajv.errorsText(validator.errors!, {
                      dataVar: "config",
                    }));
  }

  return config as MonistConfig;
}
