export type MarketingPageType = "guide" | "comparison";

export type MarketingPage = {
  type: MarketingPageType;
  slug: string;
  title: string;
  seoTitle: string;
  description: string;
  eyebrow: string;
  intent: string;
  updated: string;
  tags: string[];
  heroBullets: string[];
  sections: {
    title: string;
    body: string;
    bullets?: string[];
    code?: string;
  }[];
  faqs: {
    question: string;
    answer: string;
  }[];
  cta: {
    title: string;
    body: string;
  };
};

export const guides: MarketingPage[] = [
  {
    type: "guide",
    slug: "billing-for-side-projects",
    title: "Billing for side projects",
    seoTitle: "Billing for Side Projects: Add Payments Without Building Billing",
    description:
      "A practical guide to charging for small developer products with checkout, wallets, credits, webhooks, and billing UI handled by vantezzen/pay.",
    eyebrow: "Side project billing",
    intent:
      "For developers who have a useful tool and want to charge for it without spending a week wiring billing infrastructure.",
    updated: "2026-07-07",
    tags: ["Side projects", "Checkout", "Webhooks", "Developer tools"],
    heroBullets: [
      "Use Stripe or Polar for the money movement.",
      "Use vantezzen/pay for the app-facing billing layer.",
      "Reuse one billing microservice across every project you ship.",
    ],
    sections: [
      {
        title: "What side project billing actually needs",
        body: "A small paid tool needs more than a checkout link. It needs products, prices, a way to know who paid, webhook fulfillment, access checks, customer recovery, and a tiny admin surface when something goes wrong.",
        bullets: [
          "Checkout creation for one-time purchases, credit packs, and subscriptions.",
          "Webhook verification so payment state turns into app access.",
          "Wallets or external user mapping so access survives refreshes and devices.",
          "UI for balances, purchase prompts, feature gates, and billing portal links.",
          "A dashboard for orders, wallets, providers, products, and support adjustments.",
        ],
      },
      {
        title: "The division of responsibility",
        body: "Keep the payment provider responsible for payment processing, invoices, taxes, cards, refunds, and subscription billing. Put vantezzen/pay between your app and that provider so your product code only has to ask simple questions: can this user buy, spend, or access this feature?",
        bullets: [
          "Stripe or Polar owns money, invoices, tax behavior, and payment methods.",
          "vantezzen/pay owns projects, products, prices, wallets, credits, gates, and fulfillment.",
          "Your app owns the product experience and calls a small client API.",
        ],
      },
      {
        title: "A minimal integration path",
        body: "Start with the smallest useful path: one project, one provider, one product, one price, and one gated action. Add subscriptions, one-time feature unlocks, or external auth only when the project actually needs them.",
        bullets: [
          "Create a vantezzen/pay project for the app you want to monetize.",
          "Connect Stripe or Polar once from the provider screen.",
          "Create a product and price that match what the user buys.",
          "Install the shadcn registry components into your app.",
          "Show a balance, open checkout when needed, and deduct credits when work starts.",
        ],
        code: `const { deduct } = useCredits();

<CreditGate cost={10}>
  <Button onClick={() => deduct(10)}>
    Process file
  </Button>
</CreditGate>`,
      },
      {
        title: "When this is the right fit",
        body: "vantezzen/pay is intentionally strongest for small developer products: AI wrappers, generators, file processors, internal utilities, indie SaaS experiments, templates, and tools that are useful enough to charge for but too small to deserve a bespoke billing system.",
        bullets: [
          "You want to charge in an afternoon, not turn billing into a sprint.",
          "You ship multiple small tools and want one shared billing service.",
          "You want payment components that live in your codebase and match your theme.",
          "You do not want to force auth just to sell credits or access.",
        ],
      },
    ],
    faqs: [
      {
        question: "Is vantezzen/pay a replacement for Stripe or Polar?",
        answer:
          "No. Stripe and Polar still process payments. vantezzen/pay handles the app-facing layer around them: products, wallets, checkout creation, gates, webhooks, and support operations.",
      },
      {
        question: "Can I use vantezzen/pay for more than one side project?",
        answer:
          "Yes. That is the point of the billing microservice model: set up vantezzen/pay once, then create separate projects for the small tools you ship.",
      },
      {
        question: "Do users need accounts?",
        answer:
          "No. Credit-code projects can sell and restore wallets without login. If your app already has accounts, vantezzen/pay can attach wallets to your own user ids instead.",
      },
    ],
    cta: {
      title: "Start with one paid action",
      body: "Create a project, connect a provider, add one product, then gate the first feature that should cost money.",
    },
  },
  {
    type: "guide",
    slug: "monetize-without-user-accounts",
    title: "Monetize a tool without user accounts",
    seoTitle: "Monetize a Tool Without User Accounts: Anonymous Credit Wallets",
    description:
      "Use anonymous credit wallets and recovery codes to sell access to small tools without adding a full auth system first.",
    eyebrow: "No-auth monetization",
    intent:
      "For tools where forcing signup would add more friction than value, but users still need to buy and restore access.",
    updated: "2026-07-07",
    tags: ["No auth", "Credit wallets", "Recovery codes", "Checkout"],
    heroBullets: [
      "Give visitors a wallet on first visit.",
      "Let them restore it with a human-readable code.",
      "Move to external auth later if the product grows into accounts.",
    ],
    sections: [
      {
        title: "Why auth can be too expensive for a small tool",
        body: "Many side projects do not need accounts on day one. A user might only want to process a file, generate an asset, run a check, or unlock a small feature. Adding auth, password resets, account settings, and billing identity can make the paid path heavier than the product.",
        bullets: [
          "One-off tools lose buyers when signup appears before value.",
          "Tiny utilities often need purchase recovery, not full profiles.",
          "Anonymous wallets keep the first session fast while still supporting paid usage.",
        ],
      },
      {
        title: "How vantezzen/pay credit codes work",
        body: "A credit-code project creates a wallet for the browser and stores a recovery code. The app can show balance, spend credits, and open checkout without knowing who the person is. The customer can copy the code or transfer it to another device.",
        bullets: [
          "The wallet stores balances, unlocked features, and subscription-derived access.",
          "The code is the recovery key for the wallet.",
          "Stripe or Polar still handles the checkout and billing portal.",
          "vantezzen/pay fulfills the webhook and updates the same wallet after payment.",
        ],
      },
      {
        title: "A good no-auth payment flow",
        body: "Let the user do something valuable first, show the balance near the paid action, and ask for payment only when the action needs credits or a feature is locked.",
        bullets: [
          "Create or load the wallet when the app starts.",
          "Show remaining credits in the toolbar or action area.",
          "Wrap paid actions in a credit or feature gate.",
          "After checkout, resume the app and refresh wallet state.",
          "Show the wallet button somewhere stable so users can copy or restore the code.",
        ],
        code: `<PayProvider publishableKey={publishableKey}>
  <RemainingCredits />
  <WalletButton />
  <CreditGate cost={1}>
    <GenerateButton />
  </CreditGate>
</PayProvider>`,
      },
      {
        title: "When to switch to external auth",
        body: "Anonymous wallets are not a religion. If your product grows into teams, saved projects, collaboration, or account-level permissions, keep the billing layer and move wallet ownership to your own user ids.",
        bullets: [
          "Use credit codes for low-friction tools and early experiments.",
          "Use external auth when the product already has users and sessions.",
          "Keep the payment model stable while the identity model grows up.",
        ],
      },
    ],
    faqs: [
      {
        question: "Can anonymous users manage subscriptions?",
        answer:
          "Yes, after a purchase creates a provider customer. vantezzen/pay can open the provider billing portal for the wallet when that billing customer exists.",
      },
      {
        question: "What happens if a user loses the code?",
        answer:
          "A lost anonymous code is like a lost recovery key. The product should encourage copying it after purchase and keep the wallet button visible in account or billing areas.",
      },
      {
        question: "Can I migrate from credit codes to user accounts?",
        answer:
          "Yes. New integrations can use external auth, and growing products can attach billing state to their own users once accounts become worth the friction.",
      },
    ],
    cta: {
      title: "Sell first, add accounts when they matter",
      body: "Use credit codes for the paid path now. Add full accounts later when the product needs more than billing recovery.",
    },
  },
  {
    type: "guide",
    slug: "shadcn-payment-components",
    title: "shadcn payment components",
    seoTitle: "shadcn Payment Components for Checkout, Credits, and Feature Gates",
    description:
      "Install payment UI into your own codebase: balances, purchase dialogs, wallet recovery, credit gates, and feature gates for developer products.",
    eyebrow: "Payment UI",
    intent:
      "For shadcn users who want billing UI that can be installed, inspected, themed, and changed instead of imported as a black-box widget.",
    updated: "2026-07-07",
    tags: ["shadcn", "Payment components", "React", "Checkout UI"],
    heroBullets: [
      "Install source files from your vantezzen/pay registry.",
      "Keep payment UI consistent with your existing theme.",
      "Compose checkout, wallets, balances, and gates like normal React components.",
    ],
    sections: [
      {
        title: "Why payment UI should live in your app",
        body: "Billing touches the most sensitive parts of a product: pricing, locked states, empty balances, renewals, and support recovery. A hosted widget can be fast, but it often feels bolted on. The shadcn model works better for small developer products because the component source lands in your repository.",
        bullets: [
          "Review the component code before shipping it.",
          "Change copy, layout, and styling to match the product.",
          "Keep checkout prompts close to the feature they unlock.",
          "Avoid building balance displays and purchase dialogs from scratch.",
        ],
      },
      {
        title: "The core vantezzen/pay components",
        body: "The registry gives you the common payment UI pieces most small apps need. They can be used together for a complete flow or separately when you want custom screens.",
        bullets: [
          "PayProvider loads wallet state and resumes checkout confirmation.",
          "RemainingCredits shows a live balance for the current wallet.",
          "PurchaseButton and PurchaseDialog list offers and start checkout.",
          "CreditGate renders paid UI only when enough credits exist.",
          "FeatureGate renders UI only when a subscription, one-time purchase, or grant unlocks it.",
          "WalletButton lets users copy, restore, transfer, and manage a wallet.",
        ],
      },
      {
        title: "A simple paid action",
        body: "For a credit-based action, put the provider around the paid part of the app, show the balance, then gate the action by the number of credits it costs.",
        code: `<PayProvider publishableKey={publishableKey}>
  <div className="flex items-center gap-3">
    <RemainingCredits productSlug="video-minutes" />
    <WalletButton />
  </div>

  <CreditGate productSlug="video-minutes" cost={10}>
    <Button onClick={() => deduct(10)}>
      Process video
    </Button>
  </CreditGate>
</PayProvider>`,
      },
      {
        title: "SEO benefit of component-led docs",
        body: "Each component maps to a real search problem: payment component, purchase dialog, credit gate, feature gate, wallet recovery, and checkout UI. The docs should stay implementation-focused so searchers and AI systems can understand exactly what vantezzen/pay provides.",
        bullets: [
          "Use descriptive page titles rather than internal package names alone.",
          "Show one complete example per component page.",
          "Link every component back to the guide for billing for side projects.",
          "Keep copy explicit: shadcn payment components, checkout, credits, wallets, and feature gates.",
        ],
      },
    ],
    faqs: [
      {
        question: "Are these npm components?",
        answer:
          "No. They follow the shadcn registry model: source files are copied into your app so you can inspect and change them.",
      },
      {
        question: "Can I use custom UI instead?",
        answer:
          "Yes. The components use the same vantezzen/pay client and API you can call directly for fully custom screens.",
      },
      {
        question: "Do the components replace Stripe Checkout?",
        answer:
          "No. They start provider checkout and render app-side billing UI. Stripe or Polar still handles the payment page.",
      },
    ],
    cta: {
      title: "Install the payment UI you will actually own",
      body: "Use the registry components for the default flow, then edit the source when your product needs a different shape.",
    },
  },
  {
    type: "guide",
    slug: "self-hosted-payment-layer",
    title: "Self-hosted payment layer",
    seoTitle: "Self-Hosted Payment Layer for Stripe, Polar, Checkout, and Webhooks",
    description:
      "Run one small payment layer for all your side projects while Stripe or Polar keeps handling checkout, invoices, taxes, and payment methods.",
    eyebrow: "Self-hosted billing",
    intent:
      "For developers who want payment infrastructure they can run, inspect, and reuse across multiple apps.",
    updated: "2026-07-07",
    tags: ["Self-hosted", "Stripe", "Polar", "Postgres", "Webhooks"],
    heroBullets: [
      "One Next.js app and one Postgres database.",
      "Provider webhooks verified in one place.",
      "Projects, products, wallets, and orders managed from one dashboard.",
    ],
    sections: [
      {
        title: "What self-hosting buys you",
        body: "A self-hosted payment layer lets you keep the app-facing billing state close to your projects. You still outsource payment complexity to Stripe or Polar, but you own the bridge between provider events and product access.",
        bullets: [
          "Use your own domain for dashboard, API, pay routes, and registry files.",
          "Keep provider keys encrypted in your deployment.",
          "Share one deployment across many small tools.",
          "Inspect the data model and operational behavior directly.",
        ],
      },
      {
        title: "What vantezzen/pay runs",
        body: "vantezzen/pay is a small billing service, not a payment processor. It runs the dashboard, public API, checkout creation, webhook ingestion, wallet ledger, product catalog, and shadcn registry.",
        bullets: [
          "Dashboard pages for projects, providers, products, prices, orders, wallets, and webhooks.",
          "Public client APIs for wallets, checkout, credits, and feature access.",
          "Webhook routes for Stripe and Polar provider accounts.",
          "Registry files for installing app-side components.",
        ],
      },
      {
        title: "Recommended deployment model",
        body: "Use a boring deployment. The product sits in the payment path, so predictable infrastructure matters more than novelty.",
        bullets: [
          "Deploy the Next.js app to a platform that can run server routes.",
          "Use managed Postgres from a provider you already trust.",
          "Set a stable public URL before configuring provider webhooks.",
          "Monitor webhook failures and keep provider dashboards as the money source of truth.",
        ],
      },
      {
        title: "The app integration stays small",
        body: "Each project only needs its publishable key, allowed origins, installed components, and the paid actions that call vantezzen/pay. The provider wiring stays inside the shared payment layer.",
        code: `npx shadcn@latest add https://pay.example.com/r/pay-client.json
npx shadcn@latest add https://pay.example.com/r/pay-provider.json
npx shadcn@latest add https://pay.example.com/r/pay-credits.json`,
      },
    ],
    faqs: [
      {
        question: "Does self-hosting mean I handle card data?",
        answer:
          "No. Checkout still happens with Stripe or Polar. vantezzen/pay stores app-facing billing state and provider references, not card details.",
      },
      {
        question: "Can one vantezzen/pay deployment power multiple projects?",
        answer:
          "Yes. A project maps to one app and has its own API keys, products, prices, and allowed origins.",
      },
      {
        question: "Do I need a dedicated Stripe or Polar account?",
        answer:
          "A dedicated provider account is recommended when possible because vantezzen/pay manages catalog objects and webhooks for the connected account.",
      },
    ],
    cta: {
      title: "Run billing once, reuse it everywhere",
      body: "Deploy vantezzen/pay on your domain, connect a provider, then plug each new side project into the same payment layer.",
    },
  },
];

export const comparisons: MarketingPage[] = [
  {
    type: "comparison",
    slug: "stripe-vs-vantezzen-pay",
    title: "Stripe vs vantezzen/pay",
    seoTitle: "Stripe vs vantezzen/pay: Payment Provider vs Side Project Billing Layer",
    description:
      "Stripe processes payments. vantezzen/pay adds the small app-facing billing layer side projects still need: wallets, gates, checkout UI, webhook fulfillment, and support tools.",
    eyebrow: "Comparison",
    intent:
      "For developers deciding whether using Stripe directly is enough for a small paid tool.",
    updated: "2026-07-07",
    tags: ["Stripe", "Billing layer", "Checkout", "Credits"],
    heroBullets: [
      "Use Stripe for payments, invoices, cards, taxes, and subscriptions.",
      "Use vantezzen/pay for product access, wallets, credit spending, gates, and app UI.",
      "The comparison is not either/or. vantezzen/pay sits on top of Stripe.",
    ],
    sections: [
      {
        title: "The short answer",
        body: "Stripe is the payment provider. vantezzen/pay is the billing microservice that makes Stripe easy to reuse inside small products. If you only need a checkout link, Stripe may be enough. If your app needs to know what the user can spend or access after checkout, you still need an app-facing layer.",
        bullets: [
          "Stripe is excellent at charging customers and managing provider-side billing objects.",
          "vantezzen/pay handles the product-specific state your app needs after a payment succeeds.",
          "Most side projects do not want to write that same glue code again and again.",
        ],
      },
      {
        title: "Where Stripe is the source of truth",
        body: "Keep Stripe responsible for the things payment providers are built for.",
        bullets: [
          "Payment methods and hosted checkout.",
          "Invoices, receipts, customer billing records, and tax behavior.",
          "Subscription billing and provider-side refund flows.",
          "Provider webhooks that describe payment events.",
        ],
      },
      {
        title: "Where vantezzen/pay fits",
        body: "vantezzen/pay turns provider events into product access your app can use immediately.",
        bullets: [
          "Credit wallets and retry-safe usage deductions.",
          "Anonymous recovery codes for projects without login.",
          "Feature gates for subscriptions and one-time purchases.",
          "Drop-in shadcn components for balances, purchases, wallet recovery, and gates.",
          "A small dashboard for orders, wallets, provider events, and support adjustments.",
        ],
      },
      {
        title: "Use Stripe directly when",
        body: "Direct Stripe integration is a good choice when billing is central enough to justify owning all the glue code or simple enough that no glue code exists.",
        bullets: [
          "You only sell one subscription and already have user accounts.",
          "You want full custom billing flows and have time to maintain them.",
          "You need deep Stripe-specific behavior that should not be abstracted.",
        ],
      },
      {
        title: "Use vantezzen/pay with Stripe when",
        body: "vantezzen/pay is useful when billing is necessary but not the product you want to spend your week building.",
        bullets: [
          "You ship multiple small tools and want one reusable payment layer.",
          "You sell credits, usage packs, feature unlocks, or small subscriptions.",
          "You want no-auth monetization through anonymous wallets.",
          "You want shadcn payment components that match your app.",
        ],
      },
    ],
    faqs: [
      {
        question: "Does vantezzen/pay replace Stripe Billing?",
        answer:
          "No. vantezzen/pay uses Stripe as the provider and keeps Stripe responsible for provider-side billing. vantezzen/pay handles the app-facing layer around it.",
      },
      {
        question: "Why not just build this with Stripe webhooks?",
        answer:
          "You can. vantezzen/pay exists because every side project otherwise repeats the same webhook fulfillment, wallet state, access checks, purchase UI, support adjustments, and recovery flows.",
      },
      {
        question: "Can I switch providers later?",
        answer:
          "vantezzen/pay supports Stripe and Polar as providers. Your app integrates with vantezzen/pay instead of hard-coding every provider detail into product UI.",
      },
    ],
    cta: {
      title: "Keep Stripe. Stop rebuilding the layer around it.",
      body: "Connect Stripe to vantezzen/pay, then let each project talk to the same small billing API and component set.",
    },
  },
  {
    type: "comparison",
    slug: "build-vs-vantezzen-pay",
    title: "Build billing yourself vs vantezzen/pay",
    seoTitle: "Build Billing Yourself vs vantezzen/pay for Side Projects",
    description:
      "A practical comparison of custom billing glue code versus using vantezzen/pay as the reusable billing microservice for small developer products.",
    eyebrow: "Comparison",
    intent:
      "For developers weighing a custom billing integration against a reusable side project billing layer.",
    updated: "2026-07-07",
    tags: ["Build vs buy", "Side projects", "Billing infrastructure"],
    heroBullets: [
      "Custom billing gives maximum control.",
      "vantezzen/pay gives a complete small-product path faster.",
      "The tradeoff is not ideology. It is maintenance surface.",
    ],
    sections: [
      {
        title: "What you build when you build billing",
        body: "The checkout call is usually the easy part. The long tail is the system around it: product catalog, webhook correctness, access state, UI states, refunds, subscriptions, recovery, and support tooling.",
        bullets: [
          "Provider setup and catalog synchronization.",
          "Checkout creation and return/cancel handling.",
          "Verified webhook ingestion with idempotent fulfillment.",
          "Wallet or entitlement storage.",
          "Balance, purchase, and locked-state UI.",
          "Manual support grants, refund handling, and audit history.",
        ],
      },
      {
        title: "When building it yourself is right",
        body: "Custom billing makes sense when billing is a core product differentiator, your flows are unusual, or you already have the team and testing discipline to own payment-adjacent infrastructure.",
        bullets: [
          "The product has complex account, team, contract, or enterprise billing needs.",
          "You need provider-specific features exposed directly in product UX.",
          "You can afford to test and maintain payment edge cases over time.",
        ],
      },
      {
        title: "When vantezzen/pay is right",
        body: "vantezzen/pay is for the common small-product case: charging is necessary, but billing is not the thing users came for.",
        bullets: [
          "The project is useful enough to charge for, but small enough that billing would dominate the build.",
          "You want credits, one-time feature unlocks, subscriptions, or a simple mix of all three.",
          "You want to reuse one payment layer across several tools.",
          "You want the default UI now and the source code in your app when you need to customize.",
        ],
      },
      {
        title: "The maintenance difference",
        body: "The real cost of billing is not the first integration. It is remembering how every old project handles renewals, refunds, failed webhooks, balance fixes, and customer recovery six months later.",
        bullets: [
          "Custom integrations create one-off operational behavior per project.",
          "vantezzen/pay centralizes those behaviors in one small service.",
          "Each new project gets the same payment path instead of another bespoke integration.",
        ],
      },
    ],
    faqs: [
      {
        question: "Is vantezzen/pay only for prototypes?",
        answer:
          "No. The code should be treated as production billing infrastructure. The product focus is small developer products, not throwaway demos.",
      },
      {
        question: "What do I lose by not building from scratch?",
        answer:
          "You accept vantezzen/pay's product model: projects, products, prices, wallets, credits, features, and provider accounts. If your billing model does not fit those concepts, custom work may be better.",
      },
      {
        question: "Can I still customize the UI?",
        answer:
          "Yes. The payment components are installed into your codebase through the registry, so you can adjust the source instead of styling a remote widget from the outside.",
      },
    ],
    cta: {
      title: "Spend custom work where users notice it",
      body: "Use vantezzen/pay for the recurring billing plumbing and keep your custom engineering time for the product itself.",
    },
  },
];

export const marketingPages = [...guides, ...comparisons];

export function getMarketingPage(type: MarketingPageType, slug: string) {
  const pages = type === "guide" ? guides : comparisons;
  return pages.find((page) => page.slug === slug);
}

export function marketingPath(page: Pick<MarketingPage, "type" | "slug">) {
  return `/${page.type === "guide" ? "guides" : "compare"}/${page.slug}`;
}
