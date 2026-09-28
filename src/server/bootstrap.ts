// ============================================================
// BOOTSTRAP — load .env BEFORE other modules are imported
// ------------------------------------------------------------
// Prisma client is created during import (src/lib/prisma.ts). If .env
// is not loaded by then, DATABASE_URL is empty → Prisma defaults to
// localhost:5432 → ALL queries fail (register/login/scheduler).
//
// tsx does NOT automatically load .env, so we load it manually here,
// then dynamically import the main server. Does not override env vars
// that are already set (in Docker/host, env is injected via container).
// ============================================================
import fs from "fs";
import path from "path";

function loadEnvFile(file: string) {
    try {
        const p = path.resolve(process.cwd(), file);
        if (!fs.existsSync(p)) return;
        const content = fs.readFileSync(p, "utf8");
        for (const rawLine of content.split(/\r?\n/)) {
            const line = rawLine.trim();
            if (!line || line.startsWith("#")) continue;
            const eq = line.indexOf("=");
            if (eq === -1) continue;
            const key = line.slice(0, eq).trim();
            if (!key || process.env[key] !== undefined) continue; // do not override env vars already set
            let val = line.slice(eq + 1).trim();
            if (
                (val.startsWith('"') && val.endsWith('"')) ||
                (val.startsWith("'") && val.endsWith("'"))
            ) {
                val = val.slice(1, -1);
            }
            process.env[key] = val;
        }
    } catch {
        /* ignore */
    }
}

// .env.local overrides .env (load more specific first
// because loadEnvFile does not override keys already set).
loadEnvFile(".env.local");
loadEnvFile(".env");

// Now import the main server — Prisma etc. will read the correct DATABASE_URL.
// WITHOUT top-level await (root is not "type: module" → tsx transpiles to CJS).
import("./index.js").catch((e) => {
    console.error("Failed to start server:", e);
    process.exit(1);
});
