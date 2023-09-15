import { SSTConfig } from "sst";
import { pipeline } from "./stacks/pipeline.js";
import { DefaultStackSynthesizer } from "aws-cdk-lib";

export default {
  config(_input) {
    return {
      name: "pipeline",
      region: "us-east-1",
    };
  },
  async stacks(app) {
    await app.stack(pipeline, {
      crossRegionReferences: true
    });
  }
} satisfies SSTConfig;
