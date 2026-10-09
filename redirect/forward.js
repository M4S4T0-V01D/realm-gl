// The old WebGL address of the Realm forwards to the one Realm, in WebGL mode: the game itself (with its rendering mode
// chosen by ?renderer=webgl, and any invitation or other parameter kept), or its preview pages. Same origin, so saves,
// settings and cloud sign-ins are already the same.
(() => {
  const MAIN = "https://m4s4t0-v01d.github.io/rarefriends-realm/";
  const here = new URL(window.location.href), rest = here.pathname.replace(/^\/realm-gl\/?/, "");
  let target;
  if (rest.startsWith("preview")) target = new URL(rest, MAIN);
  else { target = new URL(MAIN); here.searchParams.forEach((value, key) => { if (key !== "renderer") target.searchParams.append(key, value); }); target.searchParams.set("renderer", "webgl"); }
  if (rest.startsWith("preview")) here.searchParams.forEach((value, key) => target.searchParams.append(key, value));
  target.hash = here.hash;
  window.location.replace(target.toString());
})();
