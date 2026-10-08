// The update log (updates.ts) in every language, gathered from its parts (updates1.ts to updates20.ts, oldest first).
// The DOM translator matches each title and item whole, so every one has a row of its own.
import type { Row } from "./table.ts";
import { UPDATES1 } from "./updates1.ts";
import { UPDATES2 } from "./updates2.ts";
import { UPDATES3 } from "./updates3.ts";
import { UPDATES4 } from "./updates4.ts";
import { UPDATES5 } from "./updates5.ts";
import { UPDATES6 } from "./updates6.ts";
import { UPDATES7 } from "./updates7.ts";
import { UPDATES8 } from "./updates8.ts";
import { UPDATES9 } from "./updates9.ts";
import { UPDATES10 } from "./updates10.ts";
import { UPDATES11 } from "./updates11.ts";
import { UPDATES12 } from "./updates12.ts";
import { UPDATES13 } from "./updates13.ts";
import { UPDATES14 } from "./updates14.ts";
import { UPDATES15 } from "./updates15.ts";
import { UPDATES16 } from "./updates16.ts";
import { UPDATES17 } from "./updates17.ts";
import { UPDATES18 } from "./updates18.ts";
import { UPDATES19 } from "./updates19.ts";
import { UPDATES20 } from "./updates20.ts";
import { UPDATES21 } from "./updates21.ts";

export const UPDATE_LOG: Readonly<Record<string, Row>> = {
  ...UPDATES1, ...UPDATES2, ...UPDATES3, ...UPDATES4, ...UPDATES5, ...UPDATES6, ...UPDATES7, ...UPDATES8, ...UPDATES9, ...UPDATES10,
  ...UPDATES11, ...UPDATES12, ...UPDATES13, ...UPDATES14, ...UPDATES15, ...UPDATES16, ...UPDATES17, ...UPDATES18, ...UPDATES19, ...UPDATES20,
  ...UPDATES21,
};
