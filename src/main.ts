import "./style.css";
import { OceanEngine } from "./ocean/engine";
import { installMotion } from "./ui/motion";
import { initPage, initTheme } from "./ui/page";
import { initPlayer } from "./ui/player";
import { initPreview } from "./ui/preview";
import { initLanding } from "./ui/landing";
import { initWater } from "./ui/water";

installMotion();
initPage();
initPlayer();
initPreview();

let engine: OceanEngine | undefined;
const landing = initLanding((rect, corner, reach) => engine?.splash(rect, corner, 1, reach));
const theme = initTheme((t) => engine?.setTheme(t));

// Load the monospace font first so glyphs render in it from the first frame.
document.fonts
  .load('500 7px "JetBrains Mono"')
  .catch(() => {})
  .then(() => {
    engine = new OceanEngine(document.querySelector<HTMLCanvasElement>("#ocean")!, theme);
    engine.attachOverlay(document.querySelector<HTMLCanvasElement>("#overlay")!);
    engine.attachBadge(document.querySelector<HTMLElement>("#theme-toggle")!, theme);
    initWater(engine);
    engine.start();
    landing.land();
  });
