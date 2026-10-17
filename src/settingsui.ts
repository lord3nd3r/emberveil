/**
 * Always-visible sound + settings buttons and the Settings / Account / Controls panel.
 * Plain DOM built with createElement and textContent only: nothing a user typed (name, email) is
 * ever parsed as HTML. Works with keyboard (Tab, Esc, Enter), mouse and touch.
 */
import type Phaser from "phaser";
import { accounts } from "./accounts";
import { sfx } from "./audio";
import { settings, settingsStore } from "./settings";

type Kids = (Node | string)[];
function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls = "", ...kids: Kids): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  for (const k of kids) e.append(k);
  return e;
}
function button(text: string, cls: string, onClick: () => void): HTMLButtonElement {
  const b = h("button", `sbtn ${cls}`, text);
  b.type = "button";
  b.addEventListener("click", onClick);
  return b;
}

const FOCUSABLE = "button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function initSettingsUI(game: Phaser.Game): void {
  /* ---------------------------------------------------------- always-on buttons */
  const bar = h("div", "hudbtns");
  bar.id = "hudbtns";
  const muteBtn = h("button", "hbtn");
  muteBtn.type = "button";
  const gearBtn = h("button", "hbtn", "⚙");
  gearBtn.type = "button";
  gearBtn.setAttribute("aria-label", "Settings and account");
  gearBtn.title = "Settings (F10)";
  bar.setAttribute("role", "toolbar");
  bar.setAttribute("aria-label", "Sound and settings");
  gearBtn.setAttribute("aria-haspopup", "dialog");
  bar.append(muteBtn, gearBtn);
  document.body.append(bar);

  const paintMute = () => {
    const m = settings.muted;
    muteBtn.textContent = m ? "🔇" : "🔊";
    muteBtn.classList.toggle("off", m);
    muteBtn.setAttribute("aria-pressed", String(m));
    muteBtn.setAttribute("aria-label", m ? "Sound is off. Turn sound on" : "Sound is on. Turn sound off");
    muteBtn.title = m ? "Unmute (M)" : "Mute (M)";
  };
  muteBtn.addEventListener("click", () => {
    sfx.unlock();
    sfx.toggle();
  });
  settingsStore.subscribe(paintMute);
  paintMute();

  /* ---------------------------------------------------------- panel */
  let overlay: HTMLDivElement | null = null;
  let opener: HTMLElement | null = null;
  let timer = 0;
  let tab: "settings" | "account" | "controls" = "settings";
  let body: HTMLDivElement;
  let confirmDelete = false;

  const kbd = () => game.input.keyboard;

  function close(): void {
    if (!overlay) return;
    window.clearInterval(timer);
    overlay.remove();
    overlay = null;
    if (kbd()) kbd()!.enabled = true;
    (opener ?? gearBtn).focus();
  }

  function open(): void {
    if (overlay) return;
    opener = document.activeElement as HTMLElement | null;
    confirmDelete = false;
    overlay = h("div", "overlay");
    overlay.id = "settings";
    const panel = h("div", "panel");
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.setAttribute("aria-labelledby", "settings-title");
    const title = h("h2", "", "Settings");
    title.id = "settings-title";
    const x = button("✕", "x", close);
    x.setAttribute("aria-label", "Close settings");
    const head = h("div", "phead", title, x);
    const tabs = h("div", "ptabs");
    tabs.setAttribute("role", "tablist");
    const tabBtns = (["settings", "account", "controls"] as const).map((t) => {
      const b = h("button", "ptab", t === "settings" ? "Settings" : t === "account" ? "Account" : "Controls");
      b.type = "button";
      b.setAttribute("role", "tab");
      b.addEventListener("click", () => {
        tab = t;
        confirmDelete = false;
        render();
      });
      return { t, b };
    });
    tabBtns.forEach(({ b }) => tabs.append(b));
    body = h("div", "pbody");
    panel.append(head, tabs, body);
    overlay.append(panel);
    overlay.addEventListener("pointerdown", (e) => {
      if (e.target === overlay) close();
    });
    overlay.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") {
        e.preventDefault();
        close();
      } else if (e.key === "Tab") {
        const f = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((n) => !n.hidden && n.offsetParent !== null);
        if (!f.length) return;
        const first = f[0];
        const last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });
    document.body.append(overlay);
    if (kbd()) kbd()!.enabled = false;

    const render = () => {
      tabBtns.forEach(({ t, b }) => {
        b.classList.toggle("on", t === tab);
        b.setAttribute("aria-selected", String(t === tab));
      });
      body.replaceChildren();
      if (tab === "settings") renderSettings(body);
      else if (tab === "account") renderAccount(body, render);
      else renderControls(body);
    };
    (open as unknown as { render?: () => void }).render = render;
    render();
    x.focus();
    timer = window.setInterval(() => {
      const el = body.querySelector<HTMLElement>("[data-live]");
      if (el) el.textContent = saveText();
    }, 1000);
  }

  gearBtn.addEventListener("click", () => {
    sfx.unlock();
    open();
  });
  window.addEventListener("keydown", (e) => {
    if (overlay) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA")) return;
    if (e.key === "F10" || (e.key === "," && (e.ctrlKey || e.metaKey))) {
      e.preventDefault();
      open();
    }
  });

  /* ---------------------------------------------------------- settings tab */
  function slider(id: string, label: string, value: number, onInput: (v: number) => void): HTMLElement {
    const out = h("output", "val", `${Math.round(value * 100)}%`);
    const input = h("input");
    input.type = "range";
    input.min = "0";
    input.max = "100";
    input.step = "5";
    input.id = id;
    input.value = String(Math.round(value * 100));
    input.addEventListener("input", () => {
      const v = Number(input.value) / 100;
      out.textContent = `${input.value}%`;
      input.setAttribute("aria-valuetext", `${input.value} percent`);
      onInput(v);
    });
    const lab = h("label", "", label);
    lab.htmlFor = id;
    return h("div", "row", lab, input, out);
  }

  function toggle(id: string, label: string, hint: string, on: boolean, onChange: (v: boolean) => void): HTMLElement {
    const input = h("input");
    input.type = "checkbox";
    input.id = id;
    input.checked = on;
    input.setAttribute("role", "switch");
    input.addEventListener("change", () => onChange(input.checked));
    const lab = h("label", "", h("span", "t", label), h("span", "hint", hint));
    lab.htmlFor = id;
    return h("div", "row tog", lab, input);
  }

  function renderSettings(root: HTMLElement): void {
    const s = settings;
    root.append(
      h("h3", "", "Sound"),
      toggle("s-mute", "Mute all sound", "Same as the speaker button or the M key.", s.muted, (v) => settingsStore.update({ muted: v })),
      slider("s-master", "Master volume", s.master, (v) => settingsStore.update({ master: v })),
      slider("s-music", "Music volume", s.music, (v) => settingsStore.update({ music: v })),
      slider("s-sfx", "Effects volume", s.sfx, (v) => {
        settingsStore.update({ sfx: v });
        sfx.unlock();
        sfx.play("blip");
      }),
      h("h3", "", "Accessibility"),
      toggle("s-shake", "Reduce screen shake", "Calms camera shake and tilt during hits and special moves.", s.reduceShake, (v) => settingsStore.update({ reduceShake: v })),
      toggle("s-flash", "Reduce flashing", "Dims full-screen flashes and removes colour-split bursts.", s.reduceFlash, (v) => settingsStore.update({ reduceFlash: v })),
      toggle("s-motion", "Reduce motion effects", "Level-up and other decorative bursts become a calm label and soft glow.", s.reduceMotion, (v) => settingsStore.update({ reduceMotion: v })),
      h("h3", "", "Text size"),
    );
    const sizes = h("div", "seg");
    sizes.setAttribute("role", "group");
    sizes.setAttribute("aria-label", "Text size");
    (["Small", "Normal", "Large"] as const).forEach((name, i) => {
      const b = h("button", `sbtn ${settings.textSize === i ? "on" : ""}`, name);
      b.type = "button";
      b.setAttribute("aria-pressed", String(settings.textSize === i));
      b.addEventListener("click", () => {
        settingsStore.update({ textSize: i as 0 | 1 | 2 });
        sizes.querySelectorAll("button").forEach((o, j) => {
          o.classList.toggle("on", j === i);
          o.setAttribute("aria-pressed", String(j === i));
        });
        note.textContent = "Applies to menus and dialogue the next time they open.";
      });
      sizes.append(b);
    });
    const note = h("p", "hint", "");
    note.setAttribute("aria-live", "polite");
    root.append(sizes, note, h("h3", "", "Map labels"));
    const dens = h("div", "seg");
    dens.setAttribute("role", "group");
    dens.setAttribute("aria-label", "Label density");
    ([["all", "All"], ["near", "Near"], ["off", "Off"]] as const).forEach(([v, name]) => {
      const b = h("button", `sbtn ${settings.labels === v ? "on" : ""}`, name);
      b.type = "button";
      b.title = v === "all" ? "Always show every name label" : v === "near" ? "Only show labels close to you" : "Hide floating labels";
      b.setAttribute("aria-pressed", String(settings.labels === v));
      b.addEventListener("click", () => {
        settingsStore.update({ labels: v });
        dens.querySelectorAll("button").forEach((o) => {
          const on = o === b;
          o.classList.toggle("on", on);
          o.setAttribute("aria-pressed", String(on));
        });
      });
      dens.append(b);
    });
    root.append(
      dens,
      h("p", "hint", "All: names always float over people, gates, signs and pickups. Near: only close to you. Off: hidden."),
      toggle("s-mini", "Show minimap", "A small map with markers for people, gates and pickups.", s.minimap, (v) => settingsStore.update({ minimap: v })),
      h("h3", "", "Display"),
    );
    const fsBtn = button(document.fullscreenElement ? "Leave fullscreen" : "Enter fullscreen", "", async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await document.documentElement.requestFullscreen({ navigationUI: "hide" });
      } catch {
        note.textContent = "This browser would not enter fullscreen.";
      }
      fsBtn.textContent = document.fullscreenElement ? "Leave fullscreen" : "Enter fullscreen";
    });
    fsBtn.hidden = !document.documentElement.requestFullscreen;
    root.append(fsBtn);
  }

  /* ---------------------------------------------------------- account tab */
  function saveText(): string {
    const st = accounts.status();
    const when = st.at ? ` Last update ${new Date(st.at).toLocaleTimeString()}.` : "";
    return `${st.message}${when}`;
  }

  function renderAccount(root: HTMLElement, rerender: () => void): void {
    const me = accounts.current();
    if (!me) {
      root.append(h("p", "", "You are not signed in. Sign in from the title screen to keep your progress on the server."));
      return;
    }
    const msg = h("p", "msg", "");
    msg.setAttribute("role", "status");
    const say = (t: string, bad = false) => {
      msg.textContent = t;
      msg.classList.toggle("bad", bad);
    };
    const field = (id: string, label: string, type: string, value = "", auto = "off") => {
      const input = h("input");
      input.id = id;
      input.type = type;
      input.value = value;
      input.autocomplete = auto as AutoFill;
      input.maxLength = type === "password" ? 128 : 16;
      const lab = h("label", "", label);
      lab.htmlFor = id;
      return { input, row: h("div", "frow", lab, input) };
    };

    root.append(
      h("h3", "", "Signed in"),
      h("dl", "kv", h("dt", "", "Display name"), h("dd", "", me.name), h("dt", "", "Email"), h("dd", "", me.email)),
      h("h3", "", "Save and load"),
    );
    const st = h("p", "hint", saveText());
    st.dataset.live = "1";
    root.append(
      st,
      button("Save now", "", async () => {
        say("Saving…");
        await accounts.flush();
        st.textContent = saveText();
        say(accounts.status().state === "saved" ? "Saved." : accounts.status().message, accounts.status().state === "error");
      }),
    );

    const nm = field("a-name", "New display name", "text", me.name, "nickname");
    root.append(
      h("h3", "", "Change display name"),
      nm.row,
      button("Change name", "", async () => {
        const r = await accounts.updateName(nm.input.value);
        say(r.ok ? "Name changed." : r.error, !r.ok);
        if (r.ok) rerender();
      }),
    );

    const cur = field("a-cur", "Current password", "password", "", "current-password");
    const nxt = field("a-new", "New password (10+ characters)", "password", "", "new-password");
    root.append(
      h("h3", "", "Change password"),
      cur.row,
      nxt.row,
      button("Change password", "", async () => {
        const r = await accounts.changePassword(cur.input.value, nxt.input.value);
        say(r.ok ? "Password changed." : r.error, !r.ok);
        if (r.ok) {
          cur.input.value = "";
          nxt.input.value = "";
        }
      }),
    );

    root.append(
      h("h3", "", "Session"),
      button("Log out", "", async () => {
        await accounts.logout();
        location.reload();
      }),
    );

    root.append(h("h3", "danger", "Delete account"));
    if (!confirmDelete) {
      root.append(
        h("p", "hint", "This permanently deletes your account and your saved game."),
        button("Delete account…", "danger", () => {
          confirmDelete = true;
          rerender();
        }),
      );
    } else {
      const pw = field("a-del", "Type your password to confirm", "password", "", "current-password");
      const word = field("a-word", "Type DELETE", "text", "", "off");
      word.input.maxLength = 6;
      root.append(
        h("p", "bad", "This cannot be undone."),
        pw.row,
        word.row,
        h(
          "div",
          "btnrow",
          button("Delete forever", "danger", async () => {
            if (word.input.value.trim() !== "DELETE") return say("Type DELETE to confirm.", true);
            const r = await accounts.deleteAccount(pw.input.value);
            if (!r.ok) return say(r.error, true);
            location.reload();
          }),
          button("Cancel", "", () => {
            confirmDelete = false;
            rerender();
          }),
        ),
      );
    }
    root.append(msg);
  }

  /* ---------------------------------------------------------- controls tab */
  function renderControls(root: HTMLElement): void {
    const rows: [string, string][] = [
      ["Move", "Arrow keys or W A S D"],
      ["Confirm / talk", "E, Enter or Space"],
      ["Cancel / menu", "Esc or Backspace"],
      ["Mouse", "Hover and click menu items and the map"],
      ["Mute", "M, or the speaker button"],
      ["Volume", "- and = keys"],
      ["Settings", "F10, or the gear button"],
      ["Stuck?", "Esc, then Stuck? returns you to the last safe spot"],
      ["Goal and places", "Esc, then Goal, Places or Map"],
      ["Touch", "Left stick moves; A confirms, B cancels, Menu opens the menu"],
    ];
    const dl = h("dl", "kv");
    rows.forEach(([k, v]) => dl.append(h("dt", "", k), h("dd", "", v)));
    root.append(h("h3", "", "How to play"), dl);
  }
}
