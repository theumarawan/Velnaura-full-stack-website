import Link from "next/link";
import { requireUser } from "@/server/auth/guards";
import { ProfileForm } from "@/components/auth/profile-form";
import { signOut } from "@/auth";
export const dynamic = "force-dynamic";
export default async function AccountPage() {
  // Recheck at the data boundary as layouts alone do not protect server actions/APIs.
  const user = await requireUser();
  return <main className="account-page"><header className="site-header"><Link href="/" className="wordmark">velnaura<span>®</span></Link>
    <form action={async () => { "use server"; await signOut({ redirectTo: "/" }); }}><button className="text-button">Sign out ↗</button></form></header>
    <section className="account-intro"><span className="eyebrow">Your own little corner</span><h1>Welcome, {user.name?.split(" ")[0] ?? "you"}.</h1><p>A little care, all in one place.</p></section>
    <div className="account-grid"><section className="account-card"><span className="eyebrow">01 / The essentials</span><h2>Your profile</h2><ProfileForm name={user.name} email={user.email} /></section>
    <div className="account-secondary"><section className="account-card"><span className="eyebrow">02 / Your ritual, delivered</span><h2>Order History</h2><p>Your order history will be available here when shopping launches.</p></section>
    <section className="account-card"><span className="eyebrow">03 / Where care finds you</span><h2>Saved Addresses</h2><p>Address management is coming with checkout. Your profile is ready for you today.</p></section></div></div>
  </main>;
}
