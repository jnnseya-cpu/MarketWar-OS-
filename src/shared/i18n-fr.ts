// THE FRENCH TRANSLATION — the platform's premier translation, and the first
// one it owns rather than improvises.
//
// Keyed by the EXACT English the interface would otherwise render, so this file
// reads as a parallel text and a missing entry degrades to correct English
// rather than to a key. The mechanism, and why it is this way round, is in
// `i18n.ts`.
//
// THREE RULES THIS FILE IS HELD TO, each enforced by a test rather than by
// good intentions:
//
// 1. A PRODUCT NAME IS NOT A WORD. OMNIRANK, SHARE2EARN, SiteRaid AI,
//    VisualStrike AI, LeadWar Room, Sentinel, MarketWar and WhatsApp survive
//    verbatim. This is the same judgement §187 made about DNS records applied
//    to prose: a translation that renames the product has not translated the
//    sentence, it has broken the reference. The acronyms a French marketer
//    already uses in English — SEO, ROI, ACU — stay too, because translating
//    them would be less French to the person reading, not more.
//
// 2. FRENCH TYPOGRAPHY, NOT ENGLISH TYPOGRAPHY WITH FRENCH WORDS. A no-break
//    space precedes `:`, `%`, `?` and `!`. It appears in this file exactly
//    once, as the escape `\u00A0` bound to `NB`, and every value that needs one
//    interpolates it — so no entry below carries an invisible character, which
//    would be an unreviewable one. This is the detail that separates a
//    translation somebody wrote from a dictionary somebody ran, and a French
//    reader notices its absence immediately without being able to name the
//    rule. A test holds every value to it.
//
// 3. AN ENTRY EQUAL TO ITS KEY IS A DECISION. "Acquisition" and "Conversion"
//    are those words in French. They are listed, identically, so that a reader
//    of this file knows they were considered rather than skipped.

/** The nbsp French typography requires before `:` and `%`. */
const NB = "\u00A0";

export const FR: Readonly<Record<string, string>> = {
  // ---------------------------------------------------------------- nav groups
  Command: "Commandement",
  Acquisition: "Acquisition",
  Conversion: "Conversion",
  Intelligence: "Renseignement",
  Account: "Compte",

  // ------------------------------------------------------------ command group
  "Growth Hubs (Create · Grow · Earn · Play)": "Pôles de croissance (Créer · Développer · Gagner · Jouer)",
  "Work Library": "Bibliothèque de travaux",
  "Brand Studio": "Studio de marque",
  "Brand Launch Kit": "Kit de lancement de marque",
  "Command Center": "Centre de commandement",
  "Revenue Command (War Report)": "Commandement des revenus (rapport de guerre)",
  "Money Ledger": "Grand livre",
  "Acquisition Run": "Opération d'acquisition",
  "First Customer": "Premier client",
  "Revenue Autopilot": "Pilote automatique des revenus",
  "Agent Chains": "Chaînes d'agents",
  "AI Engines": "Moteurs IA",
  "Strategy Agents": "Agents de stratégie",
  "Make Anything": "Tout créer",
  "AI Growth Engine": "Moteur de croissance IA",
  "Daily Briefing": "Briefing quotidien",
  "Strategy Chain": "Chaîne stratégique",
  "Failure Audit": "Audit des échecs",

  // --------------------------------------------------------- acquisition group
  "AI Visibility": "Visibilité IA",
  "Organic Dominance": "Domination organique",
  "Search Dominance Engine": "Moteur de domination des recherches",
  // OMNIRANK is the product's name and stays whole.
  "OMNIRANK Dominion": "Dominion OMNIRANK",
  "SiteRaid AI": "SiteRaid AI",
  "SEO Autopilot": "Pilote automatique SEO",
  "Market Intel": "Renseignement marché",
  "LeadWar Room": "LeadWar Room",
  "Contact Hunter": "Chasseur de contacts",
  "Campaign Warfare (Autopilot)": "Guerre de campagnes (pilote automatique)",
  "Live Campaign Board": "Tableau des campagnes en direct",
  "Campaign Builder": "Créateur de campagnes",
  "Offer Builder": "Créateur d'offres",
  "Content Factory": "Usine à contenu",
  "SEO Blog Studio": "Studio de blog SEO",
  "VisualStrike AI": "VisualStrike AI",
  "Video War Room": "Salle de guerre vidéo",
  "Landing Pages": "Pages de destination",
  "Conversion Architect": "Architecte de conversion",
  "Publish Center": "Centre de publication",
  "Collaboration & Approvals": "Collaboration et validations",

  // ---------------------------------------------------------- conversion group
  "WhatsApp Center": "Centre WhatsApp",
  "Email Center": "Centre e-mail",
  "Inbox (replies)": "Boîte de réception (réponses)",
  "Email Templates": "Modèles d'e-mails",
  "Sending Domains": "Domaines d'envoi",
  "Customer Vault": "Coffre clients",
  "Audience Segments": "Segments d'audience",
  "Lead Recovery": "Récupération de prospects",
  "Influencer Recruitment": "Recrutement d'influenceurs",
  "Partner Network": "Réseau de partenaires",
  "My Earnings": "Mes gains",
  "Automation Lab": "Labo d'automatisation",
  "Reach Amplifier": "Amplificateur de portée",

  // -------------------------------------------------------- intelligence group
  "ROI Engine": "Moteur de ROI",
  "Revenue Intel": "Renseignement revenus",
  "Budget Protection": "Protection du budget",
  "Competitor Spy": "Espion concurrents",
  // "Market exit" is a business CLOSING and freeing the demand it served — not
  // a customer leaving a page. A literal "sortie" would describe the wrong
  // engine entirely.
  "Market Exit Capture": "Capture des marchés libérés",
  "Reputation Shield": "Bouclier de réputation",
  "Sentinel Security": "Sécurité Sentinel",
  "Local Domination": "Domination locale",

  // ------------------------------------------------------------- account group
  "Billing & ACUs": "Facturation et ACU",
  "Find your work": "Retrouver vos travaux",
  "Activity (what happened)": "Activité (ce qui s'est passé)",
  "Comms Events": "Événements de communication",
  "Integration Hub": "Hub d'intégrations",
  "Settings & Security": "Paramètres et sécurité",
  "Go-Live Readiness": "Préparation à la mise en ligne",
  "Admin Centre": "Centre d'administration",

  // ------------------------------------------------------------ sidebar status
  "Checking status…": "Vérification de l'état…",
  "Live intelligence active": "Renseignement en direct actif",
  "Activating…": "Activation…",

  // ---------------------------------------------------------------- command bar
  "What do you want MarketWar to do?": `Que voulez-vous que MarketWar fasse${NB}?`,
  Ask: "Demander",
  "Go to": "Aller à",
  "The engine that does this": "Le moteur qui fait cela",
  "It will only ask you": "Il vous demandera seulement",
  Or: "Ou",
  // `{s}` is the English plural and has no French equivalent: a unit symbol
  // takes no `s`. An unused placeholder is simply absent from the translation.
  "About {acu} ACU{s} · {pct}% match on your wording":
    `Environ {acu} ACU · {pct}${NB}% de correspondance avec votre formulation`,

  "Try": "Essayez",
  "Create a campaign for our new product": "Créer une campagne pour notre nouveau produit",
  "Find 500 prospects in Birmingham": "Trouver 500 prospects à Birmingham",
  "Make 5 TikTok videos": "Créer 5 vidéos TikTok",
  "Why did conversions fall?": `Pourquoi les conversions ont-elles baissé${NB}?`,
  "Create next week's growth plan": "Créer le plan de croissance de la semaine prochaine",
  "Press Enter and MarketWar will work out which engine does this.":
    "Appuyez sur Entrée et MarketWar déterminera quel moteur s'en charge.",

  // -------------------------------------------------------------- mobile drawer
  Menu: "Menu",
  Navigation: "Navigation",
  "Open navigation menu": "Ouvrir le menu de navigation",
  "Close navigation menu": "Fermer le menu de navigation",

  // ----------------------------------------------------------- language picker
  "Detected from this device: {detected}. Everything the platform writes — agents, campaigns, articles, emails — comes back in this language. The menus and labels are English and your browser will offer to translate them.":
    `Détectée depuis cet appareil${NB}: {detected}. Tout ce que la plateforme rédige — agents, campagnes, articles, e-mails — revient dans cette langue. Les menus et libellés sont en français lorsque la traduction existe, en anglais sinon, et votre navigateur proposera de traduire le reste.`,
};
