// The published preview is transaction-free, as FriendSDK v0.1.4 intends for preview builds: build it and check that
// neither the runtime page nor the game carries live RF transfer, approval, typed-data signing or raw-transaction code.
// The one signature the page can ask for is the cloud-save sign-in (host/cloud.ts): a plain message, checked word for
// word before the wallet sees it (isSignInMessage), never a transaction. The game itself carries no signing at all.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MARKERS = ["eth_sendTransaction", "eth_sendRawTransaction", "eth_signTypedData", "personal_sign", "wallet_sendCalls", "approve(", "transferFrom"];

test("the preview build carries no transaction-capable code", async () => {
  const outdir = join(await mkdtemp(join(tmpdir(), "realm-bundle-")), "dist");
  execFileSync("node", ["scripts/build.mjs", "--outdir", outdir], { stdio: "ignore" });
  for (const file of ["runtime.js", "game.js"]) {
    const code = await readFile(join(outdir, file), "utf8");
    for (const marker of MARKERS) {
      if (file === "runtime.js" && marker === "personal_sign") {
        // Exactly one: the cloud sign-in, guarded by the sign-in message check.
        assert.equal(code.split("personal_sign").length - 1, 1, "runtime.js asks for one kind of signature only");
        assert.ok(code.includes("wants you to sign in with your Ethereum account:") && code.includes("Sign in to RareFriends Realm cloud saves."), "the signature is the guarded cloud sign-in");
        continue;
      }
      assert.ok(!code.includes(marker), `${file} contains ${marker}`);
    }
  }
});
