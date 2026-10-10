import { Type } from "typebox";
import { createTwoFilesPatch } from "diff";
import { defineTool } from "@earendil-works/pi-durable";
import { resolve } from "node:path";

const parameters = Type.Object({
  path: Type.String({ description: "Path to the file to write (relative or absolute)" }),
  content: Type.String({ description: "Content to write to the file" }),
});

export function createTenguWriteTool() {
  return defineTool({
    name: "write",
    description: "Write content to a file. Creates the file if it doesn't exist, overwrites if it does. Automatically creates parent directories.",
    parameters,
    async execute({ path, content }, api, context) {
      const env = api.env;
      if (!env) throw new Error("Tool requires an execution environment");
      const cwd = (await api.agent(context)).cwd;
      if (!cwd) throw new Error("Write tool requires a working directory");
      const absolutePath = resolve(cwd, path);
      return (async () => {
        if (context.abortSignal?.aborted) throw new Error("Operation aborted");
        const existing = await env.readTextFile(absolutePath, context);
        const previous = existing.ok ? existing.value : "";
        const written = await env.writeFile(absolutePath, content, context);
        if (!written.ok) throw new Error(`Could not write file: ${path}. Error code: ${written.error.code}.`);
        if (context.abortSignal?.aborted) throw new Error("Operation aborted");
        return {
          content: [{ type: "text" as const, text: `Successfully wrote to ${path}` }],
          details: { patch: createTwoFilesPatch(path, path, previous, content, "before", "after") },
        };
      })();
    },
  });
}
