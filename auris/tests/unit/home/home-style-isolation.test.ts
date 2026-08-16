import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const homeCss = readFileSync(
  resolve(process.cwd(), "src/components/home/home-v3.css"),
  "utf8",
);
const sharedAurisCss = readFileSync(
  resolve(process.cwd(), "src/components/auris-ui/auris-ui.css"),
  "utf8",
);

describe("home route style isolation", () => {
  afterEach(() => {
    document.head.querySelectorAll("style[data-home-style-test]").forEach((style) => style.remove());
    document.body.replaceChildren();
  });

  it("keeps the home canvas authoritative when shared page CSS loads later", () => {
    const homeStyle = document.createElement("style");
    homeStyle.dataset.homeStyleTest = "home";
    homeStyle.textContent = homeCss;
    document.head.append(homeStyle);

    // This mirrors a client transition from /review back to /: the lazy route
    // can append the shared Auris UI stylesheet after Home's route stylesheet.
    const sharedStyle = document.createElement("style");
    sharedStyle.dataset.homeStyleTest = "shared";
    sharedStyle.textContent = sharedAurisCss;
    document.head.append(sharedStyle);

    const home = document.createElement("main");
    home.className = "auris-page home-v3";
    document.body.append(home);

    const computed = getComputedStyle(home);
    expect(computed.paddingTop).toBe("24px");
    expect(computed.paddingRight).toBe("28px");
    expect(computed.paddingBottom).toBe("24px");
    expect(computed.paddingLeft).toBe("28px");
    expect(computed.overflow).toBe("hidden");
  });
});
