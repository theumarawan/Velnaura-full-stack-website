import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return <main className="auth-grid">
    <aside className="brand-panel" aria-label="The Velnaura philosophy">
      <Link href="/" className="wordmark">velnaura<span>®</span></Link>
      <div className="brand-story"><span className="eyebrow">A little care. A daily delight.</span>
        <h1>Serious Science.<br /><em>Delightful Delivery.</em></h1>
        <p>Thoughtful skincare. Small moments of joy. Make room for a ritual that feels like you.</p>
      </div>
      <div className="brand-foot"><span>Considered care, from the first cleanse.</span><span>EST. VELNAURA</span></div>
    </aside>
    <section className="form-panel"><div className="form-wrap">
      <Link href="/" className="back-link">← Back to Velnaura</Link>
      <span className="eyebrow">Your daily ritual starts here</span>
      <h2>{title}</h2><p className="intro">{intro}</p>
      {children}
      <p className="guest-link"><Link href="/">Continue as guest <span aria-hidden="true">↗</span></Link></p>
    </div></section>
  </main>;
}
