// ===== Store settings =====
// Change these freely. The Supabase values are already filled in for your "painting-store" project.
window.STORE_CONFIG = {
  STORE_NAME: "Infinite Easle",
  TAGLINE: "Hand-painted art for walls, brands and fans",
  CONTACT_PHONE: "01307088607",          // shown in the footer and on order pages. bKash/Nagad payments are also sent to this number
  CONTACT_EMAIL: "infinite.easel@gmail.com",

  // ----- Facebook links (shown in the footer of every page) -----
  // Paste the full link between the quotes, for example "https://www.facebook.com/your.page"
  // A link that is left empty ("") is simply not shown, so nothing looks broken.
  FACEBOOK_PAGE_URL: "",                 // the shop's Facebook page
  OWNER_FACEBOOK_URL: "https://www.facebook.com/anika.tasnim.maisha.17968",                // the owner's own Facebook profile
  // Admin access is controlled by the "admins" table in Supabase: only accounts listed there
  // can open admin.html. Nothing about the admin account is stored in this file.

  SUPABASE_URL: "https://wdhiteaszpyzqwrmgnyu.supabase.co",
  // Publishable (public) key. It is safe to put in a website; your data is protected by row-level security.
  SUPABASE_KEY: "sb_publishable_BSs16mIqFFs5yvC0o5CaQQ_GSrhEs6g",
};
