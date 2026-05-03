import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

async function getFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, {
    withFileTypes: true
  });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        return getFiles(fullPath);
      }

      return [fullPath];
    })
  );

  return files.flat();
}

describe("backend API safety", () => {
  it("keeps client Firebase SDK imports out of backend code", async () => {
    const backendFiles = (
      await Promise.all([
        getFiles(path.join(process.cwd(), "app", "api")),
        getFiles(path.join(process.cwd(), "lib", "server")),
      ])
    )
      .flat()
      .filter((filePath) => filePath.endsWith(".ts"));

    for (const filePath of backendFiles) {
      const contents = await readFile(filePath, "utf8");

      expect(contents, filePath).not.toMatch(/from ["']firebase\/firestore["']/);
      expect(contents, filePath).not.toMatch(/@\/lib\/server\/firebase-client/);
      expect(contents, filePath).not.toMatch(/@\/lib\/server\/firebase-admin/);
      expect(contents, filePath).not.toMatch(/from ["']firebase\/app["']/);
      expect(contents, filePath).not.toMatch(/from ["']firebase\/auth["']/);
      expect(contents, filePath).not.toMatch(/from ["']firebase\/database["']/);
      expect(contents, filePath).not.toMatch(/from ["']firebase\/storage["']/);
    }
  });

  it("pins every API route to the nodejs runtime", async () => {
    const routeFiles = (await getFiles(path.join(process.cwd(), "app", "api")))
      .filter((filePath) => filePath.endsWith(`${path.sep}route.ts`));

    for (const filePath of routeFiles) {
      const contents = await readFile(filePath, "utf8");
      expect(contents, filePath).toMatch(/export const runtime = "nodejs";/);
    }
  });

  it("removes the legacy server-side Firebase helper files", async () => {
    await expect(
      access(path.join(process.cwd(), "lib", "server", "firebase-client.ts"))
    ).rejects.toThrow();
    await expect(
      access(path.join(process.cwd(), "lib", "server", "firebase-admin.ts"))
    ).rejects.toThrow();
  });
});
