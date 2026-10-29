import { getSchema } from "@tiptap/core";
import { Node as PMNodeClass, type Schema } from "@tiptap/pm/model";
import { createExtensions } from "./extensions";
import type { Canon } from "./roundtrip";
import type { PMNode } from "./pm";

/** Canonicalizes node JSON through a schema; throws if the node is invalid for it. */
export function createCanon(schema: Schema): Canon {
  return (node: PMNode) => {
    const pm = PMNodeClass.fromJSON(schema, node);
    pm.check();
    return pm.toJSON() as PMNode;
  };
}

export const defaultSchema = () => getSchema(createExtensions());
