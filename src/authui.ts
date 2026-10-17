import { accounts, type Account } from "./accounts";

/**
 * Sign-in / register overlay. Real DOM inputs (so password managers and IME work),
 * styled like the in-game windows. Resolves once someone is signed in.
 */
export function showAuth(): Promise<Account> {
  return new Promise((resolve) => {
    const root = document.createElement("div");
    root.id = "auth";
    root.innerHTML = `
      <form class="win" novalidate>
        <h1>EMBERVEIL</h1>
        <div class="tabs"><button type="button" data-tab="login" class="on">Sign in</button><button type="button" data-tab="register">Register</button></div>
        <label class="reg">Name<input name="name" maxlength="16" autocomplete="nickname" /></label>
        <label>Email<input name="email" type="email" autocomplete="email" /></label>
        <label>Password<input name="password" type="password" autocomplete="current-password" /></label>
        <div class="err" role="alert"></div>
        <button class="go" type="submit">Sign in</button>
      </form>`;
    document.body.appendChild(root);
    const form = root.querySelector("form")!;
    const err = root.querySelector<HTMLDivElement>(".err")!;
    const go = root.querySelector<HTMLButtonElement>(".go")!;
    const pass = form.elements.namedItem("password") as HTMLInputElement;
    let mode: "login" | "register" = "login";
    const setMode = (m: "login" | "register") => {
      mode = m;
      root.classList.toggle("register", m === "register");
      root.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === m));
      go.textContent = m === "login" ? "Sign in" : "Create account";
      pass.autocomplete = m === "login" ? "current-password" : "new-password";
      pass.placeholder = m === "register" ? "10+ characters" : "";
      err.textContent = "";
    };
    root.querySelectorAll<HTMLButtonElement>(".tabs button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.tab as "login" | "register")));
    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      go.disabled = true;
      const value = (n: string) => (form.elements.namedItem(n) as HTMLInputElement).value;
      const res =
        mode === "login"
          ? await accounts.login(value("email"), value("password"))
          : await accounts.register(value("email"), value("password"), value("name"));
      go.disabled = false;
      if (!res.ok) {
        err.textContent = res.error;
        return;
      }
      root.remove();
      resolve(res.value);
    });
    (form.elements.namedItem("email") as HTMLInputElement).focus();
  });
}
