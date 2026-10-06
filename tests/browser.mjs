// End-to-end check of RareFriends Realm in its custom runtime page (host/runtime.tsx) with the SDK's mock wallet fixture:
// a wallet holding two Friends (#7730 plays, #3412 follows). Title screen, real mouse and keyboard play, right-click menus,
// dialogue, bank, world map, Rare Caskets through the runtime's confirmations, the adventurer card, per-wallet save and
// restore, and a screenshot tour of every region (./artifacts). Automated test only: public builds always use the real
// wallet and ownership gate.
import assert from "node:assert/strict";
import { FLOOR_Y, H, mainlandToWorld } from "../games/rarefriends-realm/world.ts";
// Page-side functions below are serialized into the frame, so they carry these as literals: storeys start at row 580 (FLOOR_Y) and the castle's ground floor lies west of column 765 (mainland 140).
if (FLOOR_Y !== 580 || mainlandToWorld(140, 0)[0] !== 765) throw new Error("world constants changed: update the literals in browser.mjs");
if (H !== 640) throw new Error("world height changed: update the 640 in browser.mjs");
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { decodeFunctionData, encodeEventTopics, encodeFunctionResult, padHex, parseAbi, zeroAddress } from "viem";
import { createGameServer } from "@rarefriends/friendsdk/serve";
import { FAMILIES_REGISTRY_ABI, GENERATION_SPRITE_MANIFEST } from "@rarefriends/friendsdk/sprites";
import { installFixture, OWNER } from "../node_modules/@rarefriends/friendsdk/scripts/browser-fixture.mjs";
import { REGULAR_SPRITES } from "../games/rarefriends-realm/regulars.ts";

const COLLECTION = "0x14C49e6118F46525dE9ab41a51cBAA3c6EBF181D";
const ABI = parseAbi([
  "event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)",
  "function balanceOf(address account) view returns (uint256)",
  "function ownerOf(uint256 tokenId) view returns (address)",
]);
const art = new Map(REGULAR_SPRITES.map(sprites => [sprites.tokenId, sprites]));
const artworkCall = call => {
  assert.equal(call.to.toLowerCase(), GENERATION_SPRITE_MANIFEST.registry.toLowerCase());
  const { functionName, args } = decodeFunctionData({ abi: FAMILIES_REGISTRY_ABI, data: call.data });
  let result;
  if (functionName === "familyOf") result = art.get(args[0]).familyId;
  else if (functionName === "seedOf") result = art.get(args[0]).seed;
  else if (functionName === "frames") result = [...art.values()].find(item => item.familyId === args[0] && item.seed === args[1]).frames;
  else throw new Error(`Unexpected artwork read ${functionName}`);
  return encodeFunctionResult({ abi: FAMILIES_REGISTRY_ABI, functionName, result });
};
const log = tokenId => ({ address: COLLECTION, blockNumber: `0x${(GENERATION_SPRITE_MANIFEST.transferStartBlock + 1n).toString(16)}`, blockHash: padHex("0x10", { size: 32 }), data: "0x", logIndex: `0x${tokenId.toString(16)}`,
  transactionHash: padHex(`0x${tokenId.toString(16)}`, { size: 32 }), transactionIndex: "0x0", removed: false,
  topics: encodeEventTopics({ abi: ABI, eventName: "Transfer", args: { from: zeroAddress, to: OWNER, tokenId } }) });

const outdir = await mkdtemp(join(tmpdir(), "realm-host-"));
await mkdir("./artifacts", { recursive: true });
let browser, server;
const errors = [];
try {
  execFileSync("node", ["scripts/build.mjs", "--outdir", join(outdir, "dist")], { stdio: "inherit" });
  server = createGameServer(join(outdir, "dist"));
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1320, height: 900 } });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.on("pageerror", error => errors.push(error.message));
  const fixture = await installFixture(page, origin, { artworkCall });
  await page.addInitScript(() => {
    if (window !== window.top) return;
    window.__shared = { opened: [], copied: [] };
    window.open = url => { window.__shared.opened.push(String(url)); return null; };
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write: async items => { window.__shared.copied.push(items.flatMap(item => item.types)); }, writeText: async text => { window.__shared.text = text; } } });
  });
  // The same wallet also holds #3412: extend the fixture's owner-filtered discovery reads.
  await page.route("https://rpc.mainnet.chain.robinhood.com/**", async route => {
    const request = route.request().method() === "POST" ? route.request().postDataJSON() : null;
    const reply = result => route.fulfill({ json: { jsonrpc: "2.0", id: request.id, result }, headers: { "access-control-allow-origin": "*" } });
    if (request?.method === "eth_getLogs" && request.params[0].topics?.[2]?.toLowerCase() === padHex(OWNER, { size: 32 })) return reply([log(7730n), log(3412n)]);
    if (request?.method === "eth_call" && request.params[0].to.toLowerCase() === COLLECTION.toLowerCase()) {
      let decoded = null;
      try { decoded = decodeFunctionData({ abi: ABI, data: request.params[0].data }); } catch { return route.fallback(); }
      const { functionName, args } = decoded;
      if (functionName === "balanceOf") return reply(encodeFunctionResult({ abi: ABI, functionName, result: 2n }));
      if (functionName === "ownerOf" && args[0] === 3412n) return reply(encodeFunctionResult({ abi: ABI, functionName, result: OWNER }));
    }
    return route.fallback();
  });
  const game = page.frameLocator("iframe"), realm = game.locator(".realm-game");
  const frame = () => page.frames().find(entry => entry !== page.mainFrame() && entry.url() !== "about:blank");
  const shot = name => page.locator(".rf-game-frame").screenshot({ path: `./artifacts/${name}.png` });
  const state = fn => frame().evaluate(fn);
  const until = async (fn, timeout = 30_000) => { const end = Date.now() + timeout; while (Date.now() < end) { if (await state(fn)) return; await page.waitForTimeout(150); } assert.fail(`Timed out waiting for ${fn}`); };
  /** Wait until the camera stops moving (it eases after you, and slow software rendering takes longer). */
  const settle = async () => { for (let last = "", end = Date.now() + 10_000; Date.now() < end;) { await page.waitForTimeout(250); const now = await state(() => { const c = window.__realm.camera(); return `${c.x.toFixed(3)},${c.y.toFixed(3)},${c.angle.toFixed(3)}`; }); if (now === last) return; last = now; } };
  const teleport = async (x, y) => { await frame().evaluate(([x, y]) => { const g = window.__realm.game(), p = g.player; p.x = x; p.y = y; p.prev = { x, y }; p.path = []; p.target = null; p.activity = null; p.combat = null; window.__realm.refresh(); }, [x, y]); await page.waitForTimeout(900);
    await settle(); };
  /** Page coordinates of a world tile (the hook reports frame coordinates; add the iframe's offset). */
  const screenOf = async (x, y) => {
    const inner = await frame().evaluate(([x, y]) => window.__realm.screenOf(x, y), [x, y]), box = await page.locator("iframe").boundingBox();
    return { x: box.x + inner.x, y: box.y + inner.y };
  };
  /** Mainland places named in the mainland's own coordinates (the world puts the mainland at MAINLAND.x/y). */
  const teleportM = (mx, my) => teleport(...mainlandToWorld(mx, my));
  const enter = async () => {
    await page.goto(origin);
    await page.getByRole("button", { name: /^Connect (wallet|Browser wallet)$/ }).click();
    await page.getByRole("button", { name: /^Friend #7730\b/ }).click();
    await game.locator('.realm-game[data-phase="title"]').waitFor();
  };

  // ---------- Title screen ----------
  await enter();
  await game.locator('.realm-game[data-hosted="linked"]').waitFor();
  await game.getByRole("heading", { name: "Friend #7730" }).waitFor();
  await page.waitForTimeout(2500);
  await shot("title");
  await game.getByRole("button", { name: "Begin your adventure" }).click();
  // A new Friend is asked for a name first: the token id stays, the name is the player's.
  await game.getByRole("dialog", { name: "Your Friend has arrived" }).waitFor();
  await game.getByLabel("Name").fill("Tester");
  await game.getByRole("button", { name: "Name my Friend" }).click();
  assert.equal(await state(() => window.__realm.game().player.name), "Tester");
  await game.locator('.realm-game[data-phase="playing"]').waitFor();
  await page.waitForTimeout(1200);
  await shot("town");

  // ---------- Real mouse play: left-click a tree to chop it ----------
  const tree = await state(() => { const g = window.__realm.game(), p = g.player; return g.world.objects.filter(o => o.kind === "tree" && o.tree === "tree").sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]; });
  // Stand a few tiles away so the tree is in open view (not under the chat box), then walk there by clicking it.
  await teleport(tree.x - 3, tree.y - 3);
  let point = await screenOf(tree.x, tree.y);
  await page.mouse.move(point.x, point.y - 6);
  await game.locator(".realm-hover").filter({ hasText: /^Chop down Tree/ }).waitFor();
  await page.mouse.click(point.x, point.y - 6);
  await until(() => window.__realm.game().player.activity?.kind === "woodcut", 20_000);
  await page.waitForTimeout(1500);
  await shot("woodcutting");
  await until(() => window.__realm.game().player.inventory.some(slot => slot?.id === "logs"), 40_000);
  // First steps: the guide card moved on from "Chop a tree" by itself.
  await game.getByRole("complementary", { name: "First steps" }).getByRole("heading", { name: "Light a fire" }).waitFor();
  assert.equal(await state(() => window.__realm.game().player.guide), 1);

  // ---------- Right-click menu and dialogue with the Realm Guide ----------
  const guide = await state(() => window.__realm.game().npcs.find(npc => npc.id === "guide"));
  await teleport(guide.x + 1, guide.y + 1);
  point = await screenOf(guide.x, guide.y);
  await page.mouse.click(point.x, point.y - 20, { button: "right" });
  await game.getByRole("menu").waitFor();
  await game.getByRole("menuitem", { name: /Examine Realm Guide/ }).waitFor();
  await shot("menu");
  await game.getByRole("menuitem", { name: /Talk-to Realm Guide/ }).click();
  await game.getByText(/Welcome to the Realm, Hoverer/).waitFor();
  await shot("dialogue");
  await page.keyboard.press("Space");
  await game.getByRole("button", { name: /How do I play\?/ }).click();
  await game.getByText(/Left-click does the first option/).waitFor();
  for (let i = 0; i < 6; i++) await page.keyboard.press("Space");
  assert.equal(await state(() => window.__realm.game().dialogue), null, "dialogue ends");

  // ---------- Keyboard: WASD walks ----------
  const before = await state(() => ({ x: window.__realm.game().player.x, y: window.__realm.game().player.y }));
  await page.locator("iframe").focus();
  await game.locator("canvas.realm-view").focus();
  await page.keyboard.down("s"); await page.waitForTimeout(1500); await page.keyboard.up("s");
  const after = await state(() => ({ x: window.__realm.game().player.x, y: window.__realm.game().player.y }));
  assert(after.x + after.y >= before.x + before.y + 2, `S walks down-screen (toward the camera), sliding around obstacles (${JSON.stringify(before)} → ${JSON.stringify(after)})`);

  // ---------- Chat: Enter, type, Enter; the line shows in the log and over your head ----------
  await game.locator("canvas.realm-view").focus();
  await page.keyboard.press("Enter"); await page.keyboard.type("hello realm"); await page.keyboard.press("Enter");
  await game.getByText(/Tester \(7730\): hello realm/).waitFor();
  assert.equal(await game.getByRole("textbox", { name: "Say something" }).inputValue(), "", "the chat line clears after sending");
  await shot("chat");

  // ---------- Dragging items round the pack with the mouse (pointer events, so Chrome never gets stuck in a drag) ----------
  {
    const slots = game.locator(".realm-inventory.pack .realm-slot"), before = await state(() => window.__realm.game().player.inventory.slice(0, 5).map(slot => slot?.id ?? null));
    const a = await slots.nth(0).boundingBox(), b = await slots.nth(4).boundingBox();
    await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2); await page.mouse.down();
    await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 10 }); await page.mouse.up();
    const after = await state(() => window.__realm.game().player.inventory.slice(0, 5).map(slot => slot?.id ?? null));
    assert.deepEqual([after[0], after[4]], [before[4], before[0]], "dragging swaps two slots");
    // The game still takes clicks afterwards.
    const canvas = await game.locator("canvas.realm-view").boundingBox(), from = await state(() => ({ x: window.__realm.game().player.x, y: window.__realm.game().player.y }));
    await page.mouse.click(canvas.x + canvas.width * 0.3, canvas.y + canvas.height * 0.62); await page.waitForTimeout(1500);
    const to = await state(() => ({ x: window.__realm.game().player.x, y: window.__realm.game().player.y }));
    assert(to.x !== from.x || to.y !== from.y, "a click on the world after a drag still walks");
  }

  // ---------- Camera: arrow keys turn and tilt, the scroll wheel drags it round, the compass faces north ----------
  // Held keys turn at a steady speed per frame: hold them until they've turned (slow software rendering takes longer).
  const hold = async (key, done) => { await page.keyboard.down(key); const end = Date.now() + 6000; do await page.waitForTimeout(100); while (Date.now() < end && !(await state(done))); await page.keyboard.up(key); };
  await hold("ArrowRight", () => window.__realm.camera().angle > 0.7);
  await hold("ArrowUp", () => window.__realm.camera().pitch > 0.6);
  const turned = await state(() => window.__realm.camera());
  assert(turned.angle > 0.6, `→ turns the camera (${turned.angle})`); assert(turned.pitch > 0.55, `↑ tilts it (${turned.pitch})`);
  await shot("camera-turned");
  const view = await page.locator("iframe").boundingBox();
  await page.mouse.move(view.x + view.width * 0.4, view.y + view.height * 0.35);
  await page.mouse.down({ button: "middle" }); await page.mouse.move(view.x + view.width * 0.55, view.y + view.height * 0.35, { steps: 8 }); await page.mouse.up({ button: "middle" });
  assert((await state(() => window.__realm.camera().angle)) > turned.angle + 0.3, "middle-drag turns the camera");
  // Walking with S still goes down the screen at this angle.
  const turnedStart = await state(() => ({ ...window.__realm.game().player }));
  await page.keyboard.down("s"); await page.waitForTimeout(1300); await page.keyboard.up("s");
  const turnedEnd = await state(() => ({ ...window.__realm.game().player }));
  const screenStart = await screenOf(turnedStart.x, turnedStart.y), screenEnd = await screenOf(turnedEnd.x, turnedEnd.y);
  assert(screenEnd.y > screenStart.y + 10, "S walks down the screen whatever the camera angle");
  await game.getByRole("button", { name: "Compass: face north" }).click();
  await settle();
  const here = await state(() => ({ x: window.__realm.game().player.x, y: window.__realm.game().player.y }));
  const centre = await screenOf(here.x, here.y), northward = await screenOf(here.x, here.y - 3);
  assert(Math.abs(northward.x - centre.x) < 3 && northward.y < centre.y - 20, `the compass turns north to the top of the screen (${northward.x - centre.x}, ${northward.y - centre.y})`);
  assert(Math.abs((await state(() => window.__realm.camera().pitch)) - turned.pitch) < 0.01, "…and leaves the tilt alone");
  await state(() => window.__realm.view(0.8, 0.5, 0));

  // ---------- Panels ----------
  await state(() => { const g = window.__realm.game(), p = g.player, table = [0, 0, 83, 174, 276, 388, 512, 650, 801, 969, 1154, 1358, 1584, 1833, 2107, 2411, 2746, 3115, 3523, 3973, 4470, 5018, 5624, 6291, 7028, 7842, 8740, 9730, 10824, 12031, 13363];
    Object.assign(p.xp, { attack: table[24], strength: table[26], defence: table[21], hitpoints: table[25], woodcutting: table[18], fishing: table[22], mining: table[16], smithing: table[12], cooking: table[20], firemaking: table[15], magic: table[13], prayer: table[9], crafting: table[7], thieving: table[11], agility: table[10] });
    p.hp = 25; p.equipment.weapon = "ashsteel_sabre"; p.equipment.head = "blackiron_helm"; p.equipment.body = "blackiron_cuirass"; p.equipment.shield = "blackiron_shield"; p.equipment.cape = "team_cape";
    p.wardrobe.push("rose_cape"); p.worn.push("rose_cape"); p.quests.friends_feast = 2; p.quests.grumblin_trouble = 1; p.questData.grumblins = 4;
    for (const [id, n] of [["inkcrab", 1], ["inkcrab", 1], ["inkcrab", 1], ["sailfish", 1], ["breeze_sigil", 120], ["thought_sigil", 80], ["oak_logs", 1], ["blackiron_ore", 1], ["rough_moonstone", 1]]) { const i = p.inventory.indexOf(null); if (i >= 0) p.inventory[i] = { id, n }; }
    window.__realm.refresh(); });
  await game.getByRole("tab", { name: "Skills" }).click(); await page.waitForTimeout(300); await shot("skills");
  // The skill guide (click a skill) and the recipe book.
  await game.getByRole("button", { name: /^Woodcutting XP/ }).click();
  await game.getByRole("dialog", { name: "Woodcutting guide" }).waitFor();
  await game.getByText("Yew tree").waitFor();
  await page.waitForTimeout(300); await shot("skill-guide");
  await game.getByRole("tab", { name: "Recipe book" }).click();
  await game.getByRole("dialog", { name: "Recipe book" }).waitFor();
  await game.getByRole("searchbox", { name: "Search recipes" }).fill("arrow");
  await page.waitForTimeout(300); await shot("recipe-book");
  await game.getByRole("button", { name: "Close" }).click();
  await game.getByRole("tab", { name: "Quest journal" }).click(); await game.getByRole("button", { name: "Grumblin Trouble" }).click(); await game.getByText(/Grumblins defeated: 4\/6/).waitFor(); await shot("quests");
  await game.getByRole("tab", { name: "Worn equipment" }).click(); await shot("equipment");
  await game.getByRole("tab", { name: "Friends and wardrobe" }).click();
  await game.getByRole("button", { name: /#3412/ }).click();
  assert.equal(await state(() => window.__realm.game().player.follower), 3412, "an owned Friend follows");
  await game.getByRole("tab", { name: "Inventory" }).click();

  await game.getByRole("tab", { name: "Faith" }).click(); await shot("prayer");
  await game.getByRole("tab", { name: "Magic" }).click(); await shot("magic");
  await game.getByRole("tab", { name: "Friends and wardrobe" }).click(); await shot("friends");
  await game.getByRole("tab", { name: "Settings" }).click();
  await game.getByRole("button", { name: "Hollow Square" }).waitFor();
  assert.equal(await game.getByRole("button", { name: "Hollow Square" }).isEnabled(), true, "Friendhollow's track unlocked on arrival");
  await shot("music");
  await game.getByRole("tab", { name: "Inventory" }).click();

  // ---------- A level-up: one more log takes Woodcutting to 19 ----------
  await state(() => { const p = window.__realm.game().player; p.xp.woodcutting = 3972; window.__realm.refresh(); });
  const oak = await state(() => { const g = window.__realm.game(), p = g.player; return g.world.objects.filter(o => o.kind === "tree" && o.tree === "tree" && !g.depleted.has(o.id)).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]; });
  await teleport(oak.x - 2, oak.y - 2);
  point = await screenOf(oak.x, oak.y);
  await page.mouse.click(point.x, point.y - 6);
  await game.getByText(/Congratulations, you just advanced a Woodcutting level/).waitFor({ timeout: 60_000 });
  await shot("level-up");
  await page.keyboard.press("Space");

  // ---------- Smelting at the Emberforge furnace ----------
  const furnace = await state(() => window.__realm.game().world.objects.find(o => o.kind === "furnace"));
  await state(() => { const p = window.__realm.game().player; p.inventory = p.inventory.map(() => null); p.inventory[0] = { id: "hammer", n: 1 }; for (let i = 1; i < 9; i++) p.inventory[i] = { id: i % 2 ? "pewter_ore" : "pewter_ore", n: 1 }; window.__realm.refresh(); });
  await teleport(furnace.x, furnace.y + 1);
  point = await screenOf(furnace.x, furnace.y);
  await page.mouse.click(point.x, point.y - 16);
  await game.getByRole("region", { name: "What would you like to smelt?" }).waitFor();
  await shot("smelting");
  await game.getByRole("button", { name: /Pewter bar/ }).click();
  await until(() => window.__realm.game().player.inventory.filter(slot => slot?.id === "pewter_bar").length >= 2, 30_000);

  // ---------- A shop ----------
  const shopkeeper = await state(() => window.__realm.game().npcs.find(npc => npc.id === "armsmaster"));
  await teleport(shopkeeper.x, shopkeeper.y + 1);
  point = await screenOf(shopkeeper.x, shopkeeper.y);
  await page.mouse.click(point.x, point.y - 18, { button: "right" });
  await game.getByRole("menuitem", { name: /Trade Armsmaster Vey/ }).click();
  await game.getByRole("dialog", { name: "Emberforge Arms" }).waitFor();
  await shot("shop");
  await game.getByRole("button", { name: "Close" }).click();

  // ---------- Finishing A Friend's Feast ----------
  const cook = await state(() => window.__realm.game().npcs.find(npc => npc.id === "cook"));
  await state(() => { const p = window.__realm.game().player; p.quests.friends_feast = 1; for (const id of ["egg", "pot_of_flour", "bucket_of_milk"]) p.inventory[p.inventory.indexOf(null)] = { id, n: 1 }; window.__realm.refresh(); });
  await teleport(cook.x + 1, cook.y);
  // She wanders: find her again and right-click her where she stands now (a second try if she stepped away).
  for (let attempt = 0; ; attempt++) {
    const now = await state(() => window.__realm.game().npcs.find(npc => npc.id === "cook"));
    point = await screenOf(now.x, now.y);
    await page.mouse.click(point.x, point.y - 18, { button: "right" });
    const talk = game.getByRole("menuitem", { name: /Talk-to Cook Mabel/ });
    if (await talk.isVisible({ timeout: 1500 }).catch(() => false) || attempt >= 3) { await talk.click(); break; }
    await page.keyboard.press("Escape"); await page.waitForTimeout(700);
  }
  await game.getByText(/I have everything!/).waitFor();
  for (let i = 0; i < 3 && !(await game.getByRole("dialog", { name: "Quest complete!" }).isVisible()); i++) { await page.keyboard.press("Space"); await page.waitForTimeout(700); }
  await game.getByRole("dialog", { name: "Quest complete!" }).waitFor();
  await game.getByRole("heading", { name: "A Friend's Feast" }).waitFor();
  await shot("quest-complete");
  await game.getByRole("button", { name: "Continue", exact: true }).click();
  assert.equal(await state(() => window.__realm.game().player.quests.friends_feast), 2);

  // ---------- Combat in Whisperwood (real click) ----------
  const grumblin = await state(() => { const g = window.__realm.game(); return g.monsters.find(m => m.def.id === "grumblin" && !m.dead); });
  await teleport(grumblin.x + 2, grumblin.y + 1);
  // Grumblins wander, so aim at the nearest one and retry if it stepped away before the click.
  for (let attempt = 0; ; attempt++) {
    const target = await state(() => { const g = window.__realm.game(), p = g.player; return g.monsters.filter(m => m.def.id === "grumblin" && !m.dead).sort((a, b) => Math.hypot(a.x - p.x, a.y - p.y) - Math.hypot(b.x - p.x, b.y - p.y))[0]; });
    point = await screenOf(target.x, target.y);
    await page.mouse.click(point.x, point.y - 16, { button: "right" });
    const attack = game.getByRole("menuitem", { name: /Attack Grumblin/ }).first();
    if (await attack.isVisible()) { await attack.click(); break; }
    await page.keyboard.press("Escape"); await page.mouse.move(10, 10);
    assert(attempt < 5, "could not target a Grumblin");
    await page.waitForTimeout(400);
  }
  await until(() => window.__realm.game().player.combat !== null || window.__realm.game().player.target !== null, 10_000);
  await page.waitForTimeout(2600);
  await shot("combat");
  await until(() => window.__realm.game().player.kills > 0, 60_000);
  await page.waitForTimeout(600); await shot("loot");

  // ---------- Bank ----------
  const booth = await state(() => window.__realm.game().world.objects.find(o => o.kind === "bank"));
  await teleport(booth.x, booth.y + 1);
  point = await screenOf(booth.x, booth.y);
  await page.mouse.click(point.x, point.y - 12);
  await game.getByRole("dialog", { name: "Bank of the Realm" }).waitFor();
  await game.getByRole("button", { name: "Deposit inventory" }).click();
  assert.equal(await state(() => window.__realm.game().player.inventory.filter(Boolean).length), 0, "inventory deposited");
  await game.getByRole("button", { name: /^Withdraw Pewter bar/ }).click();
  await shot("bank");
  await page.keyboard.press("Escape");
  await game.getByRole("button", { name: "Close" }).click().catch(() => {});

  // ---------- World map ----------
  await game.locator("canvas.realm-view").focus();
  await page.keyboard.press("m");
  await game.getByRole("dialog", { name: "World map of the Realm" }).waitFor();
  await page.waitForTimeout(300); await shot("worldmap");
  await game.getByRole("button", { name: "Close" }).click();

  // ---------- Rare Caskets (simulated RF, with the runtime's confirmations) ----------
  await game.getByRole("tab", { name: "Friends and wardrobe" }).click();
  await game.getByRole("button", { name: "Rare Caskets (simulated RF)" }).click();
  await game.getByRole("dialog", { name: "Rare Caskets" }).waitFor();
  await game.getByRole("button", { name: /^Buy 5/ }).click();
  await page.getByRole("button", { name: "Confirm preview", exact: true }).click();
  await game.getByRole("button", { name: /^Open 5 caskets/ }).waitFor();
  await game.getByRole("button", { name: /^Open 5 caskets/ }).click();
  await page.getByRole("button", { name: "Confirm preview", exact: true }).click();
  await game.locator(".realm-reveal > div").nth(4).waitFor();
  await page.waitForTimeout(500);
  await shot("caskets");
  assert((await state(() => window.__realm.game().player.wardrobe.length)) >= 2, "caskets add wardrobe pieces");
  await game.getByRole("button", { name: "Close" }).click();

  // ---------- The Rare Market: a trader in Friendhollow, a bundle bought through the runtime's confirmation ----------
  const trader = await state(() => window.__realm.game().npcs.find(npc => npc.id === "rare_trader"));
  await teleport(trader.x, trader.y + 2);
  const traderAt = await screenOf(trader.x, trader.y);
  await page.mouse.click(traderAt.x, traderAt.y - 18, { button: "right" });
  await game.getByRole("menuitem", { name: /Rare-market Rare trader/ }).click();
  await game.getByRole("dialog", { name: "Rare Market" }).waitFor();
  await page.waitForTimeout(300); await shot("rare-market");
  await game.locator(".realm-market li").first().getByRole("button", { name: /^Buy/ }).click();
  await page.getByRole("button", { name: "Confirm preview", exact: true }).click();
  await until(() => window.__realm.game().player.inventory.some(slot => slot?.id === "tablet_oasis"), 15_000);
  await game.getByRole("button", { name: "Close" }).click();

  // ---------- Adventurer card: Post to X through the host ----------
  await game.getByRole("tab", { name: "Worn equipment" }).click();
  await game.getByRole("button", { name: /Adventurer card/ }).click();
  await game.getByRole("img", { name: /Adventurer card: Friend #7730/ }).waitFor();
  await game.getByRole("button", { name: "Post to X", exact: true }).click();
  await game.getByText(/Picture copied and X opened/).waitFor();
  const shared = await page.evaluate(() => window.__shared);
  const text = new URL(shared.opened[0]).searchParams.get("text");
  for (const tag of ["@RareFriendsNFT", "#RareFriends", "#RareFriendsRealm", "#7730"]) assert.ok(text.includes(tag), `post text includes ${tag}`);
  assert(text.length <= 280);
  await shot("card");
  const card = await game.getByRole("img", { name: /Adventurer card/ }).evaluate(image => {
    const canvas = document.createElement("canvas"); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
    canvas.getContext("2d").drawImage(image, 0, 0); return { width: image.naturalWidth, height: image.naturalHeight, data: canvas.toDataURL("image/png").split(",")[1] };
  });
  assert.deepEqual([card.width, card.height], [1200, 675]);
  (await import("node:fs")).writeFileSync("./artifacts/adventurer-card.png", Buffer.from(card.data, "base64"));
  await game.getByRole("button", { name: "Close" }).click();

  // ---------- Feedback: the button on the minimap ring opens a GitHub issue and an X post, through the host ----------
  await page.evaluate(() => { window.__shared.opened = []; });
  await game.getByRole("button", { name: "Send feedback" }).first().click();
  await game.getByRole("radio", { name: "Bug" }).click();
  await game.getByRole("textbox", { name: "Your feedback" }).fill("The fishing spot by the bridge won't let me fish.");
  await game.getByRole("button", { name: "Send to GitHub and X" }).click();
  await page.waitForFunction(() => window.__shared.opened.length >= 2);
  const [issueUrl, postUrl] = await page.evaluate(() => window.__shared.opened);
  const issue = new URL(issueUrl), post = new URL(postUrl).searchParams.get("text");
  assert.equal(issue.origin + issue.pathname, "https://github.com/M4S4T0-V01D/rarefriends-realm/issues/new");
  assert.match(issue.searchParams.get("title"), /^\[Bug\] The fishing spot/); assert.match(issue.searchParams.get("body"), /Friend: #7730/); assert.equal(issue.searchParams.get("labels"), "player-feedback");
  for (const tag of ["@M4S4T0_V01D", "@RareFriendsNFT", "#RareFriends", "#RareFriendsRealm"]) assert.ok(post.includes(tag), `feedback post tags ${tag}`);
  await game.getByRole("button", { name: "Close" }).click();

  // ---------- Performance: frame cost at busy scenes, High against Low (Settings → Graphics) ----------
  {
    const rows = [];
    for (const [name, at, view] of [["Friendhollow (castle and Market Street)", [121, 124], [0.8, 0.4, 0.3]], ["Whisperwood (dense forest)", [76, 88], [0.7, 0.3, 0.6]], ["Stormy night in town", [121, 124], [0.9, 0.42, -0.3]]]) {
      await teleportM(...at);
      const row = { name };
      for (const level of ["high", "low"]) {
        await frame().evaluate(level => window.__realm.graphics(level), level); await page.waitForTimeout(150);
        await frame().evaluate(([name, view]) => { window.__realm.view(...view); if (name.startsWith("Stormy")) { window.__realm.time(0.02); window.__realm.weather({ rain: 1, storm: true, fog: 0.3 }); } else { window.__realm.time(0.5); window.__realm.weather({ rain: 0, storm: false, fog: 0 }); } }, [name, view]);
        await page.waitForTimeout(3000);
        row[level] = (await frame().evaluate(() => window.__realm.perf())).ms;
      }
      rows.push(row);
    }
    await frame().evaluate(() => { window.__realm.graphics("high"); window.__realm.time(0.5); window.__realm.weather({ rain: 0, storm: false, fog: 0 }); });
    console.log("Frame cost (ms to draw a frame, headless software rendering):\n" + rows.map(row => `  ${row.name}: High ${row.high.toFixed(1)} · Low ${row.low.toFixed(1)}`).join("\n"));
    // With WebGL, High's extras (every sprite's shadow, the haze, finer light) cost the GPU almost nothing, so Low only
    // has to be no dearer than High; on the canvas renderer it has to be clearly cheaper.
    const webgl = await frame().evaluate(() => (window.__realm.perf().parts.gl_sprites ?? 0) > 0);
    for (const row of rows) {
      if (webgl) assert.ok(row.low < row.high * 1.15, `${row.name}: Low is no dearer than High`);
      else assert.ok(row.low < row.high * 0.75, `${row.name}: Low is clearly cheaper than High`);
      // Headless software rendering on a shared CI runner measures slower than a desktop (about 16 ms where this machine sees 12); 20 still catches a real regression.
      assert.ok(row.low < 20, `${row.name}: Low draws inside a 50 fps budget even without a GPU (${row.low.toFixed(1)} ms)`);
    }
    await state(() => { const tab = document.querySelector('.realm-tabs [aria-label="Settings"]'); if (tab?.getAttribute("aria-selected") !== "true" || !document.querySelector(".realm-tab-body")) tab?.click(); });
    await game.getByRole("radio", { name: "Low" }).click();
    assert.equal(await state(() => window.__realm.perf().low), true, "Settings → Graphics → Low");
    await game.getByRole("radio", { name: "High" }).click();
    assert.equal(await state(() => window.__realm.perf().low), false, "Settings → Graphics → High");
  }

  // ---------- The daily popup: claim the streak, see the challenges, read the update log ----------
  await game.getByRole("button", { name: /Daily streak and updates/ }).click();
  await game.getByRole("dialog", { name: "The Realm Daily" }).waitFor();
  const coinsBefore = await state(() => window.__realm.game().player.inventory.reduce((n, slot) => n + (slot?.id === "coins" ? slot.n : 0), 0));
  await game.getByRole("button", { name: /^Claim day 1/ }).click();
  await game.getByText(/Day 1 streak|Day 1 of your streak/).first().waitFor();
  assert.equal(await state(() => window.__realm.game().player.daily.streak), 1);
  assert.equal(await state(() => window.__realm.game().player.inventory.reduce((n, slot) => n + (slot?.id === "coins" ? slot.n : 0), 0)), coinsBefore + 500, "day 1 pays 500 coins");
  assert.equal(await game.locator(".realm-challenges li").count(), 4, "three challenges and the chest");
  await shot("daily");
  await game.getByRole("tab", { name: /Updates/ }).click();
  await game.getByText("Daily streaks and this log").waitFor();
  await shot("updates");
  await page.keyboard.press("Escape");
  await game.getByRole("dialog", { name: "The Realm Daily" }).waitFor({ state: "detached" });

  // ---------- Save and log out: back to the title screen, saved; then continue ----------
  await game.getByRole("button", { name: "Save and log out", exact: true }).click();
  await game.getByText("Saved and logged out.").waitFor();
  await shot("logged-out");
  await game.getByRole("button", { name: "Continue your adventure" }).click();
  await game.locator('.realm-game[data-phase="playing"]').waitFor();

  // ---------- Friendhollow Castle: real clicks up the spiral stairs to the King's floor and the roof ----------
  const levelNow = () => state(() => { const g = window.__realm.game(), p = g.player; return g.world.floors.find(f => p.y >= 580 && p.x >= f.x0 + f.dx && p.x <= f.x1 + f.dx && p.y >= f.y0 + f.dy && p.y <= f.y1 + f.dy)?.level ?? 0; });
  /** Stand beside a staircase on a storey, then click it (its first option climbs). */
  const clickStairs = async (level, action) => {
    const { stairs, stand } = await frame().evaluate(([level, action]) => {
      const g = window.__realm.game(), w = g.world, storey = o => w.floors.find(f => o.x >= f.x0 + f.dx && o.x <= f.x1 + f.dx && o.y >= f.y0 + f.dy && o.y <= f.y1 + f.dy && o.y >= 580)?.level ?? 0;
      const castle = o => storey(o) ? w.floors.some(f => f.complex === "castle" && o.x >= f.x0 + f.dx && o.x <= f.x1 + f.dx && o.y >= f.y0 + f.dy && o.y <= f.y1 + f.dy) : o.x < 765;
      const stairs = w.objects.filter(o => o.look === "stairs" && o.action === action && storey(o) === level && castle(o)).sort((a, b) => b.x - a.x)[0];
      const WW = w.tiles.length / 640, open = (x, y) => { const t = w.tiles[y * WW + x], id = w.objectAt[y * WW + x]; return t !== 0 && t !== 16 && (id < 0 || !w.objects[id].blocks); };
      const [dx, dy] = [[0, 1], [1, 0], [-1, 0], [0, -1]].find(([dx, dy]) => open(stairs.x + dx, stairs.y + dy));
      return { stairs, stand: { x: stairs.x + dx, y: stairs.y + dy } };
    }, [level, action]);
    await teleport(stand.x, stand.y);
    const at = await screenOf(stairs.x, stairs.y);
    await page.mouse.click(at.x, at.y - 12);
  };
  await state(() => document.querySelector(".realm-side-toggle").click()); // tuck the side panels away for the pictures
  await teleportM(121, 110);
  await state(() => window.__realm.view(0.8, 0.5, -Math.PI / 4));
  await page.waitForTimeout(1500); await shot("castle");
  await state(() => window.__realm.view(0.8, 0.5, 0));
  await clickStairs(0, "Climb-up");
  await until(() => window.__realm.game().player.y >= 580, 15_000);
  assert.equal(await levelNow(), 1, "the stairs climb to the King's floor");
  const king = await state(() => window.__realm.game().npcs.find(npc => npc.id === "king"));
  await teleport(king.x + 1, king.y + 3);
  await state(() => window.__realm.view(1.3, 0.42, 0.35));
  await page.waitForTimeout(1500); await shot("castle-throne");
  await state(() => window.__realm.view(0.8, 0.5, 0));
  await clickStairs(1, "Climb-up");
  await until(() => window.__realm.game().player.x >= 767, 15_000); // the roof storey is stored 30 tiles east of the castle (mainland 142 → world 767)
  assert.equal(await levelNow(), 2, "…and on up to the roof");
  await teleportM(151, 253);
  await state(() => window.__realm.view(0.7, 0.24, 0.2));
  await page.waitForTimeout(1500); await shot("castle-roof");
  await state(() => window.__realm.view(0.8, 0.5, 0));
  await state(() => document.querySelector(".realm-side-toggle").click()); // tuck the side panels away for the pictures

  // ---------- Market Street, a mastery cape and a bow, and nightfall ----------
  await state(() => document.querySelector(".realm-side-toggle").click());
  await teleportM(121, 141);
  await state(() => window.__realm.view(1, 0.45, -Math.PI / 4));
  await page.waitForTimeout(1500); await shot("market-street");
  await state(() => { const p = window.__realm.game().player; p.equipment.weapon = "yew_bow"; p.equipment.cape = "ranged_cape_t"; p.heading = { x: 0, y: -1 }; window.__realm.refresh(); });
  await state(() => window.__realm.view(2.4, 0.45, -Math.PI / 4));
  await page.waitForTimeout(1200); await shot("mastery-cape");
  await state(() => { const p = window.__realm.game().player; delete p.equipment.cape; delete p.equipment.weapon; window.__realm.refresh(); });
  await teleportM(121, 124);
  await state(() => { window.__realm.time(0.02); window.__realm.view(0.8, 0.5, 0); });
  await page.waitForTimeout(1500); await shot("night");
  assert.equal(await game.locator(".realm-clock").textContent(), "☾ Night", "the clock shows night");
  await state(() => window.__realm.time(0.5));

  // ---------- The Wizards' Tower, Wyrmreach's dragons, pixel-art buildings ----------
  await teleportM(160, 139); await state(() => window.__realm.view(0.9, 0.45, -Math.PI / 4));
  await page.waitForTimeout(1500); await shot("wizards-tower");
  await state(() => { const p = window.__realm.game().player; p.xp.hitpoints = 13_034_431; p.hp = 99; p.xp.defence = 13_034_431; p.equipment.shield = "wyrmward_shield"; window.__realm.refresh(); });
  await teleportM(29, 21); await state(() => window.__realm.view(1.05, 0.4, 0.3));
  await page.waitForTimeout(1800); await shot("wyrmreach");
  await state(() => { const p = window.__realm.game().player; delete p.equipment.shield; p.hp = 99; for (const m of window.__realm.game().monsters) m.target = false; });
  await teleportM(121, 141); await state(() => window.__realm.view(1.8, 0.45, 0.5));
  await page.waitForTimeout(1500); await shot("buildings");
  await state(() => window.__realm.view(0.8, 0.5, 0));
  await state(() => document.querySelector(".realm-side-toggle").click());

  // ---------- Every item, redrawn; and right-click inside an interface ----------
  await state(() => { const g = window.__realm.game(); g.player.bank = ["rarite_sabre", "glimmer_sword", "moonsilver_cuirass", "ashsteel_helm", "blackiron_shield", "yew_bow", "rarite_arrow", "ashsteel_arrowheads",
    "breeze_staff", "ember_staff", "scholar_hat", "drakehide_vest", "attack_cape_t", "grandmaster_cape", "wyrmward_shield", "rosestone_pendant", "rosestone", "sagestone", "moonstone", "rarite_bar", "glimmer_ore",
    "yew_logs", "maple_logs", "inkshark", "sailfish", "cake", "bread", "drake_bones", "drakehide", "wyrm_heart", "sigil_stone", "hollow_sigil", "star_sigil", "tablet_oasis", "insight_lamp", "coins"]
    .map(id => ({ id, n: id === "coins" ? 125000 : 1 })); g.ui.bank = true; window.__realm.refresh(); });
  await game.getByRole("dialog", { name: "Bank of the Realm" }).waitFor();
  await page.waitForTimeout(400); await shot("items");
  const sabre = await game.getByRole("button", { name: /Withdraw Rarite sabre/ }).boundingBox();
  await page.mouse.click(sabre.x + sabre.width / 2, sabre.y + sabre.height / 2, { button: "right" });
  await game.getByRole("menuitem", { name: /Withdraw-All Rarite sabre/ }).waitFor();
  await page.waitForTimeout(200); await shot("bank-menu");
  await game.getByRole("menuitem", { name: /Examine Rarite sabre/ }).click();
  // Bank tabs: with a divider per tab the list outgrows the grid, which must scroll, not squash the slots.
  await state(() => { const g = window.__realm.game(); g.player.bank.forEach((slot, i) => { if (i % 9) slot.tab = i % 9; else delete slot.tab; }); window.__realm.refresh(); });
  await page.waitForTimeout(300); await shot("bank-tabs");
  const slotSizes = await game.locator(".realm-bank-grid .realm-slot").evaluateAll(slots => slots.map(slot => slot.getBoundingClientRect()).map(box => Math.round(box.height - box.width)));
  assert(slotSizes.length === 36 && slotSizes.every(gap => Math.abs(gap) <= 1), `bank slots stay square with 8 tabs (${slotSizes})`);
  await game.getByRole("button", { name: "Close" }).click();

  // ---------- A tour of the Realm ----------
  await state(() => { const p = window.__realm.game().player; p.xp.hitpoints = 13_034_431; p.hp = 99; p.xp.defence = 13_034_431; window.__realm.game().autoRetaliate = false; });
  const tour = [
    ["farms", 90, 118], ["whisperwood", 50, 97], ["ashen-mine", 112, 54], ["emberforge", 160, 49], ["frostpeak", 196, 22], ["glass-lake", 178, 154],
    ["oasis", 185, 115], ["dunes", 208, 94], ["murkmire", 42, 182], ["mossy-ruins", 121, 181], ["agility", 94, 101], ["crypt", 44, 222], ["depths", 132, 222], ["throne", 190, 224],
  ];
  for (const [name, x, y] of tour) {
    await teleportM(x, y);
    await state(() => { const p = window.__realm.game().player; p.hp = 99; });
    await page.waitForTimeout(1300);
    await shot(`region-${name}`);
  }
  assert.equal(await realm.getAttribute("data-region"), "hollow_depths");

  // ---------- Saved per wallet: reload and continue ----------
  await teleport(561, 123);
  await page.waitForTimeout(6000);
  const key = `rarefriends-realm:save:v1:${OWNER.toLowerCase()}:7730`;
  const saved = JSON.parse(await page.evaluate(name => localStorage.getItem(name), key));
  assert.equal(saved?.v, 1, "the adventure is saved for this wallet and Friend");
  assert.equal(saved.follower, 3412);
  assert(saved.xp.woodcutting > 0);
  await enter();
  await game.getByRole("button", { name: "Continue your adventure" }).waitFor();
  await game.getByText(/Saved adventure: total level/).waitFor();
  await shot("welcome-back");
  await game.getByRole("button", { name: "Continue your adventure" }).click();
  await game.locator('.realm-game[data-phase="playing"]').waitFor();
  assert(Number(await realm.getAttribute("data-total")) > 100, "levels restored");

  // ---------- Save codes, with an older tab still open ----------
  // The older tab's fresh-looking adventure must not overwrite a code restored in the newer one.
  await state(() => { const tab = document.querySelector('.realm-tabs [aria-label="Settings"]'); if (tab?.getAttribute("aria-selected") !== "true" || !document.querySelector(".realm-tab-body")) tab?.click(); });
  await game.getByRole("button", { name: "Copy save code" }).click();
  await page.waitForFunction(() => window.__shared.text?.startsWith("RFR1-"));
  const saveCode = await page.evaluate(() => window.__shared.text);
  const older = await context.newPage();
  older.on("pageerror", error => errors.push(error.message));
  await installFixture(older, origin, { artworkCall });
  await older.goto(origin);
  await older.getByRole("button", { name: /^Connect (wallet|Browser wallet)$/ }).click();
  await older.getByRole("button", { name: /^Friend #7730\b/ }).click();
  await older.frameLocator("iframe").locator('.realm-game[data-hosted="linked"]').waitFor();
  await older.frameLocator("iframe").getByRole("button", { name: /adventure/ }).first().click();
  await game.locator('.realm-game[data-hosted="elsewhere"]').waitFor();
  const olderFrame = older.frames().find(entry => entry !== older.mainFrame() && entry.url() !== "about:blank");
  await olderFrame.evaluate(() => { const g = window.__realm.game(); for (const skill of Object.keys(g.player.xp)) g.player.xp[skill] = skill === "hitpoints" ? 1154 : 0; window.__realm.refresh(); });
  await game.getByLabel("Save code to restore").fill(saveCode);
  await game.getByRole("button", { name: "Restore" }).click();
  await game.getByRole("button", { name: "Yes, restore it" }).click();
  await game.getByText("Restored! Welcome back.").waitFor();
  await game.locator('.realm-game[data-hosted="linked"]').waitFor();
  await older.frameLocator("iframe").locator('.realm-game[data-hosted="elsewhere"]').waitFor();
  await page.waitForTimeout(6000);
  assert(JSON.parse(await page.evaluate(name => localStorage.getItem(name), key)).xp.woodcutting > 0, "the restored code stays saved while the older tab plays on");
  await older.close();

  // ---------- A phone in landscape: tap to walk, long-press for options ----------
  const phone = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const handset = await phone.newPage();
  handset.on("pageerror", error => errors.push(error.message));
  await installFixture(handset, origin, { artworkCall });
  await handset.goto(origin);
  await handset.getByRole("button", { name: /^Connect (wallet|Browser wallet)$/ }).tap();
  await handset.getByRole("button", { name: /^Friend #7730\b/ }).tap();
  const small = handset.frameLocator("iframe");
  await small.getByRole("button", { name: /adventure/ }).tap();
  await small.locator('.realm-game[data-phase="playing"]').waitFor();
  // A new Friend is asked for its name over the game; on the phone we put it off, so taps reach the world.
  const later = small.getByRole("button", { name: /^Later/ });
  if (await later.isVisible({ timeout: 2500 }).catch(() => false)) await later.tap();
  await handset.waitForTimeout(1500);
  await handset.locator(".rf-game-frame").screenshot({ path: "./artifacts/phone.png" });
  const phoneFrame = handset.frames().find(entry => entry !== handset.mainFrame() && entry.url() !== "about:blank");
  const start = await phoneFrame.evaluate(() => { const p = window.__realm.game().player; return p.x + p.y; });
  const box = await handset.locator("iframe").boundingBox();
  await handset.touchscreen.tap(box.x + box.width * 0.45, box.y + box.height * 0.3);
  await handset.waitForTimeout(2500);
  assert.notEqual(await phoneFrame.evaluate(() => { const p = window.__realm.game().player; return p.x + p.y; }), start, "a tap walks on a phone");
  await phone.close();

  assert.deepEqual([...errors, ...fixture.errors], [], "browser errors");
  assert((await page.evaluate(() => window.__friendWalletTest.state.requests)).every(method =>
    ["eth_accounts", "eth_requestAccounts", "eth_chainId", "wallet_switchEthereumChain"].includes(method)), "no signing requests");
  console.log("PASS realm: title, mouse/keyboard play, menus, dialogue, combat, bank, map, caskets, card, followers, region tour, save/restore");
} finally {
  await browser?.close();
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await rm(outdir, { recursive: true, force: true });
}
