// ─── Configuration you'll fill in when you wire up the real integrations ───
// See README.md in this folder for the full checklist.

// Base URL of the deployed app (frontend/). Every [data-app-link="/path"]
// element gets its href set to APP_URL + that path.
const APP_URL = "https://fortuna.nick-comuni995.workers.dev";

// Stripe Payment Links (Dashboard → Payment Links → create one per price).
// Leave null until you have real links — buttons fall back to sending the
// visitor to sign-up with the chosen plan in the query string instead.
const STRIPE_PAYMENT_LINKS = {
  mensal: null,
  anual: null,
};

document.addEventListener("DOMContentLoaded", () => {
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Mobile nav toggle
  const navToggle = document.getElementById("navToggle");
  const mobileNav = document.getElementById("mobileNav");
  if (navToggle && mobileNav) {
    navToggle.addEventListener("click", () => {
      const open = mobileNav.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", String(open));
    });
    mobileNav.querySelectorAll("a").forEach(a =>
      a.addEventListener("click", () => {
        mobileNav.classList.remove("open");
        navToggle.setAttribute("aria-expanded", "false");
      })
    );
  }

  // Point every "go to the app" link at the real deployed app.
  document.querySelectorAll("[data-app-link]").forEach(el => {
    el.href = APP_URL + el.getAttribute("data-app-link");
  });

  // Pricing CTAs: use the Stripe Payment Link once configured, otherwise
  // keep the sign-up fallback (already set above via data-app-link) so the
  // page is fully usable before Stripe is wired up.
  let anyStripeLinkConfigured = false;
  document.querySelectorAll("[data-checkout-plan]").forEach(el => {
    const plan = el.getAttribute("data-checkout-plan");
    const link = STRIPE_PAYMENT_LINKS[plan];
    if (link) {
      el.href = link;
      anyStripeLinkConfigured = true;
    }
  });

  const notice = document.getElementById("checkoutNotice");
  if (notice && !anyStripeLinkConfigured) notice.hidden = false;
});
