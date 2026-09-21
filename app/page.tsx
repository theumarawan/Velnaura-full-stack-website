import Link from "next/link";
export const metadata = { title: "Velnaura · Serious Science, Delightful Delivery" };
export default function HomePage() {
  return <main className="public-home"><Link href="/" className="wordmark">velnaura<span>®</span></Link>
    <span className="eyebrow">Thoughtful skincare. Everyday delight.</span><h1>Serious Science.<br /><em>Delightful Delivery.</em></h1>
    <p>Welcome to Velnaura. Start your own little ritual with an account, or make yourself at home as a guest.</p>
    <div className="public-actions"><Link className="button" href="/signup">Create an account ↗</Link><Link href="/login">Already part of the ritual? Sign in</Link></div>
    <p className="guest-note">You’re welcome here without an account. Shopping and guest checkout are coming next.</p>
  </main>;
}
